# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD `2d77a75`

## DEV

- Migrationen bis `20261004150000` (B2 O1–O4 ops-monitor; davor legal_acceptances `20261004140000`, Belege bis `20261004122000`)
- Functions (deployt): `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email` (UX-2 B1 Mail-Hülle + ICS)
- Secrets (Namen): `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: B1 3/3 grün (04.10.); `_dev` akzeptiert AVV per RPC vor Online-Schalter
- Legal: `src/generated/legalDocuments.ts` aus `docs/legal/*.md` (Build/Serve)
- Deno: `npm run test:deno` 189/189 grün (UX-2 B1)

## Zuletzt abgeschlossen

- **UX-2 Teil B1** einheitliche Mail-Vorlage, ICS, multipart — Commit `0256764`
  - Bericht: [docs/berichte/ux2_teil_b1.md](berichte/ux2_teil_b1.md)
- **UX-2 Teil A** Checkout, Legal-Pop-up, FormField, ModalBackdrop — Commit `cd16a93`
  - Bericht: [docs/berichte/ux2_teil_a.md](berichte/ux2_teil_a.md)
- **Klicktest B1+B2** (Julius, 04.10.) — bestanden bis auf Gestaltung; Feedback → UX-2
  - Lauf: [docs/berichte/LAUF_B1_B2.md](berichte/LAUF_B1_B2.md)
- **B2 O1–O4** Cron-Toleranz, ledger nur mit Steuerstatus, `reviewed_at`, Tests + Rauchtest
  - Bericht: [docs/berichte/b2_ueberwachung_avv.md](berichte/b2_ueberwachung_avv.md)
- Entscheidungen 12 und 13 gelten

## Nächste Schritte

- UX-2 B2 Export (Zahlungen), B3 Desktop
- Vor B3: Referenz-Screenshots Kursdetail + Kasse 360 px
- Haltestelle 5: Mail-Ansicht DEV-Postfach + Screenshots Gmail/iPhone (hell/dunkel)
- Klicktest Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- Klicktest UX-2 Teil A (siehe LAUF_UX2)
- UX-2 B1: Test-Mail + Screenshots (Haltestelle 5)
- Klicktests Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

UX-2 B2 Export unter Zahlungen; vor B3 zwingend 360-Referenz-Screenshots Kursdetail + Kasse.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
