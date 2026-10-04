# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261002230000` (Claims zurückgeben ohne Zählung)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails`
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`) — 6 Fälle
  (3.2c ×3, 3.1 ×1, Datumsfelder ×2)
- Probe-Guard: `OMLIFY_PROBE_REF` + `--probe` / `OMLIFY_ALLOW_PROBE=1` (nicht gegen Probe/PROD ausgeführt)

## Zuletzt abgeschlossen

- **Nachtrag Lauf 02.10.** — Antworten umgesetzt; angehalten an Haltestelle 5 (Klicktest)
  - Bericht: [docs/berichte/nachtrag_lauf_2026-10-02.md](berichte/nachtrag_lauf_2026-10-02.md)
- **Lauf 02.10.** — Übersicht: [docs/berichte/LAUF_2026-10-02.md](berichte/LAUF_2026-10-02.md)
- Kleine Punkte a–e — [docs/berichte/kleine_punkte_2026-10-02.md](berichte/kleine_punkte_2026-10-02.md)
- Release-Plan (nur Doku) — [docs/RELEASE_GELDKETTE_PLAN.md](RELEASE_GELDKETTE_PLAN.md) Abschnitt 0 (+ §0.11 PROD-Replay)
- **3.1** Zahlungsübersicht — Klicktest offen, Entscheidung 11 weiter vorläufig
- **3.2c** Erstattung Oberfläche — Klicktest offen

## Nächste Schritte

- Klicktest Nachtrag (stornierte Buchungen bis Kursende / pending / failed)
- Entscheidung 11 bestätigen (Platzhalter in der Antwort war leer)
- Kein offener Implementierungsschritt außer nach Julius’ Freigabe

## Haltestellen / wartet auf Julius

- Nachtrag + 3.2c + 3.1: Klicktest
- Entscheidung 11 bestätigen
- Optional: Probe-Lauf freigeben (nicht autonom gegen Probe)

## hier weitermachen

Nachtrag Antworten fertig. Haltestelle Klicktest. Weiter nach Julius’ Klickfeedback bzw. Entscheidung 11.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
