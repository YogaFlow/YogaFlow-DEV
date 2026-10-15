# Bericht 3.2c — Erstattung Oberfläche — 2026-10-02

Status: **angehalten** (Haltestelle 5 — Klicktest Julius). Logik, Gestaltung und E2E sind grün und gepusht.

Vorgabe: [docs/stories/3_2c_erstattung_oberflaeche.md](../stories/3_2c_erstattung_oberflaeche.md)

## Commits

- `5e9e6f7` feat(geldkette): 3.2c Lese-RPCs Erstattungsstand und Vorschauen
- `2a629ab` feat(geldkette): 3.2c Erstattungstexte, Datenzugriff, Unit-Tests in dev:check
- `10990bb` feat(geldkette): 3.2c Oberflaeche Abmelde-, Erstatten-, Absage- und Entfernen-Dialoge
- `0ea1222` feat(geldkette): 3.2c Teilerstattung auch bei aktiver Anmeldung anzeigen
- `86154f4` test(geldkette): 3.2c Playwright-Grundgeruest, npm run dev:e2e, drei Erstattungs-E2E

## DEV-Stand

- Neue Migration `20261002210000_s3_2c_refund_previews.sql` (auf DEV angewendet, im selben Commit)
- Keine Edge Function geändert, keine Secrets geändert

## Was gebaut wurde

**Daten (C).** Eine Quelle für „was ist erstattbar“: private Helfer
`registration_refund_payment_ids`, `payment_refundable_cents`, `registration_refundable_cents`.
`request_refund` und `request_online_refunds_for_registration` (Auslöser) nutzen sie jetzt selbst,
die Vorschauen ebenfalls — Vorschau und Auslöser können nicht auseinanderlaufen
(Test „refund_cents = Vorschau (3800)“).

Neue Lese-RPCs (alle `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT … TO authenticated`;
Selbstprüfung im `DO`-Block, Test prüft `anon` = 42501):

| RPC | Wer | Liefert |
|---|---|---|
| `get_registration_refund_states(uuid[])` | eigene Buchungen; Owner/Admin im Studio; Lehrende nichts | je Buchung bezahlt, erstattbar, erstattet, läuft, fehlgeschlagen |
| `preview_course_cancel_refunds(uuid[])` | Owner/Admin | je Kurs Anzahl online bezahlt und Summe |
| `preview_member_removal_refunds(uuid)` | Owner/Admin | Anzahl und Summe künftiger Online-Zahlungen |

`get_payment_refunds` liefert zusätzlich `amount_cents`, `refundable_cents`, `dispute_open`.

Funktions-Diff gegen `pg_get_functiondef` (DEV): `request_refund` — nur die Restberechnung
(`v_spent` entfällt, `payment_refundable_cents`); `request_online_refunds_for_registration` — nur
die Auswahl der Zahlungen (`registration_refund_payment_ids`). `get_payment_refunds` — nur die drei
neuen Felder.

**Logik.** `src/lib/refundTexts.ts` (alle Texte und Beträge, 11 Unit-Tests),
`src/lib/refunds.ts` (Datenzugriff). Unit-Tests laufen jetzt in `dev:check`
(`node --experimental-strip-types --test scripts/test/*.ts`, 35 Tests).

**Teilnehmende (A).** Abmelde-Dialog vor/nach Frist, Erfolgstext aus `refund_cents`, Zeile
„Online bezahlt · kostenlos abmelden bis …“ auf Kursdetail und in Meine Anmeldungen,
Erstattungsstand mit Icon (`RefundProgressLine`).

**Owner/Admin (B).** `PaymentRefundSheet` (Liste, Formular, Zusammenfassung, Bestätigen) in der
Kasse; Kursabsage-Dialog mit Online-Zeile; Studio-Abmeldung und Person entfernen mit Betrag;
Hinweis bei offener Rückbuchung im Sheet.

## Entscheidungen, die ich selbst getroffen habe

1. **Wo stornierte Buchungen erscheinen** (`src/pages/MyRegistrations.tsx`). Es gibt keinen
   Bereich „vergangen/storniert“. Kleinste Lösung: abgemeldete/abgesagte Buchungen erscheinen in
   der bestehenden Liste mit Status „Abgemeldet“ bzw. „Fällt aus“, **nur solange** der Kurs nicht
   vorbei ist **und** es einen Erstattungsstand gibt. Danach verschwinden sie. Begründung: keine
   neue Seite, keine Dauerliste mit Altlasten; wer Geld erwartet, sieht es bis zum Kurstermin.
   Offene Frage unten.
2. **Erstatten-Knopf nur in der Kasse**, nicht in Teilnehmerliste und Personenverwaltung
   (`src/pages/CourseCheckout.tsx`, Menü „Mehr“ → „Online-Zahlung · Erstatten…“). Die
   Personenverwaltung zeigt heute keine Zahlungen; die Teilnehmerliste zeigt Zahlstatus, aber
   keine Zahlungsaktionen. Die Story sagt „dort, wo Zahlungen heute angezeigt werden“ — das ist die
   Kasse. 3.1 (Zahlungsübersicht) bringt dasselbe Sheet in die Zahlungsdetails.
3. **Abgesagter Kurs in der Kasse:** Online-Zahlungen stehen nicht mehr unter „Rückgaben“ (die
   sind für Bar/PayPal), sondern in einem eigenen Abschnitt „Online bezahlt“ mit „Erstattungen“.
4. **Kursabsage-Dialog:** Die bestehende Zeile „bezahlt“ zählt jetzt nur noch direkt beim Studio
   Bezahlte (bezahlt minus online), damit nichts doppelt genannt wird.
5. **Teilerstattung bei aktiver Anmeldung** (`EnrollmentCards.tsx`): „Teilweise erstattet · 10,00 €
   von 24,00 €“ erscheint auch, wenn die Person weiter angemeldet ist (Fall 2 der E2E).
6. **Test-ID** `course-unregister` am Abmelden-Knopf der Kursdetailseite, weil der Logout in der
   Seitenleiste gleich heißt.

## Abweichungen / nicht erledigt

- **Glocke bei Rückbuchung führt noch nach `/open-payments`**, nicht zur Zahlung. Ein Ziel „Zahlung
  X“ gibt es erst mit 3.1 (Zahlungsdetail). Wird dort umgehängt.
- **E2E bezahlt über die API**, nicht durch Eintippen von 4242 im Stripe-Payment-Element:
  `payments-checkout` `prepare` + Bestätigen mit `pm_card_visa` (= Testkarte 4242…), wie im
  Rauchtest 3.2b. Grund: das Payment Element liegt in einem Stripe-iframe; das wäre der
  unzuverlässigste Teil des Tests und prüft Stripe, nicht Omlify. Alles ab der bezahlten Buchung
  läuft im Browser.
- Nach-Frist-Fall ist per Unit-Test abgedeckt, nicht per E2E.

## Beobachtungen (nicht behoben, in OFFENE_PUNKTE)

- Kursabsage-Dialog: Anzahl „angemeldet/bezahlt“ summiert bei Serien über alle Termine, egal welcher
  Umfang gewählt ist (bestehendes Verhalten).
- `latestUnreversedPayment` in der Kasse behandelt teilweise erstattete Stripe-Zahlungen wie
  zurückgebucht; in der Kasse umgangen, Ursache bleibt.
- Stornierte Buchungen nach eigener Abmeldung **nach** der Frist erscheinen nicht in Meine
  Anmeldungen (kein Erstattungsstand) — gewollt, aber zu bestätigen.

## Definition of Done

- ✅ `npm run dev:check` — Exit 0 (Typprüfung, Lint, Deno, 35 Unit-Tests, dist-Scan)
- ✅ `npm run dev:apply` — `20261002210000` angewendet
- ✅ Funktions-Diff gegen `pg_get_functiondef` — nur geplante Änderungen (siehe oben)
- ✅ `npm run dev:test` — 26/26 grün (`a9_cancel.mjs` grün nach Wiederholung)
- ✅ Rauch: `s3_2c_refund_previews.mjs` (8 Abschnitte) grün; `s3_2a_refunds.mjs` Regression grün
- ✅ E2E: `npm run dev:e2e` — 3/3 grün (1,2 min)
- ✅ `npx tsc -p tsconfig.app.json --noEmit` — Exit 0

## E2E

`npm run dev:e2e` → DEV-Guard, dann Playwright (Chromium, Vite auf Port 5181, Studio `demoalpha`).
Gerüst: `playwright.config.ts`, `e2e/_dev.ts` (Guard, Kontext, Lauf-ID, Aufräumen über
`cancel_course`/`remove_member`, Studio-Schalter im `afterAll` zurück), `e2e/refund.spec.ts`.
Neue Abhängigkeit: `@playwright/test@1.63.0` (Dev, von der Story vorgegeben).

```
ok 1 › 1 — Teilnehmerin meldet sich vor der Frist ab und sieht die Erstattung (18.0s)
ok 2 › 2 — Owner erstattet 10 € von Hand, Teilnehmerin sieht Teilerstattung (21.8s)
ok 3 › 3 — Kursabsage-Dialog zeigt Anzahl und Summe der Online-Erstattungen (23.0s)
3 passed (1.2m)
```

Nach dem Lauf auf DEV: 0 Testprofile, 0 Test-Logins, 0 aktive Testkurse.
Screenshots (360/1280, nicht committet) in `docs/screenshots/3_2c/`: `abmelden-dialog`,
`meine-anmeldungen-erstattung-laeuft`, `meine-anmeldungen-erstattet`,
`owner-erstatten-bestaetigen`, `owner-erstattungsliste`, `meine-anmeldungen-teilweise`,
`kursabsage-dialog`, `kursabsage-erfolg`.

## Klickliste für Julius (360 px, omlify-dev.de)

1. Teilnehmerin, online bezahlter Kurs: Kursdetail zeigt „Online bezahlt · kostenlos abmelden bis …“ — liest sich das klar?
2. Abmelden vor der Frist: Dialogtext und Erfolgsmeldung „… je nach Bank dauert das einige Werktage.“
3. Meine Anmeldungen nach dem Abmelden: Zeile „Erstattung läuft“ → „Erstattet“ — Icon und Abstand.
4. Kasse als Owner: „Mehr“ → „Online-Zahlung · Erstatten…“ — findet man das?
5. Erstatten-Sheet: Betrag vorbelegt, Komma-Eingabe, Grund-Hinweis, Zusammenfassung mit Stripe-Gebühr-Satz.
6. Erstattungsliste im Sheet: Datum, Betrag, Art, Status, Notiz — zu viel Text auf 360 px?
7. Kurs absagen mit Online-Zahlungen: Zeile „3 haben online bezahlt …“ im Dialog und Erfolgstext.
8. Abgesagter Kurs in der Kasse: Abschnitt „Online bezahlt“ neben „Rückgaben“ — verständlich?
9. Teilnehmerliste: Studio meldet online Bezahlte ab — Satz „Die Online-Zahlung über … wird automatisch erstattet.“
10. Personen: Entfernen-Dialog mit „2 künftige online bezahlte Buchungen (48,00 €) …“

## Fragen an Julius

1. **Stornierte Buchungen in Meine Anmeldungen** nur bis Kursende und nur mit Erstattungsstand
   (Entscheidung 1 oben) — reicht das, oder soll es einen Bereich „Vergangen/storniert“ geben?
   Empfehlung: so lassen; ein Verlauf kommt sinnvoller mit der Zahlungsübersicht für Teilnehmende.
2. **Erstatten auch aus der Teilnehmerliste?** Empfehlung: nein — Kasse und (ab 3.1) Zahlungen
   reichen, die Teilnehmerliste bleibt ohne Geldaktionen.
