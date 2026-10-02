# STAND — Omlify DEV

Stand: 2026-10-02 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261002230000` (Claims zurückgeben ohne Zählung)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails`
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`) — 6 Fälle
  (3.2c ×3, 3.1 ×1, Datumsfelder ×2)

## Zuletzt abgeschlossen

- **Lauf 02.10.** — Übersicht: [docs/berichte/LAUF_2026-10-02.md](berichte/LAUF_2026-10-02.md)
- Kleine Punkte a–e — [docs/berichte/kleine_punkte_2026-10-02.md](berichte/kleine_punkte_2026-10-02.md)
- Release-Plan (nur Doku) — [docs/RELEASE_GELDKETTE_PLAN.md](RELEASE_GELDKETTE_PLAN.md) Abschnitt 0
- **3.1** Zahlungsübersicht — angehalten an Haltestelle 5 (Klicktest), Entscheidung 11 vorläufig
  - Bericht: [docs/berichte/3_1_zahlungsuebersicht.md](berichte/3_1_zahlungsuebersicht.md)
- **3.2c** Erstattung Oberfläche — angehalten an Haltestelle 5 (Klicktest)
  - Bericht: [docs/berichte/3_2c_erstattung_oberflaeche.md](berichte/3_2c_erstattung_oberflaeche.md)
- Davor: 3.2a / 3.2b — [docs/berichte/3_2ab_erstattung.md](berichte/3_2ab_erstattung.md)

## Nächste Schritte

Lauf 02.10. ist auf DEV fertig (Klicktest und ein paar Entscheidungen offen). Nächster Chat:

- Antworten von Julius zu den Fragen im Lauf-Bericht umsetzen
- Kein offener Code aus diesem Lauf

## Haltestellen / wartet auf Julius

- 3.2c, 3.1, Datumsfelder, Kursleiter: Klicktest (Listen im Lauf-Bericht; Haltestelle 5 hat den Lauf nicht blockiert)
- Entscheidung 11 bestätigen (dann „vorläufig“ entfernen)
- `backup-prod.yml`: `supabase/setup-cli@v1` belassen oder auf v2?
- Generalprobe: Test-Guard nur DEV-Ref, Probe ohne `demoalpha`
- Optional: PROD-Replay analog `scripts/dev/replay_provider_event.mjs`

## hier weitermachen

Lauf 02.10. abgeschlossen. Kein offener Implementierungsschritt. Weiter erst nach Julius’ Antworten (Fragen gesammelt in `docs/berichte/LAUF_2026-10-02.md`).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
