# STAND — Omlify DEV

Stand: 2026-10-08 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md) (Haltestelle 5 Klicktest)

## DEV

- Migrationen bis `20261008190000` (F2 open count archive waive; zuvor F1 `20261008180000` Legal L3)
- Functions: unverändert; Legal-RPCs `studio_tpl_accepted` / `get_public_studio_legal` / `current_terms_document_id` angepasst
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_process_legal_pdf`, `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: UX-10 `e2e/ux10.spec.ts`, UX-9 `e2e/ux9.spec.ts`, …; F1-Rauch `scripts/test/f1_legal_l3.mjs` (e2ef1leg)
- Demo: `npm run dev:demo:seed` — relativ zum Laufzeitpunkt; Seed 2026-10-08T17:06:44Z
- Legal-Templates: `agb.v1`/`v2`, `datenschutz.v1`/`v2`; CI `check_studio_legal_template_hashes`

## Zuletzt abgeschlossen

- **Nachtrag F** — Gesamt-Klicktest-Fixes F1–F5 (Release-Blocker L3 zuerst)
  - Bericht: [docs/berichte/nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md) — Haltestelle 5
- **UX-10** — Checkout Feinschliff + Kurskarte-Wording
- **UX-9** — Kauf-Sheet schlanker + Mehrfachkarte-Wording
- **UX-8** — Übersicht „Zu erledigen“
- **UX-7** — Kartenhinweis abschaltbar + Demo v3
- **UX-6** / **UX-6-2** — Teilnehmerliste Zahlstatus / Zeilenlayout
- **RT-1 Nachtrag** — Rechtliches UX

## Nächste Schritte

- Nachtrag F Haltestelle 5 Klicktest (Liste im Bericht)
- Ältere Haltestellen parallel offen, falls noch nicht abgehakt

## Haltestellen / wartet auf Julius

- **Nachtrag F Haltestelle 5** — [nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md)
- **UX-10 Haltestelle 5** — [ux10_checkout_kurskarte.md](berichte/ux10_checkout_kurskarte.md)
- **UX-9 Haltestelle 5** — [ux9_kartenkauf_wording.md](berichte/ux9_kartenkauf_wording.md)
- **UX-8 Haltestelle 5** — [ux8_uebersicht_zu_erledigen.md](berichte/ux8_uebersicht_zu_erledigen.md)
- **UX-7 Haltestelle 5** — [ux7_kartenhinweis_demo_v3.md](berichte/ux7_kartenhinweis_demo_v3.md)
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

Nachtrag F Klicktest abwarten → Bericht abschließen → Release-Plan.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Story: [docs/stories/nachtrag_gesamtklicktest_fixes.md](stories/nachtrag_gesamtklicktest_fixes.md)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md) (L3), [19_Wording_Kurskarte.md](entscheidungen/19_Wording_Kurskarte.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
