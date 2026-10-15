# Bericht UX-6 — Teilnehmerliste mit Zahlstatus

Stand: 2026-10-05 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

## Erledigt

| Teil | Inhalt |
|---|---|
| Entscheidung 18 | `docs/entscheidungen/18_Teilnehmerliste_Zahlstatus.md` (T1–T10) |
| A | Kursseite `/course/:id/participants` = ehemalige Kasse; Warteliste eingeklappt; CSV; Kontakt/Abmelden im Menü ⋯; Primär „Bar erhalten“ |
| B | `get_upcoming_open_coverage`; Zahlungen › Offen: „Überfällig“ + „Kommt noch · zahlt vor Ort“ |
| C | Texte ohne Check-in/Einchecken (siehe Liste); `/kassieren` → Redirect |
| D | `node scripts/dev/demo_ux6.mjs` (demoalpha) |

## Commits (Auszug)

- `docs(ux6): Entscheidung 18 …`
- `feat(ux6): get_upcoming_open_coverage …`
- `feat(ux6): coverageLabel mit Zeitbezug`
- `feat(ux6): Teilnehmerliste je Kurs und Offen zweigeteilt`
- (+ dieser Bericht / E2E / Demo)

## Geänderte Nutzertexte (C)

| alt | neu |
|---|---|
| Check-in / Einchecken | entfallen |
| Wer ist da, wer hat bezahlt. | Zähler (zahlen vor Ort / offen / Alles erledigt ✓) |
| Check-in öffnen (+ Sekundär Teilnehmerliste) | ein Knopf „Teilnehmerliste“ |
| Zum Check-in | Zur Teilnehmerliste |
| Check-in geht erst… | Zahlung vermerken geht erst… |
| Dashboard „Check-in“ | „Heute zu erledigen“ + T6-Zeile |
| Link „Check-in“ (globale Teilnehmer) | „Teilnehmerliste“ / „Rückgaben“ |
| Seitentitel Check-in | Teilnehmerliste (Brotkrume); Kursname · Termin auf der Seite |
| offen (Staff, vor Beginn) | Zahlt vor Ort |
| offen (Staff, ab Beginn) | Offen |
| Zahlung ausstehend (coverageLabel) | Zahlung läuft |

## Nachweise

- `node --experimental-strip-types --test scripts/test/coverage_label.ts` — grün
- `node scripts/test/ux6_upcoming_open_coverage.mjs` — grün (FORBIDDEN Lehrende, kein Fremd-Tenant)
- `npm run dev:apply` — `20261005150000` auf DEV
- Textsuche `Check-in|Einchecken` in `src/` — **0 Treffer**; `kassieren` nur Redirect/`routeTitles`/Header-Altpfad
- E2E: `e2e/ux6.spec.ts` (e2eapp) — **grün** (`npx playwright test e2e/ux6.spec.ts`)
- `npm run check:ci` — grün
- Demo: `node scripts/dev/demo_ux6.mjs` — UX6 Heute Zahlstatus + UX6 Gestern Offen

## Haltestelle 5 — Klickliste (max. 8)

1. **Owner demoalpha** — Übersicht „Heute zu erledigen“: heutiger Kurs mit „zahlen vor Ort“ bzw. „offen“ je nach Uhrzeit; Klick → Teilnehmerliste.
2. **Owner** — Kurs „UX6 Heute Zahlstatus“: Vera „Zahlt vor Ort“ / „Offen“, Knopf „Bar erhalten“; Toast mit Rückgängig.
3. **Owner** — Zahlungen › Offen: „Überfällig“ (Nina/gestriger Kurs) und eingeklappt „Kommt noch · zahlt vor Ort“.
4. **Owner** — Kursdetail: nur Knopf „Teilnehmerliste“ (kein Check-in öffnen).
5. **Lehrer** (eigener Kurs) — Teilnehmerliste: Status ohne Methode („Bezahlt“); kein Zugriff auf Zahlungen › Offen.
6. **Vera** — Meine Anmeldungen: Label „Bezahlung vor Ort“ bzw. „Offen · bitte vor Ort bezahlen“.
7. **Owner** — Alt-Link `/course/…/kassieren` landet auf Teilnehmerliste.
8. **Owner** — Globale Teilnehmer: Link „Teilnehmerliste“, Spalte Bezahlung mit neuem Label.

Screenshots 360/1280 nach Klicktest (Julius).
