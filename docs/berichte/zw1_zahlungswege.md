# Bericht ZW-1 — Zahlungswege klar regeln, Buchen mit einem Tipp

Status: **angehalten** (Haltestelle 5 — Klicktest). Stand 04.10.2026.  
Branch `Julius` · HEAD siehe `git log -1`  
Vorgabe: [docs/stories/zw1_zahlungswege_ein_klick.md](../stories/zw1_zahlungswege_ein_klick.md) · [Entscheidung 14](../entscheidungen/14_Zahlungswege.md)

Sonderregeln wie UX-2-Langlauf: Haltestelle 5 blockiert nicht den Lauf (grüner Teil committet/gepusht); Logik- und Gestaltungs-Commits getrennt; kein PROD, kein Stripe-Dashboard, kein Merge nach `main`.

## Commits

| Schicht | Commit | Inhalt |
|---|---|---|
| Doku | `053e4c0` | Entscheidung 14 + Story |
| Server | `f4ec199` | Migration `20261004200000`, Matrix-Test, AVV-Helfer, E2E-Studio-Regel |
| Oberfläche-Logik | `b3ffd2a` | Ein-Tipp-Buchung, Sheets, `p_method` |
| Oberfläche-Gestaltung / Vorab | `7047c51` | Toast-Balken `onBrand`, Build-SHA, Schalter-Texte |
| E2E | `b1bbcd6` | Playwright `e2e/zw1.spec.ts` in Studio `e2eapp` |

## Vorab-Befunde

### AVV-Banner / E2E-Studio

Ursache Banner weg: E2E auf `demoalpha` hat `accept_legal_document` geschrieben (append-only).  
Maßnahme: Regel in `omlify-autonom.mdc` — append-only-E2E (AVV, Belege) laufen in Studio **`e2eapp`**, nie `demoalpha`/`demobeta`. ZW-1-E2E nutzt `e2eapp` und räumt per `delete_tenant_complete` auf.

### Toast-Zeitbalken unsichtbar

| Prüfung | Ergebnis |
|---|---|
| (a) Build sichtbar | `public/version.json` + Einstellungen › Studio › **Build:** `VITE_BUILD_SHA` (`data-testid=app-build-sha`) |
| (b) Kontrast | Fill war `bg-brandSoft` auf dunkler Pille → jetzt `bg-onBrand` (weiß) |
| (c) Playwright | UX-4-Test misst schrumpfende Fill-Breite; ZW-1 E2E 1/1 grün |

Ursache: zu helles `brandSoft` auf `bg-text`-Pille.

## A — Einstellungen › Zahlungen

- Abschnitt „Wie können Teilnehmende bezahlen?“ mit Online / Vor Ort
- `LAST_METHOD` serverseitig + Hinweistext
- Statuszeile „Online ist noch nicht bereit: …“ mit Link (Steuer / Anbieter / AVV)
- `get_payment_setup_status` liefert `avv_accepted`

## B — Server

- `booking_payment_options(p_course_id, p_amount_cents)` → `{ methods, default, online_required, … }`
- Default Z4: pass → online → onsite
- Online wählbar auch wenn Vor Ort an (Z2)
- `register_for_course(..., p_method)`; Warteliste speichert `coverage_intent` online/onsite/pass
- Z6 Vorher/Nachher (DEV, alle Tenants):

| Kombination | Vorher | Nachher |
|---|---|---|
| beide an | 1 | 1 |
| nur Online | 0 | 0 |
| nur Vor Ort | 6 | 6 |
| beide aus | 0 | 0 |

Keine Studio-Einstellung verloren; `both_off` blieb 0.

Tests: `node scripts/test/zw1_zahlungswege.mjs` — alle OK (Matrix + LAST_METHOD + Buchen pass/online/onsite).

## C — Ein-Tipp-Buchung

- Kursdetail: Methodenzeile + Primärknopf + „Anders bezahlen ›“
- Online → Checkout; Vor Ort → Bestätigungs-Sheet „Zahlungspflichtig buchen“; Karte → ein Tipp + Toast mit Rückgängig
- Mobil-Leiste Zeile 2 = gewählter Weg

## D — Abmelden / Erstatten

Texte unverändert passend (`online bezahlt` / Karte in `refundTexts` / `passRefundInfo`). Keine Code-Änderung nötig.

## DoD

- Migration `20261004200000` auf DEV (`dev:apply` OK)
- Unit `zw1_booking_texts` 3/3
- RPC-Test `zw1_zahlungswege` grün
- E2E `e2e/zw1.spec.ts` **1/1** (Studio `e2eapp`)
- Deno 195/195 · `npm run check:ci` grün
- Bericht + STAND

## Klickliste (max. 10)

Studio/Konto: **demoalpha** Owner für Einstellungen; Teilnehmerin ohne/mit Karte wie angegeben. Build-SHA in Einstellungen › Studio prüfen (muss neuer HEAD sein).

1. **demoalpha Owner** — Einstellungen › Zahlungen: beide Schalter; letzten Weg aus → Hinweis „Mindestens ein Zahlungsweg…“
2. **demoalpha Owner** — Online an, AVV/Anbieter fehlend simulieren (falls möglich) → Statuszeile mit Link
3. **Teilnehmerin ohne Karte**, Studio beide Wege — Kursdetail: Standard „Online bezahlen“, Knopf „Zur Buchung“ / mobil „Zur Buchung“
4. „Anders bezahlen“ → Vor Ort wählen → Zeile „Du bezahlst vor Ort“, nichts gebucht bis Tipp
5. Vor Ort → Bestätigungs-Sheet mit Kurs/Termin/Preis + „Zahlungspflichtig buchen“ → angemeldet
6. **Teilnehmerin mit 10er-Karte** — Ein-Tipp „Mit 10er-Karte buchen“, Toast + Rückgängig
7. Nur ein Weg im Studio → kein „Anders bezahlen“
8. Mobil-Buchungsleiste: Zeile 2 zeigt den gewählten Weg (Online / Vor Ort / Karte)
9. Toast nach Abmelden/Buchung: Zeitbalken unten weiß sichtbar (nicht verschwunden)
10. Einstellungen › Studio: Build-SHA = aktueller Deploy (Cloudflare aus Julius)

## Fragen an Julius

1. Desktop-Buchungskarte und Mobil-Leiste zeigen beide denselben Flow — auf schmalen Viewports ist die Desktop-Karte im Layout noch sichtbar (wie UX-2 B3). Soll die Karte unter `lg` ausgeblendet werden? Empfehlung: ja, in einem späteren Feinschliff.
2. Alte E2E (`ux2`/`ux4`/`b1`) laufen weiter auf `demoalpha` — nur append-only neu auf `e2eapp`. Schrittweise umstellen? Empfehlung: bei nächstem AVV/Beleg-E2E umstellen.
