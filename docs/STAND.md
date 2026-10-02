# STAND — Omlify DEV

Stand: 2026-10-02 · Branch `Julius` · HEAD siehe `git log -1` (letzter Story-Commit `32fae53`)

## DEV

- Migrationen bis `20261002223000` (3.1 Glocken-Ziel zur Zahlung)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails`
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`) — 4 Fälle

## Zuletzt abgeschlossen

- **3.1** Zahlungsübersicht — angehalten an Haltestelle 5 (Klicktest), Entscheidung 11 vorläufig
  - Bericht: [docs/berichte/3_1_zahlungsuebersicht.md](berichte/3_1_zahlungsuebersicht.md)
- **3.2c** Erstattung Oberfläche — angehalten an Haltestelle 5 (Klicktest)
  - Bericht: [docs/berichte/3_2c_erstattung_oberflaeche.md](berichte/3_2c_erstattung_oberflaeche.md)
- Davor: 3.2a / 3.2b — [docs/berichte/3_2ab_erstattung.md](berichte/3_2ab_erstattung.md)

## Nächste Schritte im Lauf 02.10.

- Kleine Punkte a–e (Kursleiter-Auswahl, Claims zurückgeben, CI Node 24, DEP0190, Datumsfelder)
- Release-Plan `docs/RELEASE_GELDKETTE_PLAN.md` (nur Doku)
- Übersicht `docs/berichte/LAUF_2026-10-02.md`

## Haltestellen / wartet auf Julius

- 3.2c und 3.1: Klicktest (Klicklisten in den Berichten), Fragen in den Berichten
- Entscheidung 11 bestätigen
- Optional: PROD-Replay analog `scripts/dev/replay_provider_event.mjs` (siehe OFFENE_PUNKTE)

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
