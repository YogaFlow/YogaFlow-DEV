# STAND — Omlify DEV

Stand: 2026-10-02 · Branch `Julius` · HEAD siehe `git log -1` (letzter Story-Commit `86154f4`)

## DEV

- Migrationen bis `20261002210000` (3.2c Lese-RPCs Erstattungsstand und Vorschauen)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails`
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`)

## Zuletzt abgeschlossen

- **3.2c** Erstattung Oberfläche — angehalten an Haltestelle 5 (Klicktest), Logik/Gestaltung/E2E grün
- Bericht: [docs/berichte/3_2c_erstattung_oberflaeche.md](berichte/3_2c_erstattung_oberflaeche.md)
- Davor: 3.2a / 3.2b — [docs/berichte/3_2ab_erstattung.md](berichte/3_2ab_erstattung.md)

## Nächste Story

- **3.1** Zahlungsübersicht (Entscheidung 11 vorläufig, Lese-RPC, Bereich „Zahlungen“)

## Haltestellen / wartet auf Julius

- 3.2c: Klicktest (Klickliste im Bericht), zwei Fragen im Bericht
- Optional: PROD-Replay analog `scripts/dev/replay_provider_event.mjs` (siehe OFFENE_PUNKTE)

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
