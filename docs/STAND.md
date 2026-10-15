# STAND — Omlify DEV

Stand: 2026-10-15 · Branch `Julius` · Freeze `release-2026-10-freeze` = `7d68f03` (inkl. NU-1)

## DEV

- Migrationen bis `20261015180000` (**206** applied; NU-1 `send_studio_update`; Allowlist `…161000`, Onboarding-Legal `…161100`; Grants-Align `…205900` nachgezogen)
- Functions: unverändert; neu RPC `send_studio_update` (authenticated, Owner/Admin)
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_retention_cleanup` 03:15 UTC; bestehende Legal/Pass/Ops-Jobs
- E2E: RT-2 `e2e/rt2.spec.ts` (e2eapp); Rauch `scripts/test/rt2_retention.mjs`
- Legal: terms `2026-10-09` · privacy `2026-10-08` · avv `2026-10-04`; Onboarding speichert 3 Acceptances atomar
- Demo: `npm run dev:demo:seed` (demoalpha) · **YOMITA-Stand:** `demostudio` / Yoga am Rhein
- Plattform: `online_payments` an (DEV); Modus `allowlist`; Allowlist 8 Studios (ohne demoepsilon/demostudio)

## Zuletzt abgeschlossen

- **NU-1 „Neu für dich"** — Seite `/updates`, Glocke-Versand `send_studio_update`; DEV-Build success; Live-Merkmal `2026-10-zahlungen-im-blick` / `Kurskarte anlegen` in `index-Picg4PEw.js`; Tag `release-2026-10-freeze` = `7d68f03`. Bericht [nu1_neu_fuer_dich.md](berichte/nu1_neu_fuer_dich.md) · **STOPP Klicktest**
- **DEV-Demo YOMITA-Stand** — [demo_studio_yomita_stand.md](berichte/demo_studio_yomita_stand.md)
- **Legal-Cleanup DEV vor Release-Abend** — [release_2026-10_abend_legal_cleanup.md](berichte/release_2026-10_abend_legal_cleanup.md)

## Nächste Schritte

- **Klicktest NU-1** (demoalpha) — siehe Bericht
- **Release 2026-10 Abend** — [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md); PROD-Migrationen fehlend **91**; Freeze `7d68f03`

## Haltestellen / wartet auf Julius

- **NU-1 STOPP** — [nu1_neu_fuer_dich.md](berichte/nu1_neu_fuer_dich.md) · Klicktest
- **DEV-Demo YOMITA-Stand STOPP** — [demo_studio_yomita_stand.md](berichte/demo_studio_yomita_stand.md)
- **Release-Abend** — [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md)

## hier weitermachen

Klicktest NU-1, dann Release-Abend-Checkliste (Freeze `7d68f03`).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Story: NU-1 (Chat 15.10.2026)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
