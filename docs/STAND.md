# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261004100000` (B1 Belege; davor `20261004090000` Anbieterangaben)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails`
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`) — 11 Fälle
  (3.2c ×3, 3.1 ×1, Datumsfelder ×2, UX-1 ×5)
- Probe-Guard: `OMLIFY_PROBE_REF` + `--probe` / `OMLIFY_ALLOW_PROBE=1` (nicht gegen Probe/PROD ausgeführt)

## Zuletzt abgeschlossen

- **UX-1** Erstatten / Zahlungen-Reiter / Einstellungen — **fertig**
  (Klicktest Julius 04.10.2026, alle Punkte ok, 360 + 1280 px)
  - Bericht: [docs/berichte/ux1_zahlungen_erstatten_einstellungen.md](berichte/ux1_zahlungen_erstatten_einstellungen.md)
- **Nachtrag Lauf 02.10.** — Antworten umgesetzt; Klicktest offen
  - Bericht: [docs/berichte/nachtrag_lauf_2026-10-02.md](berichte/nachtrag_lauf_2026-10-02.md)
- **Lauf 02.10.** — Übersicht: [docs/berichte/LAUF_2026-10-02.md](berichte/LAUF_2026-10-02.md)
- Kleine Punkte a–e — [docs/berichte/kleine_punkte_2026-10-02.md](berichte/kleine_punkte_2026-10-02.md)
- Release-Plan (nur Doku) — [docs/RELEASE_GELDKETTE_PLAN.md](RELEASE_GELDKETTE_PLAN.md) Abschnitt 0 (+ §0.11 PROD-Replay)
- **3.1** Zahlungsübersicht — Klicktest offen; Entscheidung 11 gilt (bestätigt 04.10.2026)
- **3.2c** Erstattung Oberfläche — Klicktest offen
- Entscheidungen 12 (Kaufprozess) und 13 (Überwachung/AVV) gelten
  - [12_Kaufprozess_Rechtliches.md](entscheidungen/12_Kaufprozess_Rechtliches.md)
  - [13_Ueberwachung_AVV.md](entscheidungen/13_Ueberwachung_AVV.md)

## Nächste Schritte

- Story B1 (Anbieterangaben, Bestellknopf, Bestätigungs-E-Mail, Belege)
- Story B2 (Überwachung, AVV v2, AVV-Zustimmung)
- Klicktest Nachtrag (stornierte Buchungen bis Kursende / pending / failed)
- Klicktest 3.2c + 3.1

## Haltestellen / wartet auf Julius

- Nachtrag + 3.2c + 3.1: Klicktest
- Optional: Probe-Lauf freigeben (nicht autonom gegen Probe)

## hier weitermachen

B1 Teil A+C (Schema/RPCs/Tests) liegen auf Julius. **Als Nächstes in B1:**
1. Teil D — `dispatch-emails` Vertragsbestätigung (K6), `send-email` fromName/replyTo (K7), Gate ohne Beleg, Erstattungsmail mit Beleglink (K9)
2. Teil B — Texte `legalCheckoutTexts.ts`, Knopf „Weiter zur Buchung“ / „Zahlungspflichtig buchen“, Sheet-Block K5
3. Einstellungen → Rechtliches → Anbieterangaben + Aufmerksamkeit
4. Seite `/receipts/:id`, Links in Meine Anmeldungen und Zahlungen, CSV-Spalte Belegnummer
5. Kurs anlegen/ändern: Hinweis > 250 €
6. E2E (3 Fälle) + `dev:check` / `dev:test`
Danach B2: zuerst Überwachung (`ops-monitor`), AVV hängt am Sperr-Mechanismus K2 (schon da).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
