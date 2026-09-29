import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import { maskSensitiveText } from "../_shared/mask_sensitive.ts";
import {
  DISPATCH_LIMIT,
  SECRET_HEADER,
  authorizeDispatch,
  buildMyRegistrationsLink,
  buildPromotionEmail,
  classifyDelivery,
  handleDispatchRequest,
  runDispatch,
  type DeliveryContext,
  type DeliveryRow,
  type DispatchDeps,
} from "./handler.ts";

Deno.test("buildMyRegistrationsLink mit Slug und Domain", () => {
  assertEquals(
    buildMyRegistrationsLink("demo", "omlify-dev.de"),
    "https://demo.omlify-dev.de/my-registrations",
  );
});

Deno.test("buildPromotionEmail Betreff und Frist ohne Empfängeradresse", () => {
  const { subject, html } = buildPromotionEmail({
    courseTitle: "Yin",
    courseDate: "01.10.2026",
    courseTime: "10:00",
    studioName: "Studio Test",
    holdExpiresAt: "2026-10-01T12:00:00.000Z",
    link: "https://demo.omlify-dev.de/my-registrations",
  });
  assert(subject.includes("Yin"), "Betreff enthält Kurs");
  assert(subject.includes("Platz reserviert bis"), "Betreff enthält Frist");
  assert(html.includes("Studio Test"), "HTML enthält Studio");
  assert(!html.includes("@"), "HTML ohne E-Mail-Adresse");
});

Deno.test("classifyDelivery S6d", () => {
  const base: DeliveryContext = {
    registrationStatus: "pending_payment",
    holdExpiresAt: "2026-10-01T12:00:00.000Z",
    courseTitle: "Yin",
    courseDate: "2026-10-01",
    courseTime: "10:00:00",
    studioName: "S",
    studioSlug: "demo",
    recipientEmail: "person@example.com",
    anonymizedAt: null,
    authUserId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  };
  assertEquals(classifyDelivery(base), "ok");
  assertEquals(
    classifyDelivery({ ...base, registrationStatus: "cancelled" }),
    "NOT_PENDING",
  );
  assertEquals(
    classifyDelivery({ ...base, anonymizedAt: "2026-09-01T00:00:00Z" }),
    "RECIPIENT_GONE",
  );
  assertEquals(
    classifyDelivery({ ...base, authUserId: null }),
    "RECIPIENT_GONE",
  );
  assertEquals(classifyDelivery(null), "RECIPIENT_GONE");
});

type FakeMail = { to: string; subject: string; html: string };

function makeDeps(opts: {
  secret?: string;
  rows?: DeliveryRow[];
  ctxByReg?: Record<string, DeliveryContext | null>;
  mailResult?: { ok: true } | { ok: false; errorCode: string };
  logLines?: string[];
}): {
  deps: DispatchDeps;
  mails: FakeMail[];
  marks: { id: string; status: string; code: string | null | undefined }[];
} {
  const mails: FakeMail[] = [];
  const marks: { id: string; status: string; code: string | null | undefined }[] = [];
  const logLines = opts.logLines ?? [];
  const deps: DispatchDeps = {
    env: (key) => {
      if (key === "EMAIL_DISPATCH_SECRET") return opts.secret ?? "test-secret";
      if (key === "APP_BASE_DOMAIN") return "omlify-dev.de";
      return undefined;
    },
    log: {
      info: (...args) =>
        logLines.push(
          args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
        ),
      warn: (...args) =>
        logLines.push(
          args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
        ),
      error: (...args) =>
        logLines.push(
          args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
        ),
    },
    claimDeliveries: () => Promise.resolve(opts.rows ?? []),
    loadContext: (id) => Promise.resolve(opts.ctxByReg?.[id] ?? null),
    markDelivery: (id, status, code) => {
      marks.push({ id, status, code });
      return Promise.resolve();
    },
    sendEmail: (input) => {
      mails.push(input);
      return Promise.resolve(opts.mailResult ?? { ok: true });
    },
  };
  return { deps, mails, marks };
}

const pendingCtx: DeliveryContext = {
  registrationStatus: "pending_payment",
  holdExpiresAt: "2026-10-02T15:00:00.000Z",
  courseTitle: "Flow",
  courseDate: "2026-10-05",
  courseTime: "18:00:00",
  studioName: "Om Studio",
  studioSlug: "omstudio",
  recipientEmail: "berta@example.com",
  anonymizedAt: null,
  authUserId: "11111111-1111-4111-8111-111111111111",
};

const row = (id: string, regId: string): DeliveryRow => ({
  id,
  tenant_id: "t1",
  event_id: "e1",
  kind: "waitlist_promoted_payment_required",
  registration_id: regId,
  status: "sending",
  attempts: 0,
});

Deno.test("versendet: Fake-Mailer + mark sent", async () => {
  const { deps, mails, marks } = makeDeps({
    rows: [row("d1", "r1")],
    ctxByReg: { r1: pendingCtx },
  });
  const out = await runDispatch(deps);
  assertEquals(out.processed, 1);
  assertEquals(out.results[0]?.code, "SENT");
  assertEquals(mails.length, 1);
  assertEquals(mails[0]?.to, "berta@example.com");
  assert(mails[0]!.subject.includes("Flow"), "Betreff Kurs");
  assertEquals(marks[0], { id: "d1", status: "sent", code: null });
  assert(DISPATCH_LIMIT === 20, "Limit 20");
});

Deno.test("NOT_PENDING: kein Versand", async () => {
  const { deps, mails, marks } = makeDeps({
    rows: [row("d2", "r2")],
    ctxByReg: {
      r2: { ...pendingCtx, registrationStatus: "cancelled" },
    },
  });
  const out = await runDispatch(deps);
  assertEquals(out.results[0]?.code, "NOT_PENDING");
  assertEquals(mails.length, 0);
  assertEquals(marks[0]?.status, "skipped");
  assertEquals(marks[0]?.code, "NOT_PENDING");
});

Deno.test("RECIPIENT_GONE: anonymisiert", async () => {
  const { deps, mails, marks } = makeDeps({
    rows: [row("d3", "r3")],
    ctxByReg: {
      r3: {
        ...pendingCtx,
        anonymizedAt: "2026-09-01T00:00:00Z",
        authUserId: null,
        recipientEmail: "entfernt-x@anonymisiert.invalid",
      },
    },
  });
  const out = await runDispatch(deps);
  assertEquals(out.results[0]?.code, "RECIPIENT_GONE");
  assertEquals(mails.length, 0);
  assertEquals(marks[0]?.code, "RECIPIENT_GONE");
});

Deno.test("SMTP-Fehler → Wiederholung (failed mark)", async () => {
  const { deps, mails, marks } = makeDeps({
    rows: [row("d4", "r4")],
    ctxByReg: { r4: pendingCtx },
    mailResult: { ok: false, errorCode: "SMTP_ERROR" },
  });
  const out = await runDispatch(deps);
  assertEquals(out.results[0]?.code, "SMTP_ERROR");
  assertEquals(mails.length, 1);
  assertEquals(marks[0], { id: "d4", status: "failed", code: "SMTP_ERROR" });
});

Deno.test("falsches Secret → 401", async () => {
  const { deps } = makeDeps({ secret: "richtig" });
  const res = await handleDispatchRequest(
    new Request("http://local/dispatch-emails", {
      method: "POST",
      headers: { [SECRET_HEADER]: "falsch" },
    }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("fehlendes Secret → 401", async () => {
  const { deps } = makeDeps({ secret: "" });
  const res = await handleDispatchRequest(
    new Request("http://local/dispatch-emails", {
      method: "POST",
      headers: { [SECRET_HEADER]: "irgendwas" },
    }),
    deps,
  );
  assertEquals(res.status, 401);
  assertEquals(authorizeDispatch(new Request("http://x"), undefined), false);
});

Deno.test("Logger ohne Adresse und Inhalt", async () => {
  const logLines: string[] = [];
  const { deps } = makeDeps({
    rows: [row("d5", "r5")],
    ctxByReg: { r5: pendingCtx },
    logLines,
  });
  await runDispatch(deps);
  const joined = logLines.join("\n");
  assert(!joined.includes("berta@example.com"), "Log ohne Adresse");
  assert(!joined.includes("Du bist nachgerückt"), "Log ohne Inhalt");
  assert(joined.includes("d5"), "Log mit delivery_id");
  assert(joined.includes("SENT"), "Log mit Code");
  // Maskierer würde Adressen ohnehin ersetzen — Doppelcheck
  assertEquals(maskSensitiveText("x berta@example.com y").includes("@"), false);
});
