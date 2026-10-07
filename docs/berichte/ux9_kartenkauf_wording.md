# Bericht UX-9 — Kartenkauf schlanker, „Mehrfachkarte“ statt „Karte“

Stand: 2026-10-07 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

Grundlage: [ux9_kartenkauf_wording.md](../stories/ux9_kartenkauf_wording.md), Entscheidung [19_Wording_Mehrfachkarte.md](../entscheidungen/19_Wording_Mehrfachkarte.md).

## Erledigt

| Teil | Inhalt |
|---|---|
| E19 | Entscheidung 19 als Doku-Commit |
| A | Kauf-Sheet: Produkttitel, Zusammenfassung, Payment Element, Consent neu, sticky Fuß, Preiszeile „Endpreis · keine USt (§ 19 UStG)“ / „inkl. n % USt“, Mehr-Pop-up mit Beispielrechnung, Rechtszeile AGB · Datenschutz · Widerrufsbelehrung; Kurs-Checkout-Fuß gleiche Preiszeile |
| B | W1–W5: Mehrfachkarte(n), Produktnamen, Kreditkarte, kein nacktes „Karte“ (Ausnahme Consent) |

## Ausnahme W3 (bewusst)

Consent- und Mehr-Pop-up-Texte verwenden „die Karte“, weil der Produktname im Sheet-Titel steht (Story A).

## Geänderte Texte (Auswahl)

| Bereich | alt → neu |
|---|---|
| Menü / Titel | Meine Karten / Karten → Mehrfachkarten |
| coverage / Badge | Karte · noch n → Mehrfachkarte · noch n (oder Produktname) |
| Teilnehmer-Knopf | Mit Karte → Mit {Produktname} / Mit Mehrfachkarte |
| Online-Detail | Karte, Apple Pay → Kreditkarte, Apple Pay, Google Pay |
| CSV Stripe | Karte → Kreditkarte |
| Checkout Steuer | gemäß § 19 UStG ohne USt → Endpreis · keine USt (§ 19 UStG) |
| Consent | langer „verlange ausdrücklich…“ → neuer Sofortnutzen-Wortlaut (neuer Hash) |

Vollständige Diff-Liste: Commits auf `Julius` (feat ux9).

## Nachweise

- `npm run check:ci` — grün
- Unit `scripts/test/k1_pass_texts.mjs` — Consent-Hash + Mehr-Beispiel 65€/5 und 120€/10
- Unit `scripts/test/legal_checkout_texts.ts` — Preiszeile § 19 / 19 % / 7 %
- Unit `coverage_label`, `zw1_booking_texts` — Wording
- E2E `e2e/ux9.spec.ts` (e2eapp) — Consent-Fehler erst nach Tipp; Kauf-RPC mit neuem Hash; h1 „Mehrfachkarten“; Mehr-Pop-up 52,00

## Deploy-Nachweis (vor Haltestelle 5)

| Prüfung | Ergebnis |
|---|---|
| HEAD | `fa67eb0` (Deploy-Nachweis); Feature-Code ab `41274b0` |
| Check-Run **Workers Builds: omlify-dev** | `success` für `fa67eb0` (2026-10-07T08:45:54Z) und `41274b0` |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-CV9epxqA.js` |
| Merkmal | `Endpreis` @625695; `sofort nutzen` @750093; `pass-consent-error` @758692 |
| Edge Functions DEV | `npm run functions:dev` inkl. `dispatch-emails` (Consent-Zitat in Kauf-Mail) |

## Haltestelle 5 — Klickliste (max. 8)

1. **Teilnehmerin demoalpha** — Mehrfachkarten: Sheet öffnen; Titel = Produktname; Preis groß + „Endpreis · keine USt (§ 19 UStG)“ klein.
2. **Ohne Häkchen** „Zahlungspflichtig kaufen“ → Fehlerzeile + roter Rahmen; vorher kein Hinweis.
3. **Mehr ›** — Beispielrechnung mit Studio-Produktbeträgen; Verstanden.
4. **Mit Häkchen** kaufen (4242) → Erfolg; Bestätigungsmail zitiert neuen Consent.
5. **Kurs online buchen** — Fuß: Betrag + Endpreis-/USt-Zeile; Rechtszeile AGB · Datenschutz.
6. **Menü** „Mehrfachkarten“; Einstellungen → Mehrfachkarten.
7. **Teilnehmerliste** — Knopf „Mit 10er-Karte“ (Produktname), nicht „Mit Karte“.
8. **Screenshots** 360/390/1280: Sheet leer, Fehlerzustand, Mehr-Pop-up, Kurs-Checkout Endpreis.
