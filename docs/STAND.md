# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md)

## DEV

- Migrationen bis `20261004230000` (UX-5 `archived_at`; davor ZW-1 N4 `20261004220000`)
- Functions (deployt): `calendar-ics`, `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email` (unverändert)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: UX-5 1/1 (`e2eapp`); ZW-1 Nachtrag 1/1; UX-4 Undo+Balken; UX-2 2/2; UX-3 3/3
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` grün (UX-5 A/B/C)
- Demo: `demoalpha` Reset + Seed v2; Zugangsdaten nur `supabase/.env.dev` (`DEMO_*`)

## Zuletzt abgeschlossen

- **UX-5 C** — `archived_at` Kurse/Mitglieder; Reset ohne Folgeaktionen; Seed v2; Zahlungen-Filter Archiv
  - Bericht: [docs/berichte/ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md) → Haltestelle 5
- **UX-5 A/B** — Buchungsleiste gestapelt; Toast 4 s / Undo nur Abmelden 6 s
- **ZW-1 Nachtrag N1–N4** — Bericht [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)

## Nächste Schritte

- Klicktest UX-5 (Haltestelle 5) in demoalpha

## Haltestellen / wartet auf Julius

- **UX-5 Haltestelle 5** — Klickliste in [ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md)
- Klicktest ZW-1 Nachtrag N1–N4 (teilweise erledigt laut Story UX-5)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Klicktest UX-5: Freigabe oder Nachzüge aus der Klickliste.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
