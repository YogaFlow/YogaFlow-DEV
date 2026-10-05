# STAND — Omlify DEV

Stand: 2026-10-05 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [nachtrag_ux6_zeilenlayout.md](berichte/nachtrag_ux6_zeilenlayout.md) (Haltestelle 5 Klicktest)

## DEV

- Migrationen bis `20261005150000` (UX-6 get_upcoming_open_coverage; zuvor RT-1 `20261005140000`)
- Functions: `legal-pdf`, `dispatch-emails`, `payments-*` (+ bestehende)
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_process_legal_pdf`, `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: UX-6 `e2e/ux6.spec.ts`, RT-1 `e2e/rt1.spec.ts`, K1 `e2e/k1.spec.ts` (e2eapp)
- Demo: `node scripts/dev/demo_ux6.mjs` — alpha Heute/Gestern Zahlstatus

## Zuletzt abgeschlossen

- **UX-6-2 Nachtrag** — Personenzeile mobil luftiger + Demo
  - Bericht: [docs/berichte/nachtrag_ux6_zeilenlayout.md](berichte/nachtrag_ux6_zeilenlayout.md) — Haltestelle 5
- **UX-6** — Teilnehmerliste mit Zahlstatus (A–D, Entscheidung 18)
- **RT-1 Nachtrag A–C** — Rechtliches UX
- **K1 / ZW-1 Z8 / UX-5 RLS** — wie zuvor

## Nächste Schritte

- UX-6-2 Haltestelle 5 Klicktest (Liste im Bericht)
- RT-1 Nachtrag Haltestelle 5 / Z8 — parallel offen, falls noch nicht abgehakt

## Haltestellen / wartet auf Julius

- **UX-6-2 Haltestelle 5** — Klickliste in [nachtrag_ux6_zeilenlayout.md](berichte/nachtrag_ux6_zeilenlayout.md)
- **UX-6 Haltestelle 5** — [ux6_teilnehmerliste_zahlstatus.md](berichte/ux6_teilnehmerliste_zahlstatus.md) (ggf. mit Nachtrag erledigt)
- **RT-1 Nachtrag Haltestelle 5** — [nachtrag_rt1_rechtliches_ux.md](berichte/nachtrag_rt1_rechtliches_ux.md)
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach UX-6 Klicktest: Bericht abschließen → nächste Story.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [18_Teilnehmerliste_Zahlstatus.md](entscheidungen/18_Teilnehmerliste_Zahlstatus.md) (UX-6), [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md) (RT-1)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
