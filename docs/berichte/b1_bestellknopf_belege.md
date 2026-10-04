# Bericht B1 — Studio-Angaben, Bestellknopf, Bestätigung, Belege

Status: **fertig** (Klicktest offen, Haltestelle 5 blockiert nicht). Stand 04.10.2026.

Vorgabe: [docs/stories/b1_bestellknopf_bestaetigung_belege.md](../stories/b1_bestellknopf_bestaetigung_belege.md).
Entscheidung 12 gilt: [12_Kaufprozess_Rechtliches.md](../entscheidungen/12_Kaufprozess_Rechtliches.md).

## Commits

- `6550508` feat(geldkette): B1 Anbieterangaben, Sperre und Preisgrenze 250 Euro
- `9aa624f` feat(geldkette): B1 Belege ausstellen und lesen
- `cbbd323` feat(geldkette): B1 Bestätigungsmail und Absender mit Reply-To
- `5391d5e` feat(geldkette): B1 Bestellknopf, Anbieterangaben und Belegseite
- (Doku) Bericht, STAND, Release-Plan

## DoD

- `dev:apply` für `20261004090000`, `20261004100000`, `20261004110000` grün
- `b1_legal_profiles.mjs` und `b1_receipts.mjs` grün
- Unit-Texte K4–K9 grün (`legal_checkout_texts.ts`)
- Deno `dispatch-emails` inkl. RECEIPT_PENDING und Vertragsbestätigung grün
- `tsc` grün
- Functions auf DEV: `dispatch-emails`, `send-email`
- E2E `e2e/b1.spec.ts` angelegt (3 Fälle); Lauf nach Deploy der SPA (Cloudflare aus Julius)

Keine Haltestelle 1. Kein Auto-Fill echter Studios.

## Klickliste (Julius)

1. Einstellungen → Rechtliches: Anbieterangaben speichern (360 + 1280).
2. Ohne Angaben: Aufmerksamkeit „Anbieterangaben fehlen…“; Kursknopf heißt „Anmelden“.
3. Mit Angaben: Kursknopf „Weiter zur Buchung“.
4. Sheet: Block „Deine Buchung“, Preis mit Steuer, Widerruf, Knopf genau „Zahlungspflichtig buchen“.
5. Mit 4242… buchen → Meine Anmeldungen → Beleg öffnen, Nummer und Steuertext.
6. Echte Bestätigungsmail ansehen (Betreff Buchungsbestätigung, Beleglink, Absender „{Studio} über Omlify“).
7. Owner erstattet 10 € → Zahlungen-Detail → Erstattungsbeleg.
8. Kurspreis > 250 €: Hinweis vor Ort.
9. CSV-Export: Spalte Belegnummer.

## Offen / Fragen

Keine fachliche Entscheidung. Klicktest und echte Mail prüft Julius.
