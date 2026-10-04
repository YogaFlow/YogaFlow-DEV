import { assert, assertEquals } from "../_shared/payments/port_contract.ts";
import { maskSensitiveText } from "../_shared/mask_sensitive.ts";
import {
  DISPATCH_LIMIT,
  SECRET_HEADER,
  authorizeDispatch,
  buildMyRegistrationsLink,
  buildPaymentRefundedEmail,
  buildPaymentSucceededEmail,
  buildPromotionEmail,
  classifyDelivery,
  classifyPaymentRefunded,
  classifyPaymentSucceeded,
  formatEurCents,
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
    amountCents: null,
    refundAmountCents: null,
    originalAmountCents: null,
    refundReason: null,
    hasRefund: false,
    refundRequired: false,
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
  amountCents: null,
  refundAmountCents: null,
  originalAmountCents: null,
  refundReason: null,
  hasRefund: false,
  refundRequired: false,
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

const paidCtx: DeliveryContext = {
  ...pendingCtx,
  registrationStatus: "registered",
  amountCents: 2400,
  refundAmountCents: null,
  originalAmountCents: 2400,
  refundReason: null,
  hasRefund: false,
  refundRequired: false,
};

Deno.test("18. payment_succeeded: gueltig gesendet; erstattet skipped", async () => {
  const amount = formatEurCents(2400);
  assertEquals(amount, "24,00 \u20AC");
  const { subject, html } = buildPaymentSucceededEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    courseTime: "18:00",
    studioName: "Om Studio",
    amountCents: 2400,
    link: "https://omstudio.omlify-dev.de/my-registrations",
    receiptLink: "https://omstudio.omlify-dev.de/receipts/r1",
    receiptNumber: "2026-00001",
    taxRegime: "small_business",
    vatRateBp: 0,
  });
  assert(subject.includes("Buchungsbestätigung"), "Betreff");
  assert(html.includes(amount) && html.includes("Yin") && html.includes("05.10.2026"), "Text");
  assert(html.includes("2026-00001"), "Belegnummer");
  assert(
    html.includes("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."),
    "Steuer voller Satz",
  );

  const { deps, mails, marks } = makeDeps({
    rows: [{
      id: "ps1",
      tenant_id: "t1",
      event_id: "e1",
      kind: "payment_succeeded",
      registration_id: "r1",
      status: "sending",
      attempts: 0,
    }],
    ctxByReg: { r1: { ...paidCtx, receiptId: "rec-1", receiptNumber: "2026-00001" } },
  });
  const out = await runDispatch(deps);
  assertEquals(out.results[0]?.code, "SENT");
  assertEquals(mails.length, 1);
  assert(mails[0]!.html.includes(amount), "Betrag");
  assert(mails[0]!.html.includes("Flow"), "Kurs");
  assertEquals(marks[0]?.status, "sent");

  const refunded = makeDeps({
    rows: [{
      id: "ps2",
      tenant_id: "t1",
      event_id: "e2",
      kind: "payment_succeeded",
      registration_id: "r2",
      status: "sending",
      attempts: 0,
    }],
    ctxByReg: { r2: { ...paidCtx, hasRefund: true } },
  });
  const out2 = await runDispatch(refunded.deps);
  assertEquals(out2.results[0]?.code, "ALREADY_REFUNDED");
  assertEquals(refunded.mails.length, 0);
  assertEquals(classifyPaymentSucceeded({ ...paidCtx, hasRefund: true }), "ALREADY_REFUNDED");

  const pending = makeDeps({
    rows: [{
      id: "ps3",
      tenant_id: "t1",
      event_id: "e3",
      kind: "payment_succeeded",
      registration_id: "r3",
      status: "sending",
      attempts: 0,
    }],
    ctxByReg: { r3: paidCtx },
  });
  const out3 = await runDispatch(pending.deps);
  assertEquals(out3.results[0]?.code, "RECEIPT_PENDING");
  assertEquals(pending.mails.length, 0);
  assertEquals(pending.marks[0]?.status, "released");
});

Deno.test("19. payment_refunded: Texte je reason, Voll- und Teilerstattung", async () => {
  const full = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 2400,
    originalAmountCents: 2400,
    reason: "late_payment",
  });
  assert(full.html.includes("Platz war leider inzwischen vergeben"), "late_payment");
  assert(full.html.includes("24,00"), "Vollbetrag");
  assert(full.html.includes("Je nach Bank"), "Bank-Hinweis");

  const course = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 2400,
    originalAmountCents: 2400,
    reason: "course_cancelled",
  });
  assert(course.html.includes("Der Kurs wurde abgesagt."), "course_cancelled");

  const self = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 2400,
    originalAmountCents: 2400,
    reason: "self_cancel_in_window",
  });
  assert(self.html.includes("rechtzeitig abgemeldet"), "self_cancel");

  const staff = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 2400,
    originalAmountCents: 2400,
    reason: "staff_unregister",
  });
  assert(staff.html.includes("Studio hat deine Anmeldung storniert"), "staff");

  const partial = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 1000,
    originalAmountCents: 2400,
    reason: "manual",
  });
  assert(partial.html.includes("10,00"), "Teilbetrag");
  assert(partial.html.includes("von 24,00"), "von Original");
  assert(!partial.html.includes("Der Kurs"), "manual ohne Grund-Satz");
  assert(!partial.html.includes("Anmeldung storniert"), "manual ohne Studio-Satz");

  const { deps, mails } = makeDeps({
    rows: [{
      id: "pr1",
      tenant_id: "t1",
      event_id: "e1",
      kind: "payment_refunded",
      registration_id: "r1",
      status: "sending",
      attempts: 0,
    }],
    ctxByReg: {
      r1: {
        ...paidCtx,
        hasRefund: true,
        refundRequired: false,
        refundReason: "late_payment",
        refundAmountCents: 2400,
        originalAmountCents: 2400,
        amountCents: 2400,
        refundReceiptId: "rr-1",
        refundReceiptNumber: "2026-00002",
      },
    },
  });
  const out = await runDispatch(deps);
  assertEquals(out.results[0]?.code, "SENT");
  assert(mails[0]!.html.includes("inzwischen vergeben"), "Mail mit Grund");
  assertEquals(classifyPaymentRefunded({ ...paidCtx, hasRefund: false }), "REFUND_MISSING");
});
