Story UX-9 — Kartenkauf schlanker, „Mehrfachkarte“ statt „Karte“

Für Cursor (autonomer Ablauf). Stand: 07.10.2026. Als docs/stories/ux9_kartenkauf_wording.md ablegen; Entscheidung 19 unten als docs/entscheidungen/19_Wording_Mehrfachkarte.md (Doku-Commit). check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp. Vor Haltestelle 5: Check-Run „Workers Builds: omlify-dev“ für den letzten Commit erfolgreich + Live-Bundle enthält ein Merkmal der Änderung (Regel vom 06.10.). Klickliste max. 8. Rechtliche Einordnung von Claude, nicht anwaltlich geprüft.

Befund (Screenshot Julius, Karte kaufen, 360 px)

Überladen: Preis mit „gemäß § 19 UStG ohne USt“ in Überschriftgröße, lange Zustimmung, Fehlertext „Bitte bestätige …“ steht schon vor jeder Aktion da. „Karte“ wird mit Kreditkarte verwechselt.

Entscheidung 19 — Begriffe (gilt überall: App, Mails, Belege, AGB-Anzeige, Hilfe)
#	Regel
W1	Oberbegriff für Termin-Karten: „Mehrfachkarte“ (passt zu den AGB, im Studio üblich). Menü „Meine Karten“ → „Mehrfachkarten“; Einstellungen „Karten“ → „Mehrfachkarten“.
W2	Wo ein konkretes Produkt gemeint ist, immer der Produktname: „Mit 10er-Karte buchen“, „10er-Karte · noch 6“, Knopf in der Teilnehmerliste „Mit 10er-Karte“ (statt „Mit Karte“). Hat die Person mehrere passende: „Mit Mehrfachkarte“.
W3	Nie „Karte“ allein.
W4	Zahlungsmittel heißt „Kreditkarte“ (kurz) bzw. „Kredit- oder Debitkarte“ (Detail). Zahlart-Zeile: „Online bezahlen · Kreditkarte, Apple Pay, Google Pay“.
W5	Interne Namen (Tabellen, Code) bleiben. Liste aller geänderten Texte im Bericht; Textsuche \bKarte\b ohne Präfix in src/ + Mailvorlagen = 0 Treffer außer bewusst begründeten.
A — Kauf-Sheet neu (Mehrfachkarte kaufen) — nach Recherche 07.10. angepasst
┌──────────────────────────────────────────┐
│ 5er-Karte                             ✕  │  Produktname als Titel
│ 5 Termine · 12 Monate gültig ·           │  grau, 14 px, eine Zusammenfassung
│ 13,00 € pro Termin                       │
│                                          │
│ [ Stripe Payment Element ]               │  Apple Pay / Google Pay zuerst, dann Kreditkarte
│                                          │
│ ☐ Ich möchte die Karte sofort nutzen.    │  Häkchen 15 px, direkt über dem Fuß
│   Bei Widerruf zahle ich genutzte        │
│   Termine anteilig; sind alle genutzt,   │
│   endet das Widerrufsrecht.  Mehr ›      │
├──────────────────────────────────────────┤  ← Fuß klebt mobil unten (sticky)
│ 65,00 €   Endpreis · keine USt (§ 19 UStG)│  Betrag groß, Zusatz klein grau
│ [       Zahlungspflichtig kaufen       ] │
│ AGB · Datenschutz · Widerrufsbelehrung   │  eine kleine Zeile, Pop-ups
└──────────────────────────────────────────┘
Preiszeile: Betrag groß; daneben klein grau bei § 19 UStG „Endpreis · keine USt (§ 19 UStG)“, bei Regelbesteuerung „inkl. 19 % USt“ (Satz aus Steuerstatus). Grund: Die PAngV verlangt im Online-Verkauf einen Hinweis zur Umsatzsteuer; für Kleinunternehmer ist die Lage rechtlich unklar, „inkl. MwSt.“ wäre falsch → kurzer § 19-Hinweis bleibt, aber klein statt in Überschriftgröße. Gleiche Regel im Kurs-Checkout und in der Buchungsleiste.
Zustimmung (Wortlaut neu, genau so): „Ich möchte die Karte sofort nutzen. Bei Widerruf zahle ich genutzte Termine anteilig; sind alle genutzt, endet das Widerrufsrecht.“ Enthält die drei nötigen Teile: ausdrückliches Verlangen, Wertersatz, Erlöschen bei vollständiger Nutzung. „Karte“ ist hier zulässig, weil der Produktname im Titel steht (Ausnahme zu W3, im Bericht vermerken).
„Mehr ›“ öffnet ein kleines Pop-up: „Du hast 14 Tage Widerrufsrecht. Weil du die Karte sofort nutzen kannst, ziehen wir bei einem Widerruf die schon genutzten Termine anteilig ab. Beispiel: 65,00 € ÷ 5 Termine × 1 genutzt = 13,00 € → du bekommst 52,00 € zurück. Hast du alle Termine genutzt, ist kein Widerruf mehr möglich.“ (Beträge aus dem Produkt gerechnet.)
Häkchen nicht vorausgewählt, Pflicht, getrennt von AGB (kein Sammel-Häkchen). Kein Hinweistext vorab; erst beim Tipp auf den Knopf ohne Häkchen: Häkchen-Zeile rot umrandet, Fokus darauf, Text „Bitte setze das Häkchen, um die Karte sofort nutzen zu können.“ Gilt auch, wenn im Payment Element Apple Pay/Google Pay gewählt ist (Prüfung vor confirmPayment).
Neuer Wortlaut = neue Textfassung: Hash-Logik pass_purchase_consents (wie AVV) nutzt den neuen Text; alte Zustimmungen bleiben mit altem Hash gültig. Bestätigungs-Mail zitiert den neuen Wortlaut.
Ein Kaufknopf: Wir bleiben beim Payment Element mit unserem Knopf „Zahlungspflichtig kaufen“ (erfüllt § 312j). Kein separates Express-Checkout-Element mit Apple-Pay-Knopf oben — dessen Beschriftung und die Häkchen-Prüfung davor machen es rechtlich und technisch heikler; Wallets bleiben im Payment Element an erster Stelle (dynamische Reihenfolge von Stripe).
Mobil: Fuß (Preis, Knopf, Rechtszeile) klebt unten mit safe-area-inset-bottom, damit Gesamtpreis und Knopf immer gemeinsam sichtbar sind; Inhalt scrollt darüber. Desktop: kein Sticky nötig.
Rechtsinfo-Zeile ersetzt den Satz „Du hast ein 14-tägiges Widerrufsrecht …“ und die AGB-Hinweiszeile aus L7 — eine Zeile unter dem Knopf.
Gleicher Aufbau im Kurs-Checkout (ohne Häkchen, da kein Widerrufsrecht bei Einzelterminen): Titel Kurs, Zusammenfassung, Payment Element, Fuß mit Preis + „Zahlungspflichtig buchen“ + Rechtszeile.
B — Begriffe umsetzen (W1–W5)

Alle Oberflächen, Toasts, Mails (Bestätigung, Erinnerung 30/7 Tage, „Noch 1 Termin“, Widerruf), Belege (Leistungstext „10er-Karte ‚…‘“ bleibt, da Produktname), Einstellungen, Kartenhinweis-Vorbelegung ({karte} bleibt Produktname), CSV-Spalten, Hilfe.

Akzeptanz
Unit: Preiszeile (§ 19 → „Endpreis · keine USt (§ 19 UStG)“; Regel → „inkl. 19 % USt“; 7 %), Zustimmungstext + Hash neu, Beispielrechnung im Pop-up (65,00 €/5/1 → 13,00 €/52,00 €; 120,00 €/10/2 → 24,00 €/96,00 €).
E2E (e2eapp): Kauf ohne Häkchen → Fehlerzeile erst nach Tipp; mit Häkchen → Kauf ok, Consent mit neuem Hash; Navigation „Mehrfachkarten“.
Screenshots 360/390/1280: Kauf-Sheet leer, Fehlerzustand, Pop-up „Mehr“, Kurs-Checkout mit „Endpreis“.