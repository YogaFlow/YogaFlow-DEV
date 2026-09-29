/**
 * dispatch-emails — Outbox-Versand (2.1b-b B2 / S6e–S6d).
 *
 * verify_jwt = false; Aufruf nur mit Header X-Email-Dispatch-Secret
 * (= EMAIL_DISPATCH_SECRET). Holt claim_email_deliveries (max. 20),
 * prüft S6d, baut HTML, sendet über send-email.
 *
 * Logs: delivery_id, kind, Ergebnis-Code — nie Adresse oder Inhalt.
 */
import { createServiceLogger, type ServiceLogger } from "../_shared/service.ts";

export const DISPATCH_LIMIT = 20;
export const SECRET_HEADER = "X-Email-Dispatch-Secret";

export type DeliveryRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  kind: string;
  registration_id: string;
  status: string;
  attempts: number;
};

export type DeliveryContext = {
  registrationStatus: string | null;
  holdExpiresAt: string | null;
  courseTitle: string | null;
  courseDate: string | null;
  courseTime: string | null;
  studioName: string | null;
  studioSlug: string | null;
  recipientEmail: string | null;
  anonymizedAt: string | null;
  authUserId: string | null;
};

export type DispatchDeps = {
  env: (key: string) => string | undefined;
  log: ServiceLogger;
  claimDeliveries: (limit: number) => Promise<DeliveryRow[]>;
  loadContext: (registrationId: string) => Promise<DeliveryContext | null>;
  markDelivery: (
    id: string,
    status: "sent" | "skipped" | "failed",
    errorCode?: string | null,
  ) => Promise<void>;
  sendEmail: (input: {
    to: string;
    subject: string;
    html: string;
  }) => Promise<{ ok: true } | { ok: false; errorCode: string }>;
  now?: () => Date;
};

export type DispatchResult = {
  processed: number;
  results: { deliveryId: string; kind: string; code: string }[];
};

function berlinParts(iso: string | Date): { date: string; time: string } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${g("day")}.${g("month")}.${g("year")}`,
    time: `${g("hour")}:${g("minute")}`,
  };
}

function courseDateText(dateStr: string | null): string {
  if (!dateStr) return "";
  // courses.date = "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

function courseTimeText(timeStr: string | null): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

export function buildMyRegistrationsLink(
  slug: string | null,
  baseDomain: string | undefined,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/my-registrations`;
  if (domain) return `https://${domain}/my-registrations`;
  return "/my-registrations";
}

export function buildPromotionEmail(input: {
  courseTitle: string;
  courseDate: string;
  courseTime: string;
  studioName: string;
  holdExpiresAt: string;
  link: string;
}): { subject: string; html: string } {
  const hold = berlinParts(input.holdExpiresAt);
  const subject =
    `Du bist nachgerückt: ${input.courseTitle} am ${input.courseDate}` +
    ` – Platz reserviert bis ${hold.date}, ${hold.time}`;

  const html = `<!DOCTYPE html>
<html lang="de">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background:#F5F3EF;font-family:system-ui,sans-serif;">
    <div style="max-width:560px;margin:24px auto;padding:24px;background:#ffffff;border-radius:8px;">
      <p style="margin:0 0 12px 0;color:#2F5A4E;font-size:14px;">${escapeHtml(input.studioName)}</p>
      <h1 style="margin:0 0 16px 0;color:#111827;font-size:20px;line-height:1.3;">
        Du bist nachgerückt
      </h1>
      <p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:1.5;">
        In <strong>${escapeHtml(input.courseTitle)}</strong> am
        ${escapeHtml(input.courseDate)} um ${escapeHtml(input.courseTime)} Uhr
        ist ein Platz für dich frei geworden.
      </p>
      <p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:1.5;">
        Dein Platz ist bis <strong>${escapeHtml(hold.date)}, ${escapeHtml(hold.time)} Uhr</strong>
        reserviert. Bitte bezahle bis dahin online, sonst geht er an die nächste Person.
      </p>
      <p style="margin:0 0 24px 0;">
        <a href="${escapeHtml(input.link)}"
           style="display:inline-block;padding:12px 18px;background-color:#2F5A4E;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">
          Zu meinen Anmeldungen
        </a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
        Wenn du den Platz nicht mehr brauchst, kannst du dich dort wieder abmelden.
      </p>
    </div>
  </body>
</html>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** S6d: vor dem Versand. */
export function classifyDelivery(
  ctx: DeliveryContext | null,
): "ok" | "NOT_PENDING" | "RECIPIENT_GONE" {
  if (!ctx) return "RECIPIENT_GONE";
  if (ctx.anonymizedAt != null || ctx.authUserId == null) return "RECIPIENT_GONE";
  if (!ctx.recipientEmail || !ctx.recipientEmail.trim()) return "RECIPIENT_GONE";
  if (ctx.registrationStatus !== "pending_payment") return "NOT_PENDING";
  return "ok";
}

export async function runDispatch(deps: DispatchDeps): Promise<DispatchResult> {
  const rows = await deps.claimDeliveries(DISPATCH_LIMIT);
  const results: DispatchResult["results"] = [];

  for (const row of rows) {
    const ctx = await deps.loadContext(row.registration_id);
    const gate = classifyDelivery(ctx);

    if (gate === "NOT_PENDING") {
      await deps.markDelivery(row.id, "skipped", "NOT_PENDING");
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "NOT_PENDING" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "NOT_PENDING" });
      continue;
    }
    if (gate === "RECIPIENT_GONE") {
      await deps.markDelivery(row.id, "skipped", "RECIPIENT_GONE");
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "RECIPIENT_GONE" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "RECIPIENT_GONE" });
      continue;
    }

    if (row.kind !== "waitlist_promoted_payment_required") {
      await deps.markDelivery(row.id, "skipped", "UNKNOWN_KIND");
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
      continue;
    }

    const courseDate = courseDateText(ctx!.courseDate);
    const courseTime = courseTimeText(ctx!.courseTime);
    const holdIso = ctx!.holdExpiresAt ?? new Date().toISOString();
    const link = buildMyRegistrationsLink(
      ctx!.studioSlug,
      deps.env("APP_BASE_DOMAIN"),
    );
    const { subject, html } = buildPromotionEmail({
      courseTitle: ctx!.courseTitle ?? "Kurs",
      courseDate,
      courseTime,
      studioName: ctx!.studioName ?? "Studio",
      holdExpiresAt: holdIso,
      link,
    });

    const sent = await deps.sendEmail({
      to: ctx!.recipientEmail!.trim(),
      subject,
      html,
    });

    if (!sent.ok) {
      await deps.markDelivery(row.id, "failed", sent.errorCode);
      deps.log.info("dispatch", {
        delivery_id: row.id,
        kind: row.kind,
        code: sent.errorCode,
      });
      results.push({ deliveryId: row.id, kind: row.kind, code: sent.errorCode });
      continue;
    }

    await deps.markDelivery(row.id, "sent", null);
    deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "SENT" });
    results.push({ deliveryId: row.id, kind: row.kind, code: "SENT" });
  }

  return { processed: results.length, results };
}

export function authorizeDispatch(
  req: Request,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim()) return false;
  const got = req.headers.get(SECRET_HEADER);
  return got === expectedSecret;
}

export async function handleDispatchRequest(
  req: Request,
  deps: DispatchDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = deps.env("EMAIL_DISPATCH_SECRET");
  if (!authorizeDispatch(req, secret)) {
    deps.log.warn("dispatch unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await runDispatch(deps);
  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function createDefaultLog(): ServiceLogger {
  return createServiceLogger();
}
