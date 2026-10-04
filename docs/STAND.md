# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md)

## DEV

- Migrationen bis `20261004150000` (B2 O1–O4 ops-monitor; davor legal_acceptances `20261004140000`, Belege bis `20261004122000`)
- Functions (deployt): `calendar-ics` (UX-4: json/inline), `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email`
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: UX-4 4/4; UX-2 2/2; UX-3 3/3; UX-2 B3 4/4
- Legal: AVV-Hash = SHA-256 normalisierter Markdown (`b90051ca…`); Stand 04.10.2026
- Deno: `npm run test:deno` 195/195 grün
- CI: lokal `npm run check:ci` grün; GitHub-Run siehe nach Push (Nummer nachziehen)

## Zuletzt abgeschlossen

- **CI-Hotfix** Lint `_info` entfernt; `npm run check:ci`; DoD vor Push; Lint-Warnungen in OFFENE_PUNKTE
- **UX-4 Feinschliff 2** Toast-Design/Undo, ⋯ mobil, Abmeldefrist, Erfolgsfenster, Kalender-Seite, Nav, Kopfleiste, AVV-Hash, FormField
  - Bericht: [docs/berichte/ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md) — Haltestelle 5
- **UX-3 Feinschliff** Toast, calendar-ics, Check-in-Wording, Export-Zeitraum, Kursdetail Desktop
  - Bericht: [docs/berichte/ux3_feinschliff.md](berichte/ux3_feinschliff.md)
- Entscheidungen 12 und 13 gelten

## Nächste Schritte

- Haltestelle 5: Klicktest UX-4 (Klickliste im Bericht) + Kalender auf echten Geräten
- Optional: Klicktest Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- Klicktest UX-4 — Haltestelle 5 ([ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md))
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Klicktests Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Haltestelle 5: Klickliste in [ux4_feinschliff_2.md](berichte/ux4_feinschliff_2.md).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
