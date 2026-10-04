# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md)

## DEV

- Migrationen bis `20261004180000` (UX-4 N1 AVV content_hash; davor B2 ops-monitor `20261004150000`)
- Functions (deployt): `calendar-ics` (UX-4: json/inline), `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email`
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: UX-4 Undo+Balken; UX-2 2/2; UX-3 3/3
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`; alte Zustimmung demoalpha zählt nicht → Banner
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` grün; GitHub **#223** success (`6b1fea6`, [Lauf](https://github.com/YogaFlow/YogaFlow-DEV/actions/runs/37215949862))

## Zuletzt abgeschlossen

- **UX-4 Nachtrag N1–N3** AVV content_hash, Toast-Zeitbalken 3 px, mobil Buchungsleiste
  - Bericht: [docs/berichte/ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md)
- **CI-Hotfix** Lint `_info`; `npm run check:ci`; Lint-Warnungen in OFFENE_PUNKTE
- **UX-4 Feinschliff 2** Toast-Design/Undo, ⋯ mobil, Abmeldefrist, Erfolgsfenster, Kalender-Seite, Nav, Kopfleiste, AVV-Hash, FormField

## Nächste Schritte

- Klicktest Nachtrag N1–N3 (AVV-Banner, Toast-Balken, Buchungsleiste mobil)
- Optional: Klicktest Nachtrag / 3.2c / 3.1; Kalender echte Geräte

## Haltestellen / wartet auf Julius

- Klicktest UX-4 Nachtrag N1–N3 — [ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Klicktests Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Klicktest Nachtrag N1–N3 in [ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
