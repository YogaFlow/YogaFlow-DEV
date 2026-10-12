# STAND — Omlify DEV

Stand: 2026-10-12 · Branch `Julius` · Allowlist + Onboarding-Legal vor Freeze

## DEV

- Migrationen bis `20261009161100` (**204** applied; Allowlist `…161000`, Onboarding-Legal `…161100`; davor Cron `…160000`)
- Functions: `onboarding-public` mit `p_legal_accepted`; RPC `set_online_payments_studio_allowed` / `set_online_payments_rollout` / `list_online_payments_effective` (service_role)
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_retention_cleanup` 03:15 UTC; bestehende Legal/Pass/Ops-Jobs
- E2E: RT-2 `e2e/rt2.spec.ts` (e2eapp); Rauch `scripts/test/rt2_retention.mjs`
- Legal: terms `2026-10-09` · privacy `2026-10-08` · avv `2026-10-04`; Onboarding speichert 3 Acceptances atomar
- Demo: `npm run dev:demo:seed` — relativ zum Laufzeitpunkt
- Plattform: `online_payments` an (DEV); Modus `allowlist`; Allowlist 8 Studios (ohne demoepsilon)

## Zuletzt abgeschlossen

- **Release 2026-10 · Allowlist + RT-2 Onboarding-Zustimmungen** — gebaut; **Klicktest A1/A2/B1 grün** (demoepsilon)
  - Migrationen `20261009161000`, `20261009161100`; DEV 204
  - Tests: `online_payments_allowlist.mjs`, `onboarding_legal_acceptances.mjs`
  - DEV-Build: Workers `omlify-dev` success für `1c173ed…` / `617b3a1…`
  - Bericht: [docs/berichte/release_2026-10_stripe_live_vorbereitung.md](berichte/release_2026-10_stripe_live_vorbereitung.md) · **STOPP Freeze**

- **Hotfix Sitzung und Version** — PR #176 gemergt (`06710c1`), PROD Bundle + `version.json` `no-cache` geprüft; `main` in Julius.
  - Bericht: [docs/berichte/hotfix_sitzung_und_version.md](berichte/hotfix_sitzung_und_version.md)
- **RT-2 AGB § 9 Abs. 3+4** — wirksam mit Zugang, 30 Tage Export, Löschung nach AVV
- **RT-2 Omlify-Rechtstexte v2** — AGB/Datenschutz v2, Banner, Onboarding-Bundle, Retention
- **Hotfix Kurs-zuweisen mobil** — PROD live (#175 `5a40976`)
- **Nachtrag F** — F1–F5 (L3 zuerst)

## Nächste Schritte

- **Release 2026-10** Freeze + Abendablauf §5 (nur omlifytest → Rauch → yomita; Modus `allowlist`)
- RT-2 Haltestelle 5 / Nachtrag F / UX parallel falls offen

## Haltestellen / wartet auf Julius

- **Stripe live Allowlist + Legal STOPP** — [release_2026-10_stripe_live_vorbereitung.md](berichte/release_2026-10_stripe_live_vorbereitung.md) · Klicktest grün → **Freeze**

- **Hotfix Sitzung und Version STOPP** — [hotfix_sitzung_und_version.md](berichte/hotfix_sitzung_und_version.md)
- **Release 2026-10 Freeze-Vorbereitung STOPP** — [release_2026-10_freeze_vorbereiten.md](berichte/release_2026-10_freeze_vorbereiten.md)
- **Release 2026-10 Phase 1** — [release_2026-10_bestandsaufnahme.md](berichte/release_2026-10_bestandsaufnahme.md)
- **RT-2 Haltestelle 5** — [rt2_omlify_rechtstexte_v2.md](berichte/rt2_omlify_rechtstexte_v2.md)
- **Nachtrag F Haltestelle 5** — [nachtrag_gesamtklicktest_fixes.md](berichte/nachtrag_gesamtklicktest_fixes.md)
- **UX-10 / UX-9 / UX-8 / UX-7 / UX-6 / RT-1 Nachtrag** — siehe jeweilige Berichte
- **Z8 Haltestelle** — [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Freeze + Release-Abend nach Stripe-Live-Bericht §5.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Story: [docs/stories/rt2_delta_nachtrag_para9.md](stories/rt2_delta_nachtrag_para9.md)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
