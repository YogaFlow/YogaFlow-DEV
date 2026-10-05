# STAND — Omlify DEV

Stand: 2026-10-05 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [nachtrag_rt1_rechtliches_ux.md](berichte/nachtrag_rt1_rechtliches_ux.md) (Haltestelle 5 Klicktest)

## DEV

- Migrationen bis `20261005140000` (RT-1 Nachtrag change_release; zuvor `20261005130100` terms Trigger)
- Functions: `legal-pdf`, `dispatch-emails`, `payments-*` (+ bestehende)
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_process_legal_pdf`, `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: RT-1 `e2e/rt1.spec.ts` (Nachtrag A–C), K1 `e2e/k1.spec.ts` (e2eapp)
- Legal: Studio-Vorlagen v1; UI Übersicht→Detail; App ohne Fuß, Menü „Über {Studio}“
- Demo: `node scripts/dev/demo_rt1_legal.mjs` — alpha Impressum ohne AGB/Datenschutz-Freigabe; beta voll freigegeben

## Zuletzt abgeschlossen

- **RT-1 Nachtrag A–C** — Rechtliches UX (change_release, Übersicht/Detail, kein App-Fuß)
  - Bericht: [docs/berichte/nachtrag_rt1_rechtliches_ux.md](berichte/nachtrag_rt1_rechtliches_ux.md)
- **RT-1 Rest** — terms_document_id, PDF, Mail-Anhang, Demodata, E2E
- **K1-2 / K1 A–F / Widerruf** — Online-Kartenkauf
- **ZW-1 Z8** — Neu-Hinweis
- **UX-5 RLS-Korrektur** — `20261004250000`

## Nächste Schritte

- RT-1 Nachtrag Haltestelle 5 Klicktest (Liste im Bericht)
- Vor UX-6
- Klicktest Z8 (Vera / Nina) — parallel offen

## Haltestellen / wartet auf Julius

- **RT-1 Nachtrag Haltestelle 5** — Klickliste in [nachtrag_rt1_rechtliches_ux.md](berichte/nachtrag_rt1_rechtliches_ux.md)
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Klicktest Nachtrag RT-1: Bericht abschließen → UX-6.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md) (RT-1), [15_Karten_online.md](entscheidungen/15_Karten_online.md), [14_Zahlungswege.md](entscheidungen/14_Zahlungswege.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
