# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)

## DEV

- Migrationen bis `20261004220000` (ZW-1 N4 Z7; davor N1 Hint `20261004210000`, ZW-1 `20261004200000`)
- Functions (deployt): `calendar-ics`, `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email` (unverändert im Nachtrag)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: ZW-1 Nachtrag 1/1 (`e2eapp`, 6 Fälle); UX-4 Undo+Balken; UX-2 2/2; UX-3 3/3
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` grün (nach ZW-1 Nachtrag N1–N4)

## Zuletzt abgeschlossen

- **ZW-1 Nachtrag N1–N4** — Zahlart-Zeile, Toast-Dauer, E2E sechs Fälle, Z7 last_booking_pay_method + LAST_METHOD-Doku
  - Bericht: [docs/berichte/zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- **ZW-1 Zahlungswege / Ein-Tipp-Buchung** — Entscheidung 14, `booking_payment_options`
  - Bericht: [docs/berichte/zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)

## Nächste Schritte

- Klicktest ZW-1 Nachtrag (Liste in [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md))
- Optional: Klicktest UX-4 Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- **Klicktest ZW-1 Nachtrag N1–N4** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Klicktest ZW-1 Nachtrag in [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
