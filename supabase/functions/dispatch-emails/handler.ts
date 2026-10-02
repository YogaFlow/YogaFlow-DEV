/**
 * dispatch-emails — Outbox-Versand (2.1b-b B2 / S6e–S6d / 2.2a-4b J10).
 *
 * verify_jwt = false; Aufruf nur mit Header X-Email-Dispatch-Secret
 * (= EMAIL_DISPATCH_SECRET). Holt claim_email_deliveries (max. 20),
 * prüft je kind, baut HTML, sendet über send-email.
 *
 * kinds: waitlist_promoted_payment_required | payment_succeeded | payment_refunded
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
  /** Betrag der (Original-)Zahlung in Cent; für payment_succeeded. */
  amountCents: number | null;
  /** Erstattungsbetrag in Cent (payment_refunded). */
  refundAmountCents: number | null;
  /** Originalbetrag für Teilerstattung-Text. */
  originalAmountCents: number | null;
  /** payment_refunds.reason */
  refundReason: string | null;
  /** Es existiert eine Erstattungszeile (reverses_payment_id). */
  hasRefund: boolean;
  /** Event payment.refund_required zum Original — Platz war vergeben (Fallback). */
  refundRequired: boolean;
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
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

function courseTimeText(timeStr: string | null): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

/** 2400 → „24,00 €“ */
export function formatEurCents(cents: number): string {
  const n = (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
  return `${n} €`;
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

export function buildPaymentSucceededEmail(input: {
  courseTitle: string;
  courseDate: string;
  courseTime: string;
  studioName: string;
  amountLabel: string;
  link: string;
}): { subject: string; html: string } {
  const subject = "Zahlung eingegangen – dein Platz ist sicher";
  const html = `<!DOCTYPE html>
<html lang="de">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background:#F5F3EF;font-family:system-ui,sans-serif;">
    <div style="max-width:560px;margin:24px auto;padding:24px;background:#ffffff;border-radius:8px;">
      <p style="margin:0 0 12px 0;color:#2F5A4E;font-size:14px;">${escapeHtml(input.studioName)}</p>
      <h1 style="margin:0 0 16px 0;color:#111827;font-size:20px;line-height:1.3;">
        Zahlung eingegangen
      </h1>
      <p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:1.5;">
        Deine Zahlung über <strong>${escapeHtml(input.amountLabel)}</strong> für
        „${escapeHtml(input.courseTitle)}“ am ${escapeHtml(input.courseDate)} um
        ${escapeHtml(input.courseTime)} ist eingegangen. Dein Platz ist gebucht.
      </p>
      <p style="margin:0 0 24px 0;">
        <a href="${escapeHtml(input.link)}"
           style="display:inline-block;padding:12px 18px;background-color:#2F5A4E;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">
          Meine Anmeldungen
        </a>
      </p>
    </div>
  </body>
</html>`;
  return { subject, html };
}

export function buildPaymentRefundedEmail(input: {
  courseTitle: string;
  courseDate: string;
  studioName: string;
  refundAmountCents: number;
  originalAmountCents: number | null;
  reason: string | null;
}): { subject: string; html: string } {
  const subject = "Zahlung erstattet";
  const refundLabel = formatEurCents(input.refundAmountCents);
  const original = input.originalAmountCents;
  const isPartial = original != null && original > input.refundAmountCents;
  const amountSentence = isPartial
    ? `Wir haben dir ${escapeHtml(refundLabel)} von ${escapeHtml(formatEurCents(original!))} erstattet.`
    : `Wir haben dir ${escapeHtml(refundLabel)} für „${escapeHtml(input.courseTitle)}“ am ${escapeHtml(input.courseDate)} erstattet.`;

  const reasonLine = refundReasonSentence(input.reason);
  const reasonHtml = reasonLine
    ? `<p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:1.5;">${escapeHtml(reasonLine)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="de">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background:#F5F3EF;font-family:system-ui,sans-serif;">
    <div style="max-width:560px;margin:24px auto;padding:24px;background:#ffffff;border-radius:8px;">
      <p style="margin:0 0 12px 0;color:#2F5A4E;font-size:14px;">${escapeHtml(input.studioName)}</p>
      <h1 style="margin:0 0 16px 0;color:#111827;font-size:20px;line-height:1.3;">
        Zahlung erstattet
      </h1>
      ${reasonHtml}
      <p style="margin:0 0 16px 0;color:#374151;font-size:16px;line-height:1.5;">
        ${amountSentence}
      </p>
      <p style="margin:0;color:#374151;font-size:16px;line-height:1.5;">
        Je nach Bank dauert die Gutschrift einige Werktage.
      </p>
    </div>
  </body>
</html>`;
  return { subject, html };
}

/** E5: Grund-Satz je reason; manual/provider_dashboard ohne Satz. */
export function refundReasonSentence(reason: string | null | undefined): string | null {
  switch (reason) {
    case "course_cancelled":
      return "Der Kurs wurde abgesagt.";
    case "self_cancel_in_window":
      return "Du hast dich rechtzeitig abgemeldet.";
    case "staff_unregister":
    case "member_removed":
      return "Das Studio hat deine Anmeldung storniert.";
    case "late_payment":
      return "Dein Platz war leider inzwischen vergeben.";
    default:
      return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recipientGone(ctx: DeliveryContext | null): boolean {
  if (!ctx) return true;
  if (ctx.anonymizedAt != null || ctx.authUserId == null) return true;
  if (!ctx.recipientEmail || !ctx.recipientEmail.trim()) return true;
  return false;
}

/** S6d: Promotion vor dem Versand. */
export function classifyDelivery(
  ctx: DeliveryContext | null,
): "ok" | "NOT_PENDING" | "RECIPIENT_GONE" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  if (ctx!.registrationStatus !== "pending_payment") return "NOT_PENDING";
  return "ok";
}

/** J10: payment_succeeded. */
export function classifyPaymentSucceeded(
  ctx: DeliveryContext | null,
): "ok" | "RECIPIENT_GONE" | "NOT_REGISTERED" | "ALREADY_REFUNDED" | "AMOUNT_MISSING" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  const status = ctx!.registrationStatus;
  if (status !== "registered" && status !== "paid") return "NOT_REGISTERED";
  if (ctx!.hasRefund) return "ALREADY_REFUNDED";
  if (ctx!.amountCents == null || ctx!.amountCents <= 0) return "AMOUNT_MISSING";
  return "ok";
}

/** J10: payment_refunded. */
export function classifyPaymentRefunded(
  ctx: DeliveryContext | null,
): "ok" | "RECIPIENT_GONE" | "REFUND_MISSING" | "AMOUNT_MISSING" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  if (!ctx!.hasRefund) return "REFUND_MISSING";
  const amount = ctx!.refundAmountCents ?? ctx!.amountCents;
  if (amount == null || amount <= 0) return "AMOUNT_MISSING";
  return "ok";
}

export async function runDispatch(deps: DispatchDeps): Promise<DispatchResult> {
  const rows = await deps.claimDeliveries(DISPATCH_LIMIT);
  const results: DispatchResult["results"] = [];

  for (const row of rows) {
    const ctx = await deps.loadContext(row.registration_id);

    if (row.kind === "waitlist_promoted_payment_required") {
      const gate = classifyDelivery(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      const courseDate = courseDateText(ctx!.courseDate);
      const courseTime = courseTimeText(ctx!.courseTime);
      const holdIso = ctx!.holdExpiresAt ?? new Date().toISOString();
      const link = buildMyRegistrationsLink(ctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      const { subject, html } = buildPromotionEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate,
        courseTime,
        studioName: ctx!.studioName ?? "Studio",
        holdExpiresAt: holdIso,
        link,
      });
      const sent = await deps.sendEmail({ to: ctx!.recipientEmail!.trim(), subject, html });
      if (!sent.ok) {
        await deps.markDelivery(row.id, "failed", sent.errorCode);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: sent.errorCode });
        results.push({ deliveryId: row.id, kind: row.kind, code: sent.errorCode });
        continue;
      }
      await deps.markDelivery(row.id, "sent", null);
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "SENT" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "SENT" });
      continue;
    }

    if (row.kind === "payment_succeeded") {
      const gate = classifyPaymentSucceeded(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      const link = buildMyRegistrationsLink(ctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      const { subject, html } = buildPaymentSucceededEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate: courseDateText(ctx!.courseDate),
        courseTime: courseTimeText(ctx!.courseTime),
        studioName: ctx!.studioName ?? "Studio",
        amountLabel: formatEurCents(ctx!.amountCents!),
        link,
      });
      const sent = await deps.sendEmail({ to: ctx!.recipientEmail!.trim(), subject, html });
      if (!sent.ok) {
        await deps.markDelivery(row.id, "failed", sent.errorCode);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: sent.errorCode });
        results.push({ deliveryId: row.id, kind: row.kind, code: sent.errorCode });
        continue;
      }
      await deps.markDelivery(row.id, "sent", null);
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "SENT" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "SENT" });
      continue;
    }

    if (row.kind === "payment_refunded") {
      const gate = classifyPaymentRefunded(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      const refundCents = ctx!.refundAmountCents ?? ctx!.amountCents!;
      const reason = ctx!.refundReason ??
        (ctx!.refundRequired ? "late_payment" : null);
      const { subject, html } = buildPaymentRefundedEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate: courseDateText(ctx!.courseDate),
        studioName: ctx!.studioName ?? "Studio",
        refundAmountCents: refundCents,
        originalAmountCents: ctx!.originalAmountCents,
        reason,
      });
      const sent = await deps.sendEmail({ to: ctx!.recipientEmail!.trim(), subject, html });
      if (!sent.ok) {
        await deps.markDelivery(row.id, "failed", sent.errorCode);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: sent.errorCode });
        results.push({ deliveryId: row.id, kind: row.kind, code: sent.errorCode });
        continue;
      }
      await deps.markDelivery(row.id, "sent", null);
      deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "SENT" });
      results.push({ deliveryId: row.id, kind: row.kind, code: "SENT" });
      continue;
    }

    await deps.markDelivery(row.id, "skipped", "UNKNOWN_KIND");
    deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
    results.push({ deliveryId: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
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
