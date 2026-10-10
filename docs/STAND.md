# STAND — Omlify DEV

Stand: 2026-10-09 · Branch `Julius` · Hotfix Sitzung und Version (`f3356dc`)

## DEV

- Migrationen bis `20261009160000` (release cron; zuvor `…150000` studio-legal bucket, RT-2 Hashes)
- Functions: unverändert; RPC `retention_cleanup` (service_role); Cron `yogaflow_retention_cleanup` 03:15 UTC
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: + `yogaflow_retention_cleanup`; bestehende Legal/Pass/Ops-Jobs
- E2E: RT-2 `e2e/rt2.spec.ts` (e2eapp); Rauch `scripts/test/rt2_retention.mjs`
- Legal: `AGB.v2.md` Stand 09.10.2026 · Hash `815a10da…`; `privacy` 2026-10-08
- Demo: `npm run dev:demo:seed` — relativ zum Laufzeitpunkt

## Zuletzt abgeschlossen

- **Hotfix Sitzung und Version** — lokal abmelden, Sitzungswächter, Versionsleiste. Schritt 2 ✅, Schritt 3-Fix (Race Auth→next) gepusht, Klicktest 3 erneut.
  - Bericht: [docs/berichte/hotfix_sitzung_und_version.md](berichte/hotfix_sitzung_und_version.md)
- **RT-2 AGB § 9 Abs. 3+4** — wirksam mit Zugang, 30 Tage Export, Löschung nach AVV; Abs. 2 unverändert; AVV-Frist gleich
  - Bericht: [docs/berichte/rt2_omlify_rechtstexte_v2.md](berichte/rt2_omlify_rechtstexte_v2.md) — Haltestelle 5
- **RT-2 Omlify-Rechtstexte v2** — AGB/Datenschutz v2, Banner, Onboarding-Bundle, Retention
- **Hotfix Kurs-zuweisen mobil** — PROD live (#175 `5a40976`), `main` in Julius (`88c0694`)
- **Nachtrag F** — F1–F5 (L3 zuerst)

## Nächste Schritte

- **Hotfix Sitzung und Version** — Klicktest 1–5 auf DEV, dann PR `hotfix/sitzung-und-version` → `main`, nicht mergen bevor CI grün und der Klicktest durch ist
- **Release 2026-10** Entscheidungen E1–E9 (Phase 2); Generalprobe E3 (85er-Apply, Docker/Probe)
- RT-2 Haltestelle 5 Klicktest (Liste im Bericht)
- Nachtrag F / UX-Haltestellen parallel offen, falls noch nicht abgehakt

## Haltestellen / wartet auf Julius

- **Hotfix Sitzung und Version STOPP** — [hotfix_sitzung_und_version.md](berichte/hotfix_sitzung_und_version.md) · Klicktest Mac + iPhone
- **Release 2026-10 Freeze-Vorbereitung STOPP** — [release_2026-10_freeze_vorbereiten.md](berichte/release_2026-10_freeze_vorbereiten.md) · Probelauf 85 ohne Docker
- **Release 2026-10 Phase 1** — [release_2026-10_bestandsaufnahme.md](berichte/release_2026-10_bestandsaufnahme.md)
- **RT-2 Haltestelle 5** — [rt2_omlify_rechtstexte_v2.md](berichte/rt2_omlify_rechtstexte_v2.md)
- **Nachtrag F Haltestelle 5** — [nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md)
- **UX-10 / UX-9 / UX-8 / UX-7 / UX-6 / RT-1 Nachtrag** — siehe jeweilige Berichte
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Klicktest Sitzung und Version (Liste im Bericht). Parallel: andere offene Haltestellen.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Story: [docs/stories/rt2_delta_nachtrag_para9.md](stories/rt2_delta_nachtrag_para9.md)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
