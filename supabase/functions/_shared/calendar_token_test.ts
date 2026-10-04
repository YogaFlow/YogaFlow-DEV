import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCalendarIcsUrl,
  signCalendarToken,
  verifyCalendarToken,
} from "./calendar_token.ts";
import { buildGoogleCalendarUrl } from "./google_calendar.ts";

Deno.test("calendar token: sign + verify", async () => {
  const secret = "test-calendar-secret-ux3";
  const rid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const now = 1_700_000_000;
  const token = await signCalendarToken(secret, rid, now, 3600);
  const ok = await verifyCalendarToken(secret, token, now + 10);
  assertEquals(ok?.rid, rid);
  assertEquals(ok?.exp, now + 3600);
});

Deno.test("calendar token: gefälscht → null", async () => {
  const secret = "test-calendar-secret-ux3";
  const token = await signCalendarToken(secret, "rid-1", 1_700_000_000, 3600);
  const forged = token.slice(0, -2) + "xx";
  const bad = await verifyCalendarToken(secret, forged, 1_700_000_010);
  assertEquals(bad, null);
  const wrongSecret = await verifyCalendarToken("other", token, 1_700_000_010);
  assertEquals(wrongSecret, null);
});

Deno.test("calendar token: abgelaufen → null", async () => {
  const secret = "test-calendar-secret-ux3";
  const token = await signCalendarToken(secret, "rid-1", 1_700_000_000, 10);
  const bad = await verifyCalendarToken(secret, token, 1_700_000_020);
  assertEquals(bad, null);
});

Deno.test("calendar ics url + google template", () => {
  const url = buildCalendarIcsUrl("https://abc.supabase.co/", "tok.en");
  assertEquals(url, "https://abc.supabase.co/functions/v1/calendar-ics?t=tok.en");
  const g = buildGoogleCalendarUrl({
    title: "Yin",
    date: "2026-10-05",
    startTime: "18:00:00",
    endTime: "19:00:00",
    location: "Neuss",
  });
  assertEquals(g?.includes("action=TEMPLATE"), true);
  assertEquals(g?.includes("20261005T180000"), true);
  assertEquals(g?.includes("ctz=Europe%2FBerlin") || g?.includes("ctz=Europe/Berlin"), true);
});
