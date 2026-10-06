# STAND — Omlify DEV

Stand: 2026-10-06 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [ux7_kartenhinweis_demo_v3.md](berichte/ux7_kartenhinweis_demo_v3.md) (Haltestelle 5 Klicktest)

## DEV

- Migrationen bis `20261006120000` (UX-7 pass_hint; zuvor UX-6 `20261005150000`, RT-1 `20261005140000`)
- Functions: `legal-pdf`, `dispatch-emails`, `payments-*` (+ bestehende)
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_process_legal_pdf`, `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: UX-7 `e2e/ux7.spec.ts`, UX-6 `e2e/ux6.spec.ts`, RT-1 `e2e/rt1.spec.ts`, K1 `e2e/k1.spec.ts` (e2eapp)
- Demo: `node scripts/dev/demo_v3.mjs` / `npm run dev:demo:seed` — demoalpha v3

## Zuletzt abgeschlossen

- **UX-7** — Kartenhinweis abschaltbar (A), Buchungsleiste Frist-Umbruch (B), Demo v3 (C)
  - Bericht: [docs/berichte/ux7_kartenhinweis_demo_v3.md](berichte/ux7_kartenhinweis_demo_v3.md) — Haltestelle 5
- **UX-6-2 Nachtrag** — Personenzeile mobil luftiger + Demo
- **UX-6** — Teilnehmerliste mit Zahlstatus
- **RT-1 Nachtrag A–C** — Rechtliches UX

## Nächste Schritte

- UX-7 Haltestelle 5 Klicktest (Liste + Tabelle im Bericht)
- Ältere Haltestellen parallel offen, falls noch nicht abgehakt

## Haltestellen / wartet auf Julius

- **UX-7 Haltestelle 5** — Klickliste + Fall→Konto→Wo in [ux7_kartenhinweis_demo_v3.md](berichte/ux7_kartenhinweis_demo_v3.md)
- **UX-6-2 Haltestelle 5** — [nachtrag_ux6_zeilenlayout.md](berichte/nachtrag_ux6_zeilenlayout.md)
- **UX-6 Haltestelle 5** — [ux6_teilnehmerliste_zahlstatus.md](berichte/ux6_teilnehmerliste_zahlstatus.md)
- **RT-1 Nachtrag Haltestelle 5** — [nachtrag_rt1_rechtliches_ux.md](berichte/nachtrag_rt1_rechtliches_ux.md)
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach UX-7 Klicktest: Bericht abschließen → nächste Story.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Story: [docs/stories/ux7_kartenhinweis_demo_v3.md](stories/ux7_kartenhinweis_demo_v3.md)
- Entscheidungen: [18_Teilnehmerliste_Zahlstatus.md](entscheidungen/18_Teilnehmerliste_Zahlstatus.md) (UX-6), [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md) (RT-1)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
