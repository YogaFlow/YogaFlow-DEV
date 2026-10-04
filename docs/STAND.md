# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md) (Z8)

## DEV

- Migrationen bis `20261004260000` (Z8 Neu-Hinweis unabhängig vom Standard; davor `20261004250000` RLS≠Anzeige)
- Functions (deployt): `calendar-ics`, `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email` (unverändert)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: ZW-1 1/1 (inkl. Z8 Vor Ort+Hinweis); UX-5 1/1 + Archive 1/1 (`e2eapp`)
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` (vor Push)
- Demo: Vera `hint_seen` null + `last=onsite` (Z8); Nina: Hatha-Storno bleibt — Für Rückgängig Vor Ort wählen

## Zuletzt abgeschlossen

- **ZW-1 Z8** — Neu-Hinweis unabhängig vom Standard-Weg; UI-Switch-Zeile bei Vor-Ort-Default; Unit 4 Fälle; E2E; Entscheidung 14
  - Bericht: [docs/berichte/zw1_zahlungswege.md](berichte/zw1_zahlungswege.md) → STOPP Klickliste Z8 (2 Punkte)
- **UX-5 RLS-Korrektur** — `20261004250000`; Regel `rls-access-not-display`

## Nächste Schritte

- Klicktest Z8 (Vera Neu-Hinweis; Nina Rückgängig Vor Ort)

## Haltestellen / wartet auf Julius

- **Z8 Haltestelle** — genau 2 Klickpunkte in [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Klicktest Z8: Freigabe oder nächste Story.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [docs/entscheidungen/14_Zahlungswege.md](entscheidungen/14_Zahlungswege.md) (Z8)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
