# STAND — Omlify DEV

Stand: 2026-10-15 · Branch `Julius` · Freeze `release-2026-10-freeze` = NU-1 Teil 2 (Freigabe + Zuklappen)

## DEV

- Migrationen bis `20261015193000` (**207** applied; NU-1 Freigaben `studio_update_releases`; Allowlist `…161000`, Onboarding-Legal `…161100`; Grants-Align `…205900` nachgezogen)
- Functions: RPCs `list_released_updates`, `list_studio_update_sends`; `send_studio_update` prüft Freigabe
- Secrets (Namen): `LEGAL_PDF_SECRET` (Vault); `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_retention_cleanup` 03:15 UTC; bestehende Legal/Pass/Ops-Jobs
- E2E: RT-2 `e2e/rt2.spec.ts` (e2eapp); Rauch `scripts/test/rt2_retention.mjs`
- Legal: terms `2026-10-09` · privacy `2026-10-08` · avv `2026-10-04`; Onboarding speichert 3 Acceptances atomar
- Demo: `npm run dev:demo:seed` (demoalpha) · **YOMITA-Stand:** `demostudio` / Yoga am Rhein
- Plattform: `online_payments` an (DEV); Modus `allowlist`; Allowlist 8 Studios (ohne demoepsilon/demostudio)
- Neuigkeiten: DEV alle 4 IDs freigegeben; PROD startet ohne Freigaben

## Zuletzt abgeschlossen

- **NU-1 Teil 2** — Freigabe pro Neuigkeit + Zuklappen nach Senden. Bericht [nu1_neu_fuer_dich.md](berichte/nu1_neu_fuer_dich.md) · **STOPP Klicktest Teil 2**
- **NU-1 Nachbesserung** — Menü unter Einstellungen, Glocken-Modal Portal, Empfänger-Scroll
- **Asset-404** — fehlende `/assets/*` sind 404 statt HTML mit `immutable`
- **DEV-Demo YOMITA-Stand** — [demo_studio_yomita_stand.md](berichte/demo_studio_yomita_stand.md)

## Nächste Schritte

- **Klicktest NU-1 Teil 2** (demoalpha) — siehe Bericht
- **Release 2026-10 Abend** — [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md); PROD-Migrationen fehlend **92**; Freeze = Tag `release-2026-10-freeze`

## Haltestellen / wartet auf Julius

- **NU-1 STOPP Teil 2** — [nu1_neu_fuer_dich.md](berichte/nu1_neu_fuer_dich.md) · Klicktest
- **DEV-Demo YOMITA-Stand STOPP** — [demo_studio_yomita_stand.md](berichte/demo_studio_yomita_stand.md)
- **Release-Abend** — [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md)

## hier weitermachen

Klicktest NU-1 Teil 2 und Asset-Check auf dem neuen Freeze.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Story: NU-1 Teil 2 (Chat 15.10.2026)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
