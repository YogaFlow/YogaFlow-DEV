# Bericht ZW-1 — Zahlungswege klar regeln, Buchen mit einem Tipp

Status: **angehalten** (Haltestelle 5 — Klicktest Nachtrag N1–N4). Stand 04.10.2026.  
Branch `Julius` · HEAD siehe `git log -1`  
Vorgabe: [docs/stories/zw1_zahlungswege_ein_klick.md](../stories/zw1_zahlungswege_ein_klick.md) · [Nachtrag](../stories/nachtrag_zw1.md) · [Entscheidung 14](../entscheidungen/14_Zahlungswege.md)

Sonderregeln wie UX-2-Langlauf: Haltestelle 5 blockiert nicht den Lauf (grüner Teil committet/gepusht); kein PROD, kein Stripe-Dashboard, kein Merge nach `main`.

## Commits

| Schicht | Commit | Inhalt |
|---|---|---|
| Doku | `053e4c0` | Entscheidung 14 + Story |
| Server | `f4ec199` | Migration `20261004200000`, Matrix-Test, AVV-Helfer, E2E-Studio-Regel |
| Oberfläche-Logik | `b3ffd2a` | Ein-Tipp-Buchung, Sheets, `p_method` |
| Oberfläche-Gestaltung / Vorab | `7047c51` | Toast-Balken `onBrand`, Build-SHA, Schalter-Texte |
| E2E | `b1bbcd6` | Playwright `e2e/zw1.spec.ts` in Studio `e2eapp` |
| N1 | `ef15a3f` | Zahlart-Zeile, Knopftexte, `online_pay_hint_seen_at` |
| N2 | `f90ffc5` | Toast 3 s / 6 s, konkrete Texte |
| N3 | `3d0ceb2` | E2E sechs Fälle |
| N4 | (dieser Push) | Z7 `last_booking_pay_method`, Entscheidung Z7, Doku LAST_METHOD |

## Vorab-Befunde

### AVV-Banner / E2E-Studio

Ursache Banner weg: E2E auf `demoalpha` hat `accept_legal_document` geschrieben (append-only).  
Maßnahme: Regel in `omlify-autonom.mdc` — append-only-E2E (AVV, Belege) laufen in Studio **`e2eapp`**, nie `demoalpha`/`demobeta`. ZW-1-E2E nutzt `e2eapp` und räumt per `delete_tenant_complete` auf.

### Toast-Zeitbalken unsichtbar

| Prüfung | Ergebnis |
|---|---|
| (a) Build sichtbar | `public/version.json` + Einstellungen › Studio › **Build:** `VITE_BUILD_SHA` (`data-testid=app-build-sha`) |
| (b) Kontrast | Fill war `bg-brandSoft` auf dunkler Pille → jetzt `bg-onBrand` (weiß) |
| (c) Playwright | UX-4-Test misst schrumpfende Fill-Breite; ZW-1 E2E grün |

Ursache: zu helles `brandSoft` auf `bg-text`-Pille.

## A — Einstellungen › Zahlungen

- Abschnitt „Wie können Teilnehmende bezahlen?“ mit Online / Vor Ort
- **LAST_METHOD** (Fehlercode, keine gespeicherte Präferenz): `set_online_payments_enabled` / `set_allow_onsite_payment` liefern `{ success: false, error: 'LAST_METHOD' }`, wenn der letzte angeschaltete Weg ausgeschaltet würde. Hinweistext in der UI. Nicht zu verwechseln mit Z7.
- Statuszeile „Online ist noch nicht bereit: …“ mit Link (Steuer / Anbieter / AVV)
- `get_payment_setup_status` liefert `avv_accepted`

## B — Server

- `booking_payment_options(p_course_id, p_amount_cents)` → `{ methods, default, online_required, show_online_pay_hint, … }`
- Default: pass → (Z7) zuletzt gewählte Zahlart wenn verfügbar → Online → Vor Ort
- Online wählbar auch wenn Vor Ort an (Z2)
- `register_for_course(..., p_method)`; speichert `users.last_booking_pay_method`
- Z6 Vorher/Nachher (DEV, alle Tenants): siehe Erstbericht — keine Einstellung verloren

Tests: `node scripts/test/zw1_zahlungswege.mjs` — Matrix + LAST_METHOD + Z7 + Buchen pass/online/onsite.

## C — Ein-Tipp-Buchung (N1)

- Zahlart-Zeile mit Icon direkt über dem Knopf; „Ändern ›“ öffnet Sheet (ersetzt „Anders bezahlen“)
- Knöpfe: „Mit 10er-Karte buchen“ / „Weiter zur Zahlung“ / „Weiter zur Buchung“
- Nur ein Weg → Zeile ohne „Ändern ›“
- Einmaliger „Neu“-Hinweis (`users.online_pay_hint_seen_at`), Trigger bei Registrierungs-INSERT

## N2 — Toast

| Art | Dauer | Zeitbalken |
|---|---|---|
| Kurz ohne Undo | 3 s | nein |
| Mit Undo | 6 s | ja |
| Fehler | bis schließen | nein |
| Text > 60 Zeichen | + 1 s | wie oben |

Konkrete Texte: „Du bist dabei · …“; „Hans Peter abgemeldet“. Tabelle im Designsystem.

## N3 — E2E

`e2e/zw1.spec.ts` in Studio **`e2eapp`**: (1) beide → Online, (2) Karte + Toast, (3) nur Vor Ort + Zahlungspflichtig, (4) letzter Schalter, (5) Zahlart-Zeile/Knopftexte, (6) Neu einmal. **1/1 grün.**

## N4 — LAST_METHOD und Z7

### LAST_METHOD (Einstellungen)

- **Nicht** als Präferenz gespeichert.
- Entsteht nur als Fehlercode der Schalter-RPCs, wenn Online und Vor Ort nicht beide aus sein dürfen.
- Spielt nicht mit der Buchungs-Default-Reihenfolge zusammen; das ist Z4/Z7.

### Z7 — zuletzt gewählte Zahlart

- Spalte `users.last_booking_pay_method` (`pass` \| `online` \| `onsite`), nur SECURITY DEFINER schreibt.
- Bei erfolgreicher Buchung gesetzt (`remember_booking_pay_method`).
- Default in `booking_payment_options`: gültige Karte immer zuerst; sonst gespeicherte Wahl wenn verfügbar; sonst Online; sonst Vor Ort.

## DoD Nachtrag

- Migrationen `20261004210000`, `20261004220000` auf DEV
- Unit: `zw1_booking_texts`, `zw1_toast_texts`
- RPC `zw1_zahlungswege` inkl. Z7 grün
- E2E 1/1 · Deno 195/195 · `npm run check:ci` grün
- Entscheidung 14 + Z7 · Bericht + STAND

## Klickliste Nachtrag (max. 6)

Studio/Konto: **demoalpha**. Build-SHA in Einstellungen › Studio prüfen.

1. **Teilnehmerin ohne Karte**, beide Wege — Kursdetail: Zahlart-Zeile „Online bezahlen · Karte, Apple Pay · Ändern ›“, Knopf „Weiter zur Zahlung“
2. „Ändern ›“ → Vor Ort → Zeile „Vor Ort bezahlen · im Studio“, Knopf „Weiter zur Buchung“; nichts gebucht bis Tipp
3. Vor Ort buchen → Bestätigung „Zahlungspflichtig buchen“ → Toast „Du bist dabei · …“
4. **Mit 10er-Karte** — Ein-Tipp, Toast 6 s mit Zeitbalken + Rückgängig
5. Gewohnheits-Vor-Ort (nie online): bei Online-Default Abzeichen „Neu“ + Hinweiszeile; nach einer Buchung weg
6. Owner Einstellungen › Zahlungen: letzten Schalter aus → „Mindestens ein Zahlungsweg…“

## Fragen an Julius

1. Desktop-Buchungskarte unter `lg` ausblenden? (wie ZW-1-Erstbericht)
2. Alte E2E schrittweise auf `e2eapp`? Empfehlung: bei nächstem AVV/Beleg-E2E.
