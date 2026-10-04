import { assert, assertEquals } from "./payments/port_contract.ts";
import {
  buildStudioLogoUrl,
  contrastRatio,
  formatEmailPreheader,
  formatTimeHm,
  renderEmailShell,
  resolveBrandAccent,
  OMLIFY_BRAND,
} from "./email_template.ts";
import {
  buildIcs,
  parseIcsDtStartLocal,
  parseIcsUid,
  toIcsLocalDateTime,
} from "./ics.ts";

Deno.test("resolveBrandAccent: Fallback bei schwachem Kontrast", () => {
  assertEquals(resolveBrandAccent(null), OMLIFY_BRAND);
  assertEquals(resolveBrandAccent("#FFFFFF"), OMLIFY_BRAND);
  assertEquals(resolveBrandAccent("#2F5A4E"), "#2F5A4E");
  const ok = contrastRatio("#2F5A4E", "#FFFFFF");
  assert(ok != null && ok >= 4.5, "Salbei hat Kontrast");
});

Deno.test("formatEmailPreheader", () => {
  assertEquals(
    formatEmailPreheader({
      courseDate: "2026-10-05",
      courseTime: "13:00:00",
      courseTitle: "Test Kurs V8",
      place: "Neuss",
    }),
    "Mo, 5. Okt, 13:00 · Test Kurs V8 · Neuss",
  );
  assertEquals(formatTimeHm("9:05:00"), "09:05");
});

Deno.test("renderEmailShell: Preheader, Logo-Alt, Akzent, Text", () => {
  const { html, text, accent } = renderEmailShell(
    {
      preheader: "Mo, 5. Okt, 13:00 · Yin · Neuss",
      studioName: "Demo Alpha",
      logoUrl: "https://example.test/logo.png",
      brandColor: "#2F5A4E",
      title: "Du bist dabei",
      introHtml: "Deine Buchung bei Demo Alpha ist bestätigt.",
      bodyHtml: "<p>Inhalt</p>",
      footerHtml: "Anbieterzeile",
    },
    "Inhalt\nAnbieterzeile",
  );
  assertEquals(accent, "#2F5A4E");
  assert(html.includes("display:none"), "Preheader versteckt");
  assert(html.includes("Mo, 5. Okt, 13:00 · Yin · Neuss"), "Preheader Text");
  assert(html.includes('alt="Demo Alpha"'), "Logo-Alt");
  assert(html.includes("Du bist dabei"), "Titel");
  assert(html.includes("Gesendet über Omlify im Auftrag von Demo Alpha"), "Fuß");
  assert(html.includes("max-width:560px"), "Breite");
  assert(text.includes("Du bist dabei"), "Text-Titel");
  assert(text.includes("Inhalt"), "Text-Body");
  assert(text.includes("Gesendet über Omlify"), "Text-Fuß");
});

Deno.test("buildStudioLogoUrl", () => {
  assertEquals(
    buildStudioLogoUrl("https://xyz.supabase.co", "t1/logo-1.png"),
    "https://xyz.supabase.co/storage/v1/object/public/studio-branding/t1/logo-1.png",
  );
  assertEquals(buildStudioLogoUrl(undefined, "x"), null);
});

Deno.test("ICS: UID = Buchungs-ID, Europe/Berlin Datum/Uhrzeit", () => {
  const regId = "11111111-2222-4333-8444-555555555555";
  const ics = buildIcs({
    uid: regId,
    summary: "Test Kurs V8",
    date: "2026-10-05",
    startTime: "13:00:00",
    endTime: "14:00:00",
    location: "Neuss",
    method: "REQUEST",
    dtStamp: "2026-10-04T10:00:00.000Z",
  });
  assertEquals(parseIcsUid(ics), `${regId}@omlify`);
  assertEquals(parseIcsDtStartLocal(ics), "20261005T130000");
  assert(ics.includes("DTEND;TZID=Europe/Berlin:20261005T140000"), "Ende");
  assert(ics.includes("TZID:Europe/Berlin"), "VTIMEZONE");
  assert(ics.includes("METHOD:REQUEST"), "METHOD");
  assertEquals(toIcsLocalDateTime("2026-10-05", "13:00"), "20261005T130000");

  const cancel = buildIcs({
    uid: regId,
    summary: "Test Kurs V8",
    date: "2026-10-05",
    startTime: "13:00",
    method: "CANCEL",
  });
  assert(cancel.includes("METHOD:CANCEL"), "CANCEL vorbereitet");
  assert(cancel.includes("STATUS:CANCELLED"), "CANCEL Status");
});
