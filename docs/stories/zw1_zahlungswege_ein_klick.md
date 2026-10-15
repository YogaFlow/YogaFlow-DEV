Story ZW-1 — Zahlungswege klar regeln, Buchen mit einem Tipp

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Voraussetzung: UX-4-Nachtrag auf Julius (CI #223). Als docs/stories/zw1_zahlungswege_ein_klick.md ablegen. Entscheidung 14 unten als docs/entscheidungen/14_Zahlungswege.md (eigener Doku-Commit).

Vorab: zwei Befunde aus dem Klicktest
AVV-Banner (N1) funktioniert — Claude hat auf DEV gesehen: Um 16:07 UTC hat das E2E-Owner-Testkonto die neue Fassung (b90051ca…) für demoalpha abgeschlossen, deshalb sah Julius kein Banner mehr. Regel ab jetzt: E2E-Tests, die append-only-Daten schreiben (AVV, Belege), laufen in einem eigenen E2E-Studio, nie in demoalpha/demobeta (die sind für Julius' Klicktests). Eigenes Studio anlegen (über Testskript), Tests umstellen, in die Regeldatei.
Toast-Zeitbalken weiterhin unsichtbar bei Julius (iPhone + Desktop). Prüfen: (a) läuft auf DEV wirklich der Build mit 3ffb738 (Build-Hash/Version im Footer oder /version.json sichtbar machen, falls es das nicht gibt); (b) Balken mit Kontrastfarbe auf der dunklen Pille, nicht brandSoft, falls zu hell; (c) Playwright-Screenshot der Pille nach 1 s und nach 3 s in den Bericht. Ursache benennen.
Entscheidung 14 — Zahlungswege (gilt)
#	Entscheidung
Z1	Das Studio legt fest, welche Wege es anbietet: „Online (Karte, Apple Pay, Google Pay)“ und/oder „Vor Ort (bar o. ä.)“, mindestens einer. Ersetzt die heutige Logik „Online-Pflicht + Vor-Ort weiterhin erlauben“.
Z2	Ist Online angeboten und technisch bereit (Plattform-Schalter, Stripe-Konto, Steuerstatus, Anbieterangaben, AVV, Preis ≤ 250 €), ist Online immer wählbar — unabhängig davon, ob Vor Ort zusätzlich erlaubt ist. (Heute verschwindet Online, sobald Vor Ort erlaubt ist → Fehler.)
Z3	Karten (5er/10er) erscheinen nur, wenn die Person eine gültige, für den Kurs nutzbare Karte mit Guthaben besitzt.
Z4	Standard-Weg (vorausgewählt, Ein-Tipp-Buchung): 1. gültige Karte → 2. Online → 3. Vor Ort. Alternativen sind immer über „Anders bezahlen“ erreichbar.
Z5	Rechtlich: Auch eine Buchung mit „Vor Ort bezahlen“ ist ein Vertrag mit Zahlungspflicht, der online geschlossen wird (§ 312j BGB). Knopf deshalb ebenfalls „Zahlungspflichtig buchen“ mit Kurs, Termin, Preis direkt davor. Bei Buchung mit Karte entsteht keine neue Zahlungspflicht (bereits bezahlt) → Knopf „Mit 10er-Karte buchen“.
Z6	Bestehende Einstellungen werden übernommen: online an + vor Ort an → beide; online an + vor Ort aus → nur online; online aus → nur vor Ort. Keine Studio-Einstellung geht verloren (Migration mit Vorher/Nachher-Zählung je Kombination im Bericht).
Umfang
A — Einstellungen › Zahlungen
Abschnitt „Wie können Teilnehmende bezahlen?“ mit zwei Schaltern: Online (Karte, Apple Pay, Google Pay) · Vor Ort (bar, PayPal, Überweisung — wie heute in der Kasse vermerkt). Mindestens einer an; letzten kann man nicht ausschalten (Hinweis).
Ist Online an, aber nicht bereit (z. B. AVV fehlt), Statuszeile „Online ist noch nicht bereit: …“ mit Sprung zur Ursache — wie „Braucht deine Aufmerksamkeit“.
Alte Schalter-Texte entfallen.
B — Server
booking_payment_options() liefert künftig eine Liste der wählbaren Wege für diese Person und diesen Kurs: [{method:'pass', pass_id, label:'10er-Karte · noch 7'}, {method:'online'}, {method:'onsite'}], dazu default nach Z4 und je Weg ggf. unavailable_reason. Eine Quelle für alle Oberflächen.
Inventur: alle Aufrufer (Buchen, Nachrücken/Warteliste, Spätzahlung, Check-in) auflisten und anpassen; Verhalten bei Warteliste: Nachrücken mit Online-Hold nur, wenn Online der gewählte/Standard-Weg ist, sonst wie Vor Ort. Widerspruch → Haltestelle 1.
Tests: alle 3 × Kombinationen (nur online / nur vor Ort / beide) × (mit/ohne Karte) × (Online bereit/nicht bereit).
C — Buchen mit einem Tipp (Kursdetail + Kursliste)

Heute: erst Zahlungsart wählen, dann buchen. Neu:

┌──────────────────────────────────────┐
│ 16 € pro Termin                      │
│ ✓ Mit deiner 10er-Karte · noch 7     │  ← Standard-Weg (Z4), eine Zeile
│ [        Mit 10er-Karte buchen      ]│  ← ein Tipp, fertig (Toast + Rückgängig)
│ Anders bezahlen ›                    │  ← öffnet kleines Sheet mit den übrigen Wegen
└──────────────────────────────────────┘
Standard Online: Zeile „Online bezahlen“, Knopf „Zur Buchung“ → Checkout wie heute (dort „Zahlungspflichtig buchen“).
Standard Vor Ort: Zeile „Du bezahlst vor Ort“, Knopf „Zur Buchung“ → kleines Bestätigungs-Sheet mit Kurs, Termin, Preis, Abmeldefrist + Knopf „Zahlungspflichtig buchen“ (Z5).
„Anders bezahlen“: Sheet mit Optionsliste (Radio-Karten mit Icon, eine Zeile Erklärung), nur verfügbare Wege; Auswahl ändert Zeile + Knopf, nichts wird sofort gebucht.
Nur ein Weg verfügbar → kein „Anders bezahlen“.
Mobile Buchungsleiste (N3-Layout) bleibt: Zeile 2 zeigt den gewählten Weg statt des allgemeinen Hinweises.
D — Abmelden / Erstatten

Unverändert (Karte → Guthaben zurück nach Regel A6, Online → Erstattung nach Entscheidung 10, Vor Ort → nichts). Nur Texte prüfen, dass der Weg der Buchung korrekt genannt wird.

Akzeptanz
SQL/RPC-Tests (Matrix oben), Unit-Tests der Texte, E2E im E2E-Studio: (1) Studio „beide“ + Teilnehmerin ohne Karte → Standard Online, „Anders bezahlen“ zeigt Vor Ort; (2) mit 10er-Karte → Ein-Tipp-Buchung mit Karte, Toast; (3) „nur Vor Ort“ → Bestätigungs-Sheet mit „Zahlungspflichtig buchen“; (4) Einstellungen: letzter Schalter lässt sich nicht ausschalten.
Screenshots 360/1280; mobil Buchungsleiste für alle drei Standard-Wege.
check:ci grün vor Push. Haltestelle 5, Klickliste max. 10 Punkte (nennt, welches Studio/Konto für welchen Punkt).