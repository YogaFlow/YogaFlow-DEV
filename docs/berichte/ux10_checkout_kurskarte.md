# Bericht UX-10 — Checkout-Feinschliff, „Kurskarte“ statt „Mehrfachkarte“

Stand: 2026-10-07 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

Grundlage: [ux10_checkout_kurskarte.md](../stories/ux10_checkout_kurskarte.md), Entscheidung [19_Wording_Kurskarte.md](../entscheidungen/19_Wording_Kurskarte.md).

## Erledigt

| Teil | Inhalt |
|---|---|
| E19 | Entscheidung 19 fortgeschrieben, Datei umbenannt (`19_Wording_Kurskarte.md`), W1/W1a |
| Wording | „Mehrfachkarte(n)“ → „Kurskarte(n)“ in `src/`, Mails, `docs/legal/`; Template-Hashes DEV aktualisiert (`scripts/dev/ux10_legal_tpl_hash.mjs`); demobeta erneut freigegeben; demoalpha muss Owner erneut freigeben |
| A | Accordion `radios: 'always'` + `spacedAccordionItems`; Reihenfolge Apple/Google/card; Überschrift „Wie möchtest du bezahlen?“; Schloss-Hinweis; Appearance 48 px |
| B | Kurs: Titel + Meta (`mit Lehrerin`) + Beruhigung Frist/vorbei; Kurskarte: Meta + „mit Kurskarte buchbar“ |
| C | Knopf „Zahlung läuft …“ + Spinner, gesperrt; Sheet nicht schließbar während busy; Consent vor Token |

## Nachweise

- `npm run check:ci` — grün
- Unit `scripts/test/ux10_checkout_summary.ts`
- Unit `k1_pass_texts` (Kurskarte-Meta), `s2_2b_1_client` (Accordion radios)
- E2E `e2e/ux10.spec.ts` (e2eapp) — Kurs-Zusammenfassung + Fristzeile + Zahlarten-Überschrift; Kurskarte-Sheet Meta; Menü „Kurskarten“
- Edge Functions DEV: `npm run functions:dev` (Kurskarte in dispatch-emails)
- Textsuche `Mehrfachkarte` in `src/`, `docs/legal/`, `supabase/functions/`, `scripts/test/`, `e2e/` = 0

## Deploy-Nachweis (vor Haltestelle 5)

| Prüfung | Ergebnis |
|---|---|
| HEAD | `c267655` |
| Check-Run **Workers Builds: omlify-dev** | `success` für `c267655` (2026-10-07T12:27:25Z) |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-DeomH7bC.js` |
| Merkmal | `chtest du bezahlen` @700601; `mit Kurskarte buchbar` @700564; `Kartendaten sehen wir nicht` @700662; `Abmeldefrist ist vorbei` @592881; `Mehrfachkarte` = −1 |

## Haltestelle 5 — Klickliste (max. 8)

1. **Teilnehmerin demoalpha** — Kurs online buchen: Zusammenfassung (Titel, Meta mit Ort/`mit …`, Abmeldefrist oder „vorbei“).
2. **Zahlarten** — Accordion-Zeilen; Überschrift „Wie möchtest du bezahlen?“; Schloss-Hinweis; Logos bei Karte.
3. **Zahlung 4242** — Knopf „Zahlung läuft …“, Sheet nicht schließbar; Erfolg wie bisher.
4. **Ablehnung** — Testkarte `4000 0000 0000 0002`: Fehlermeldung deutsch, Knopf wieder aktiv.
5. **Kurskarten** — Sheet: Produktname, „10 Termine · … · … pro Termin“, Häkchen-Zeile „mit Kurskarte buchbar“.
6. **Menü / Einstellungen** — „Kurskarten“ (nicht Mehrfachkarten).
7. **Owner demoalpha** — Rechtliches: AGB/Datenschutz erneut freigeben (Template-Hash Kurskarte).
8. **Screenshots** 360/390/1280: Kurs-Checkout, Kurskarten-Checkout, „Zahlung läuft“, Ablehnung.
