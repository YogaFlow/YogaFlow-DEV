# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux3_feinschliff.md](berichte/ux3_feinschliff.md)

## DEV

- Migrationen bis `20261004150000` (B2 O1–O4 ops-monitor; davor legal_acceptances `20261004140000`, Belege bis `20261004122000`)
- Functions (deployt): `calendar-ics` (neu UX-3), `ops-monitor`, `payments-jobs`, `payments-webhook`, `dispatch-emails`, `send-email`
- Secrets (Namen): `CALENDAR_ICS_SECRET` (neu); `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_ops_monitor` alle 15 min (+ bestehende jobs)
- ops_alerts offen: nur `demoalpha:disputes` (3); Fehlalarme O1–O3 erledigt
- E2E: UX-3 3/3; UX-2 B3 4/4 (Kursdetail-360 pixelgleich; Kasse-360 C1-Wording-Baseline)
- Legal: `src/generated/legalDocuments.ts` aus `docs/legal/*.md` (Build/Serve)
- Deno: `npm run test:deno` 195/195 grün (UX-3 Kalender-Token + Mail-Texte)

## Zuletzt abgeschlossen

- **UX-3 Feinschliff** Toast, calendar-ics, Check-in-Wording, Export-Zeitraum, Kursdetail Desktop
  - Bericht: [docs/berichte/ux3_feinschliff.md](berichte/ux3_feinschliff.md)
- **UX-2 Teil B3** Desktop Kursdetail + Kasse (360-Baseline zuerst) — siehe Bericht
  - Bericht: [docs/berichte/ux2_teil_b3.md](berichte/ux2_teil_b3.md)
- **UX-2 Teil B2** Export unter Zahlungen — Commit `3deea79`
  - Bericht: [docs/berichte/ux2_teil_b2.md](berichte/ux2_teil_b2.md)
- **UX-2 Teil B1** einheitliche Mail-Vorlage, ICS, multipart — Commit `0256764`
  - Bericht: [docs/berichte/ux2_teil_b1.md](berichte/ux2_teil_b1.md)
- **UX-2 Teil A** Checkout, Legal-Pop-up, FormField, ModalBackdrop — Commit `cd16a93`
  - Bericht: [docs/berichte/ux2_teil_a.md](berichte/ux2_teil_a.md)
- Entscheidungen 12 und 13 gelten

## Nächste Schritte

- Haltestelle 5: Klicktest UX-3 (Klickliste im Bericht) + Mail-Screenshots Gmail/iPhone
- Klicktest Nachtrag / 3.2c / 3.1

## Haltestellen / wartet auf Julius

- Klicktest UX-3 — Haltestelle 5 ([ux3_feinschliff.md](berichte/ux3_feinschliff.md))
- UX-2 B1: Test-Mail + Screenshots (weiterhin offen, falls noch nicht erledigt)
- Klicktests Nachtrag, 3.2c, 3.1
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Haltestelle 5: Klickliste in [ux3_feinschliff.md](berichte/ux3_feinschliff.md); Mail-Screenshots Gmail/iPhone.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
