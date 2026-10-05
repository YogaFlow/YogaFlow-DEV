import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPaymentRefundedEmail,
  buildPaymentSucceededEmail,
  cancelLine,
} from "./handler.ts";

const DEV_HINTS = [/Block\s*\d/i, /\bTODO\b/, /\bStory\b/i];

function assertNoDevHints(html: string) {
  for (const re of DEV_HINTS) {
    if (re.test(html)) {
      throw new Error(`Entwickler-Hinweis in Mail: ${re}`);
    }
  }
}

Deno.test("cancelLine vor und nach Frist", () => {
  const now = new Date("2026-10-01T12:00:00+02:00");
  const before = cancelLine("2026-10-03T18:00:00+02:00", now);
  assertEquals(before.startsWith("Kostenlos abmelden bis"), true);
  assertEquals(before.includes("nicht mehr möglich"), false);

  const after = cancelLine("2026-09-01T18:00:00+02:00", now);
  assertEquals(after, "Die kostenlose Abmeldefrist ist abgelaufen.");
  assertEquals(cancelLine(null, now), "Die kostenlose Abmeldefrist ist abgelaufen.");
});

Deno.test("Mail-HTML ohne Entwickler-Hinweise; Erstattung voll/teil", () => {
  const ok = buildPaymentSucceededEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    courseTime: "18:00",
    studioName: "Om",
    amountCents: 1200,
    link: "https://example.test/my-registrations",
    receiptLink: "https://example.test/receipts/r1",
    receiptNumber: "2026-00138",
    registrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    calendarIcsUrl: "https://example.supabase.co/functions/v1/calendar-ics?t=x.y",
    googleCalendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    courseDateRaw: "2026-10-05",
    courseEndTime: "19:00:00",
    place: "Neuss",
    cancelDeadline: "2026-10-03T18:00:00+02:00",
  });
  assertNoDevHints(ok.html);
  assertEquals(ok.html.includes("MO"), true);
  assertEquals(ok.html.includes("In Kalender eintragen"), true);
  assertEquals(ok.html.includes("Google Kalender"), true);

  const full = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 1200,
    originalAmountCents: 1200,
    reason: "self_cancel_in_window",
    receiptLink: "https://example.test/receipts/rr",
    receiptNumber: "2026-00138",
    courseDateRaw: "2026-10-05",
    courseTime: "18:00:00",
    place: "Neuss",
  });
  assertNoDevHints(full.html);
  assertEquals(full.html.includes("12,00 € sind auf dem Weg zu dir"), true);
  const ohneLink = full.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "");
  assertEquals(ohneLink.includes("Beleg 2026-00138"), true);
  assertEquals(full.html.includes("Erstattungsbeleg ansehen"), true);

  const partial = buildPaymentRefundedEmail({
    courseTitle: "Yin",
    courseDate: "05.10.2026",
    studioName: "Om",
    refundAmountCents: 1000,
    originalAmountCents: 2400,
    reason: "manual",
    courseDateRaw: "2026-10-05",
  });
  assertEquals(partial.html.includes("10,00 € von 24,00 €"), true);
  assertNoDevHints(partial.html);
});
