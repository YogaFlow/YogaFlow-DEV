# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261004140000` (B2 legal_acceptances; davor ops-monitor `20261004130000`, B1 Belege bis `20261004122000`)
- Functions (deployt): `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email`
- Secrets (Namen): `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- E2E: B1 3/3 grün (04.10.); `_dev` akzeptiert AVV vor Online-Schalter

## Zuletzt abgeschlossen

- **B2** Überwachung + AVV-Zustimmung — **fertig** (Klicktest offen)
  - Bericht: [docs/berichte/b2_ueberwachung_avv.md](berichte/b2_ueberwachung_avv.md)
  - Lauf: [docs/berichte/LAUF_B1_B2.md](berichte/LAUF_B1_B2.md)
- **B1 Nachtrag N1–N6** — Belegfehler blockiert nie Zahlung; `retry_missing_receipts`; Steuer zum Zahlungsdatum; kein §-19-Raten; voller Satz; E2E 3/3
  - Bericht: [docs/berichte/b1_bestellknopf_belege.md](berichte/b1_bestellknopf_belege.md)
- **B2 V0** AVV-Text Version 2 — Stand 04.10.2026, gerendert, kein PROD-Deploy
- **UX-1** — fertig (Klicktest Julius 04.10.)
- Entscheidungen 12 und 13 gelten

## Nächste Schritte

- Klicktest B1 + B2 (gemeinsame Liste in LAUF_B1_B2)
- Klicktest Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- Klicktests B1, B2, Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra

## hier weitermachen

B2 fertig auf Julius (Klicktest offen). Nächster Fokus: Klicktests / Release-Vorbereitung Geldkette.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
