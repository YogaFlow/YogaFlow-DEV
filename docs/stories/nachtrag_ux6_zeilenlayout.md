Nachtrag UX-6-2 — Personenzeile mobil luftiger

Für Cursor. Stand: 05.10.2026, HEAD 79c4c75. Klicktest-Feedback Julius (Screenshot 360 px): Zeilen wirken gequetscht. Nur Gestaltung + Demodaten, keine Logik. check:ci vor Push, Haltestelle 5 (Klickliste max. 4).

Befund

Drei Knöpfe (⋯, Karte, Bar erhalten) stehen rechts neben dem Namen → linke Spalte ~100 px, Status bricht in 3–4 Zeilen um („Zahlt vor Ort / · 18 € / 10er-Karte · / noch 6“).

Neu: gestapelte Zeile unter 640 px (Desktop-Tabelle unverändert)
┌──────────────────────────────────────────┐
│ Karla Karte                    18 €   ⋯  │  Zeile 1: Name (16 px, fett) · Betrag rechts (grau) · ⋯ als Icon ohne Rahmen (44×44 Tippfläche)
│ ● Zahlt vor Ort · 10er-Karte, noch 6     │  Zeile 2: Status (14 px), Punkt in Statusfarbe, 1 Zeile, sonst Ellipse
│ [      Bar erhalten      ] [ Mit Karte ] │  Zeile 3: Aktionen, Primär flexibel breit, Sekundär auto, Höhe 44 px
├──────────────────────────────────────────┤
│ Olaf Online          ✓ Bezahlt · online ⋯│  Erledigt: eine Zeile, keine Aktionsreihe
└──────────────────────────────────────────┘
Innenabstand je Person 16 px, Abstand Zeile 1→2: 4 px, 2→3: 12 px. Trennlinie zwischen Personen bleibt.
Knopftext „Karte“ → „Mit Karte“.
Betrag nur bei offenen/vor-Ort-Personen; bei Erledigten weglassen (keine Summen, E14 unverändert).
Reihenfolge bleibt: zu erledigen zuerst, Erledigte darunter (kompakt).
Hinweistext unter der Liste bleibt.
Demodaten (demo_ux6)
Kursname realistisch: „Hatha am Nachmittag“ statt „UX6 Heute Zahlstatus“.
Olaf Online hat online bezahlt (Testzahlung 4242 über bestehendes Testskript), nicht bar — sonst widerspricht die Demo dem Namen.
Karla bleibt „Zahlt vor Ort“ mit gültiger Karte (zeigt den Knopf „Mit Karte“).
Akzeptanz

Screenshots 360 / 390 / 1280 px mit allen Zuständen (offen, zahlt vor Ort, mit Karte möglich, bezahlt online/bar, Karte, erlassen). Kein Text bricht in mehr als 1 Zeile beim Status (360 px, Namen bis 24 Zeichen).