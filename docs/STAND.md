# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261004150000` (B2 O1–O4 ops-monitor; davor legal_acceptances `20261004140000`, Belege bis `20261004122000`)
- Functions (deployt): `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email`
- Secrets (Namen): `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: B1 3/3 grün (04.10.); `_dev` akzeptiert AVV per RPC vor Online-Schalter

## Zuletzt abgeschlossen

- **B2 O1–O4** Cron-Toleranz, ledger nur mit Steuerstatus, `reviewed_at`, Tests + Rauchtest
  - Bericht: [docs/berichte/b2_ueberwachung_avv.md](berichte/b2_ueberwachung_avv.md)
- **B2** Überwachung + AVV-Zustimmung — **fertig** (Klicktest offen)
  - Lauf: [docs/berichte/LAUF_B1_B2.md](berichte/LAUF_B1_B2.md)
- **B1 Nachtrag N1–N6** — Belegfehler blockiert nie Zahlung; `retry_missing_receipts`; Steuer zum Zahlungsdatum; kein §-19-Raten; voller Satz; E2E 3/3
  - Bericht: [docs/berichte/b1_bestellknopf_belege.md](berichte/b1_bestellknopf_belege.md)
- Entscheidungen 12 und 13 gelten

## Nächste Schritte

- Klicktest B1 + B2 (gemeinsame Liste in LAUF_B1_B2)
- Klicktest Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- Klicktests B1, B2, Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

B2 inkl. O1–O4 auf Julius. Nächster Fokus: Klicktests.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
