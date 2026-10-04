/**
 * ops-monitor — B2 Überwachung (U1–U7).
 * verify_jwt = false; Authorization: Bearer <OPS_MONITOR_SECRET>
 * Zählt nur; Mail nur über send-email (EMAIL_REDIRECT_TO).
 * UX-2 B1: gemeinsame E-Mail-Hülle (kompakt).
 */
import { createServiceLogger, type ServiceLogger } from "../_shared/service.ts";
import { escapeHtml, renderEmailShell } from "../_shared/email_template.ts";

export const SECRET_ENV = "OPS_MONITOR_SECRET";

export type OpsFinding = {
  key: string;
  slug: string;
  kind: string;
  count: number;
  event?: string;
};

export interface OpsStore {
  retryMissingReceipts(): Promise<unknown>;
  collect(): Promise<OpsFinding[]>;
  apply(findings: OpsFinding[]): Promise<{ notify: OpsFinding[]; resolved: { key: string }[] }>;
}

export type OpsDeps = {
  env: (key: string) => string | undefined;
  log: ServiceLogger;
  store: OpsStore;
  sendMail: (input: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
  fetchHeartbeat?: (url: string) => Promise<void>;
  appEnv?: string;
};

const encoder = new TextEncoder();

export function timingSafeEqual(a: string, b: string): boolean {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function readBearerSecret(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1]?.trim() || null;
}

export function authorizeOps(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const got = readBearerSecret(req);
  if (!got) return false;
  return timingSafeEqual(got, expected);
}

export function buildAlertMail(input: {
  notify: OpsFinding[];
  resolved: { key: string }[];
  isDev: boolean;
}): { subject: string; html: string; text: string } | null {
  const n = input.notify.length + input.resolved.length;
  if (n === 0) return null;
  const prefix = input.isDev ? "[Omlify DEV]" : "[Omlify]";
  const subject = `${prefix} Überwachung: ${n} Punkte`;
  const lines: string[] = [];
  for (const f of input.notify) {
    lines.push(`• ${f.slug}: ${f.kind} (${f.count})`);
  }
  for (const r of input.resolved) {
    lines.push(`• erledigt: ${r.key}`);
  }
  const bodyHtml = `
    <p style="margin:0 0 12px 0;">Überwachung — nur Zählwerte, keine Personen/Beträge.</p>
    <ul style="margin:0;padding-left:20px;">${
      lines.map((l) => `<li style="margin:0 0 6px 0;">${escapeHtml(l)}</li>`).join("")
    }</ul>`;
  const textBody = [
    "Überwachung — nur Zählwerte, keine Personen/Beträge.",
    ...lines,
  ].join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: subject,
      studioName: "Omlify",
      brandColor: "#2F5A4E",
      title: "Überwachung",
      bodyHtml,
      shorter: true,
    },
    textBody,
  );
  return { subject, html, text };
}

export async function runOpsMonitor(deps: OpsDeps): Promise<{
  code: string;
  findings: number;
  mailed: boolean;
}> {
  await deps.store.retryMissingReceipts();
  const findings = await deps.store.collect();
  const applied = await deps.store.apply(findings);

  const alertEmail = deps.env("OPS_ALERT_EMAIL")?.trim();
  let mailed = false;
  if (!alertEmail) {
    deps.log.warn("ops-monitor NOT_CONFIGURED");
  } else {
    const isDev = (deps.appEnv ?? deps.env("APP_ENV") ?? "dev") !== "prod";
    const mail = buildAlertMail({
      notify: applied.notify,
      resolved: applied.resolved,
      isDev,
    });
    if (mail) {
      await deps.sendMail({
        to: alertEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      mailed = true;
      deps.log.info("ops-monitor mail", {
        notify: applied.notify.length,
        resolved: applied.resolved.length,
      });
    }
  }

  const heartbeat = deps.env("OPS_HEARTBEAT_URL")?.trim();
  if (heartbeat && deps.fetchHeartbeat) {
    try {
      await deps.fetchHeartbeat(heartbeat);
    } catch {
      deps.log.warn("ops-monitor heartbeat failed");
    }
  }

  return { code: "OK", findings: findings.length, mailed };
}

export async function handleOpsRequest(
  req: Request,
  deps: OpsDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authorizeOps(req, deps.env(SECRET_ENV))) {
    deps.log.warn("ops-monitor unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const out = await runOpsMonitor(deps);
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function createDefaultLog(): ServiceLogger {
  return createServiceLogger();
}
