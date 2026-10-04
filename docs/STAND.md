# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md)

## DEV

- Migrationen bis `20261004250000` (RLS ohne Anzeige-Filter; davor `20261004240000` get_open_coverage, `20261004230000` archived_at)
- Functions (deployt): `calendar-ics`, `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email` (unverändert)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: UX-5 1/1 + Archive 1/1 (`e2eapp`); ZW-1 Nachtrag 1/1; UX-4 Undo+Balken; UX-2 2/2; UX-3 3/3
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` grün
- Demo: `demoalpha` Reset + Seed v2; Zugangsdaten nur `supabase/.env.dev` (`DEMO_*`)

## Zuletzt abgeschlossen

- **UX-5 RLS-Korrektur** — `archived_at` aus vier SELECT-Policies entfernt (`20261004250000`); Anzeige nur über `visibleScope` + Listen-RPCs; Zahlungen-Archiv/CSV mit Namen; Regel `rls-access-not-display`
  - Bericht: [docs/berichte/ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md) → Haltestelle 5
- **UX-5 A/B/C + Nachzug** — Buchungsleiste, Toast, Reset/Seed, Archiv-Filter in Lese-Schicht

## Nächste Schritte

- Klicktest UX-5 (kurze Liste: Übersicht, Zahlungen-Archiv mit Kursnamen, Export)

## Haltestellen / wartet auf Julius

- **UX-5 Haltestelle 5** — kurze Klickliste in [ux5_buchungsleiste_toast_demo.md](berichte/ux5_buchungsleiste_toast_demo.md)
- Klicktest ZW-1 Nachtrag N1–N4 (teilweise erledigt laut Story UX-5)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Klicktest UX-5: Freigabe oder Rest aus der Liste.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
