# Entscheidung 19 — Begriffe Kurskarte / Kreditkarte

Stand: 07.10.2026 · Entschieden von: Julius · Status: gilt  
Grundlage: Story [ux9_kartenkauf_wording.md](../stories/ux9_kartenkauf_wording.md), Fortschreibung [ux10_checkout_kurskarte.md](../stories/ux10_checkout_kurskarte.md).  
Rechtliche Einordnung von Claude, nicht anwaltlich geprüft.  
Früherer Dateiname: `19_Wording_Mehrfachkarte.md` (UX-9).

Gilt überall: App, Mails, Belege, AGB-Anzeige, Hilfe.

| # | Regel |
|---|---|
| W1 | Oberbegriff: **„Kurskarte“** (statt „Mehrfachkarte“). Menü „Kurskarten“, Einstellungen „Kurskarten“. Konkrete Produkte weiter mit Namen („10er-Karte“). |
| W1a | Nie „Abo“ für Kurskarten: Sie werden einmal bezahlt und verlängern sich nicht. „Abo“/„Mitgliedschaft“ bleibt für ein späteres, wiederkehrendes Produkt reserviert (eigene Rechtsfolgen, z. B. Kündigungsknopf). |
| W2 | Wo ein konkretes Produkt gemeint ist, immer der Produktname: „Mit 10er-Karte buchen“, „10er-Karte · noch 6“, Knopf in der Teilnehmerliste „Mit 10er-Karte“ (statt „Mit Karte“). Hat die Person mehrere passende: „Mit Kurskarte“. |
| W3 | Nie „Karte“ allein. |
| W4 | Zahlungsmittel heißt „Kreditkarte“ (kurz) bzw. „Kredit- oder Debitkarte“ (Detail). Zahlart-Zeile: „Online bezahlen · Kreditkarte, Apple Pay, Google Pay“. |
| W5 | Interne Namen (Tabellen, Code) bleiben. Liste aller geänderten Texte im Bericht; Textsuche `\bKarte\b` ohne Präfix in `src/` + Mailvorlagen = 0 Treffer außer bewusst begründeten. Textsuche „Mehrfachkarte“ in `src/`, Mails, `docs/legal/` = 0 Treffer. |

## Ausnahme (Story UX-9 Kauf-Sheet)

Im Zustimmungstext zum Sofortnutzen darf „die Karte“ stehen, weil der Produktname im Sheet-Titel steht. Im Bericht vermerken.

## AGB / Datenschutz

Vorlagen `agb.v1.md` und Datenschutz: „Mehrfachkarte(n)“ → „Kurskarte(n)“. Keine neue Vorlagen-Version (v1 ist auf PROD noch nie freigegeben); auf DEV neue Fassung erzeugen, Demo-Studios erneut freigeben lassen (Seed).

## Kauf-Sheet (A) — Kurz

Preiszeile: Betrag groß; daneben klein grau bei § 19 UStG „Endpreis · keine USt (§ 19 UStG)“, bei Regelbesteuerung „inkl. 19 % USt“ (Satz aus Steuerstatus). Gleiche Regel im Kurs-Checkout und in der Buchungsleiste.

Zustimmung (Wortlaut genau): „Ich möchte die Karte sofort nutzen. Bei Widerruf zahle ich genutzte Termine anteilig; sind alle genutzt, endet das Widerrufsrecht.“ Neuer Hash in `pass_purchase_consents`; alte Zustimmungen mit altem Hash bleiben gültig.

Kein Hinweistext vorab; Fehler erst beim Tipp ohne Häkchen. Ein Kaufknopf „Zahlungspflichtig kaufen“; Wallets im Payment Element. Mobil: Fuß sticky.

## Checkout Feinschliff (UX-10) — Kurz

Zahlarten: Accordion mit Radio-Knöpfen; Reihenfolge Apple Pay → Google Pay → Karte; Überschrift „Wie möchtest du bezahlen?“; Hinweis „Sichere Zahlung über Stripe…“. Stripe erlaubt nicht, den Text „Karte“ im Element umzubenennen — Logos machen Kreditkarte eindeutig.

Zusammenfassung oben: Produkt + Meta; eine Beruhigungszeile (Abmeldefrist bzw. Gültigkeit/Kurskarte-Hinweis). Knopf: „Zahlung läuft …“ mit Spinner, gesperrt bis Ergebnis.
