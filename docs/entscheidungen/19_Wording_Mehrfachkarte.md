# Entscheidung 19 — Begriffe Mehrfachkarte / Kreditkarte

Stand: 07.10.2026 · Entschieden von: Julius · Status: gilt  
Grundlage: Story [ux9_kartenkauf_wording.md](../stories/ux9_kartenkauf_wording.md).  
Rechtliche Einordnung von Claude, nicht anwaltlich geprüft.

Gilt überall: App, Mails, Belege, AGB-Anzeige, Hilfe.

| # | Regel |
|---|---|
| W1 | Oberbegriff für Termin-Karten: **„Mehrfachkarte“** (passt zu den AGB, im Studio üblich). Menü „Meine Karten“ → „Mehrfachkarten“; Einstellungen „Karten“ → „Mehrfachkarten“. |
| W2 | Wo ein konkretes Produkt gemeint ist, immer der Produktname: „Mit 10er-Karte buchen“, „10er-Karte · noch 6“, Knopf in der Teilnehmerliste „Mit 10er-Karte“ (statt „Mit Karte“). Hat die Person mehrere passende: „Mit Mehrfachkarte“. |
| W3 | Nie „Karte“ allein. |
| W4 | Zahlungsmittel heißt „Kreditkarte“ (kurz) bzw. „Kredit- oder Debitkarte“ (Detail). Zahlart-Zeile: „Online bezahlen · Kreditkarte, Apple Pay, Google Pay“. |
| W5 | Interne Namen (Tabellen, Code) bleiben. Liste aller geänderten Texte im Bericht; Textsuche `\bKarte\b` ohne Präfix in `src/` + Mailvorlagen = 0 Treffer außer bewusst begründeten. |

## Ausnahme (Story UX-9 Kauf-Sheet)

Im Zustimmungstext zum Sofortnutzen darf „die Karte“ stehen, weil der Produktname im Sheet-Titel steht. Im Bericht vermerken.

## Kauf-Sheet (A) — Kurz

Preiszeile: Betrag groß; daneben klein grau bei § 19 UStG „Endpreis · keine USt (§ 19 UStG)“, bei Regelbesteuerung „inkl. 19 % USt“ (Satz aus Steuerstatus). Gleiche Regel im Kurs-Checkout und in der Buchungsleiste.

Zustimmung (Wortlaut genau): „Ich möchte die Karte sofort nutzen. Bei Widerruf zahle ich genutzte Termine anteilig; sind alle genutzt, endet das Widerrufsrecht.“ Neuer Hash in `pass_purchase_consents`; alte Zustimmungen mit altem Hash bleiben gültig.

Kein Hinweistext vorab; Fehler erst beim Tipp ohne Häkchen. Ein Kaufknopf „Zahlungspflichtig kaufen“; Wallets im Payment Element. Mobil: Fuß sticky.
