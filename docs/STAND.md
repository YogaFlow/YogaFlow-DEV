# STAND — Omlify DEV

Stand: 2026-10-09 · Branch `Julius` · RT-2 AGB § 9 Abs. 3 Klarstellung (neuer terms-Hash)

## DEV

- Migrationen bis `20261009120000` (AGB Abs. 3 Wirksamwerden-Hash; zuvor `20261008200000` Retention)
- Functions: unverändert; RPC `retention_cleanup` (service_role); Cron `yogaflow_retention_cleanup` 03:15 UTC
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: + `yogaflow_retention_cleanup`; bestehende Legal/Pass/Ops-Jobs
- E2E: RT-2 `e2e/rt2.spec.ts` (e2eapp); Rauch `scripts/test/rt2_retention.mjs`
- Legal: `AGB.v2.md` Stand 09.10.2026 · Hash `9acd5496…`; `privacy` 2026-10-08
- Demo: `npm run dev:demo:seed` — relativ zum Laufzeitpunkt

## Zuletzt abgeschlossen

- **RT-2 AGB § 9 Abs. 3** — Halbsatz „bis zum Wirksamwerden“; neuer terms-Hash → Banner erneut
  - Bericht: [docs/berichte/rt2_omlify_rechtstexte_v2.md](berichte/rt2_omlify_rechtstexte_v2.md) — Haltestelle 5
- **RT-2 Omlify-Rechtstexte v2** — AGB/Datenschutz v2, Banner, Onboarding-Bundle, Retention
- **Hotfix Kurs-zuweisen mobil** — PROD live (#175 `5a40976`), `main` in Julius (`88c0694`)
- **Nachtrag F** — F1–F5 (L3 zuerst)

## Nächste Schritte

- RT-2 Haltestelle 5 Klicktest (Liste im Bericht)
- Nachtrag F / UX-Haltestellen parallel offen, falls noch nicht abgehakt

## Haltestellen / wartet auf Julius

- **RT-2 Haltestelle 5** — [rt2_omlify_rechtstexte_v2.md](berichte/rt2_omlify_rechtstexte_v2.md)
- **Nachtrag F Haltestelle 5** — [nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md)
- **UX-10 / UX-9 / UX-8 / UX-7 / UX-6 / RT-1 Nachtrag** — siehe jeweilige Berichte
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

RT-2 Klicktest (Haltestelle 5). Parallel: andere offene Haltestellen.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Story: [docs/stories/rt2_omlify_rechtstexte_v2.md](stories/rt2_omlify_rechtstexte_v2.md)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
