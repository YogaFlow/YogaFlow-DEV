import { assertEquals } from "jsr:@std/assert@1";
import {
  authorizeOps,
  buildAlertMail,
  runOpsMonitor,
  timingSafeEqual,
  type OpsDeps,
  type OpsFinding,
  type OpsStore,
} from "./handler.ts";

function fakeLog() {
  const lines: { level: string; msg: string }[] = [];
  return {
    lines,
    log: {
      info: (msg: string) => lines.push({ level: "info", msg }),
      warn: (msg: string) => lines.push({ level: "warn", msg }),
      error: (msg: string) => lines.push({ level: "error", msg }),
    },
  };
}

Deno.test("timingSafeEqual", () => {
  assertEquals(timingSafeEqual("abc", "abc"), true);
  assertEquals(timingSafeEqual("abc", "abd"), false);
});

Deno.test("authorizeOps Bearer", () => {
  const ok = new Request("http://local/ops", {
    method: "POST",
    headers: { Authorization: "Bearer secret1" },
  });
  assertEquals(authorizeOps(ok, "secret1"), true);
  assertEquals(authorizeOps(ok, "other"), false);
  assertEquals(authorizeOps(new Request("http://local"), "secret1"), false);
});

Deno.test("buildAlertMail Entprellen-Inhalte", () => {
  const mail = buildAlertMail({
    notify: [{ key: "a:x", slug: "a", kind: "provider_jobs", count: 2, event: "new" }],
    resolved: [{ key: "b:y" }],
    isDev: true,
  });
  assertEquals(mail?.subject, "[Omlify DEV] Überwachung: 2 Punkte");
  assertEquals(mail?.html.includes("a: provider_jobs"), true);
  assertEquals(mail?.html.includes("erledigt: b:y"), true);
  assertEquals(mail?.html.includes("Überwachung"), true);
  assertEquals(mail?.html.includes("Gesendet über Omlify"), true);
  assertEquals(mail?.text?.includes("provider_jobs"), true);
});

Deno.test("runOpsMonitor: fehlendes Secret → NOT_CONFIGURED, kein Mail", async () => {
  const { log, lines } = fakeLog();
  const findings: OpsFinding[] = [
    { key: "demo:provider_jobs", slug: "demo", kind: "provider_jobs", count: 1 },
  ];
  let mailed = 0;
  const store: OpsStore = {
    retryMissingReceipts: async () => {},
    collect: async () => findings,
    apply: async () => ({
      notify: findings.map((f) => ({ ...f, event: "new" })),
      resolved: [],
    }),
  };
  const deps: OpsDeps = {
    env: () => undefined,
    log: log as OpsDeps["log"],
    store,
    sendMail: async () => {
      mailed += 1;
    },
  };
  const out = await runOpsMonitor(deps);
  assertEquals(out.mailed, false);
  assertEquals(mailed, 0);
  assertEquals(lines.some((l) => l.msg.includes("NOT_CONFIGURED")), true);
});

Deno.test("runOpsMonitor: erste Mail, Heartbeat nur wenn gesetzt", async () => {
  const { log } = fakeLog();
  const findings: OpsFinding[] = [
    { key: "demo:refunds_failed", slug: "demo", kind: "refunds_failed", count: 1 },
  ];
  let mails = 0;
  let beats = 0;
  const store: OpsStore = {
    retryMissingReceipts: async () => {},
    collect: async () => findings,
    apply: async () => ({
      notify: findings.map((f) => ({ ...f, event: "new" })),
      resolved: [],
    }),
  };
  const deps: OpsDeps = {
    env: (k) => {
      if (k === "OPS_ALERT_EMAIL") return "ops@example.com";
      if (k === "OPS_HEARTBEAT_URL") return "https://example.test/hb";
      return undefined;
    },
    log: log as OpsDeps["log"],
    store,
    appEnv: "dev",
    sendMail: async () => {
      mails += 1;
    },
    fetchHeartbeat: async () => {
      beats += 1;
    },
  };
  const out = await runOpsMonitor(deps);
  assertEquals(out.mailed, true);
  assertEquals(mails, 1);
  assertEquals(beats, 1);
});

Deno.test("runOpsMonitor: ohne notify keine Mail, Heartbeat trotzdem", async () => {
  const { log } = fakeLog();
  let mails = 0;
  let beats = 0;
  const store: OpsStore = {
    retryMissingReceipts: async () => {},
    collect: async () => [],
    apply: async () => ({ notify: [], resolved: [] }),
  };
  const deps: OpsDeps = {
    env: (k) => {
      if (k === "OPS_ALERT_EMAIL") return "ops@example.com";
      if (k === "OPS_HEARTBEAT_URL") return "https://example.test/hb";
      return undefined;
    },
    log: log as OpsDeps["log"],
    store,
    sendMail: async () => {
      mails += 1;
    },
    fetchHeartbeat: async () => {
      beats += 1;
    },
  };
  const out = await runOpsMonitor(deps);
  assertEquals(out.mailed, false);
  assertEquals(mails, 0);
  assertEquals(beats, 1);
});
