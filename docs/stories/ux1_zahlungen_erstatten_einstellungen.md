Story UX-1 — Erstatten in einem Schritt, „Zahlungen“ mit Reitern, Einstellungen mit Kategorien

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Voraussetzung: HEAD 7ee4e63 oder neuer, 3.2c + 3.1 auf DEV. Als docs/stories/ux1_zahlungen_erstatten_einstellungen.md ablegen und committen. Grundlage: docs/DESIGNSYSTEM.md, Entscheidung 10, Entscheidung 11. Nur Oberfläche. Keine Migration, keine Edge Function. Fehlt Lese-Logik → kleinste Ergänzung nur im Client; braucht es doch Backend → Haltestelle 1.

Vorab (eigener Doku-Commit)

docs/entscheidungen/11_Zahlungsuebersicht_vorlaeufig.md → umbenennen in 11_Zahlungsuebersicht.md, Status „gilt, bestätigt von Julius am 04.10.2026“. Inhalt Z1–Z7 unverändert (nur Owner/Admin, alle Zahlungsarten, keine Summen/kein Umsatz, Kartenmarke/letzte 4 später). STAND.md und Nachtrag anpassen.

Teil 1 — Erstatten in einem Schritt (Kasse und „Zahlungen“, gleiche Komponente)
Kasse, Karte je Person: Zahlungsinfo als eigene, klar getrennte Zeilen statt „✓ online · Karte · noch 9“:
„Online bezahlt · 24,00 €“ mit kleinem sekundärem Knopf „Erstatten“ rechts (nur Owner/Admin, nur wenn Rest > 0). Bei Teilerstattung: „Online bezahlt · 24,00 € · 10,00 € erstattet“.
10er-Karte separat: „10er-Karte · noch 9“.
Bar/PayPal/Überweisung wie bisher.
„Mehr“ enthält nur noch Seltenes (z. B. „Karte verkaufen“), kein „Online-Zahlung · Erstatten…“ mehr.
Dialog in einem Schritt (Sheet, mobil von unten):
Kopf: Name · Kurs · Termin, darunter „Bezahlt 24,00 € · noch erstattbar 24,00 €“.
Betrag als Segment: [ Alles · 24,00 € ] [ Teilbetrag ] (vorausgewählt „Alles“ = Rest). Bei „Teilbetrag“ erscheint das Feld (Komma-Eingabe).
Grund als Chips: Kulanz · Doppelt gebucht · Krankheit · Sonstiges. Bei „Sonstiges“ Freitext Pflicht (max. 200), sonst optionaler Zusatz. Gespeichert wird Chip-Text + Zusatz als Notiz (nur Studio sichtbar).
Ein Primärknopf mit Betrag: „24,00 € erstatten“ / „10,00 € erstatten“. Kein „Weiter“, kein zweiter Bestätigungsschritt. Darunter klein: „Stripe erstattet seine Gebühr für die Zahlung nicht.“
Nach Erfolg: Sheet zeigt kurz Erfolg („10,00 € werden erstattet“), Liste aktualisiert sich.
Fehler sichtbar und früh:
Betrag > Rest: Feld mit Fehlerrand, darunter in Fehlerfarbe mit Icon „Höchstens 14,00 € möglich“, Knopf gesperrt. Hinweis nur einmal.
Betrag 0/leer/ungültig: gleiche Darstellung („Bitte einen Betrag eingeben“).
Serverfehler (AMOUNT_EXCEEDS_REMAINING, NOTHING_TO_REFUND, FORBIDDEN, Dienst weg): Hinweisbox über dem Knopf mit role="alert", nicht als nackter Text unten.
Teil 2 — Ein Menüpunkt „Zahlungen“ mit Reitern
„Zahlungen“ und „Offene Zahlungen“ werden ein Menüpunkt „Zahlungen“, mit Zahl-Badge, wenn offene Zahlungen existieren.
Oben ein Segment-Schalter [ Offen ③ ] [ Alle ]. Standard: „Offen“, wenn > 0, sonst „Alle“. Auswahl in der URL (?tab=offen|alle), damit Zurück/Neu laden stimmt.
Inhalte der beiden Reiter = die bisherigen Seiten, nicht zusammengemischt. Alte Routen leiten auf den passenden Reiter um.
Mobil: Schalter bleibt beim Scrollen oben (sticky), Einträge als Karten, Tipp öffnet Detail-Sheet (mit „Erstatten“ aus Teil 1).
Teil 3 — Einstellungen mit Kategorien
Übersicht (mobil eigene Seite, Desktop linke feste Spalte + rechter Inhalt):
Kategorie	Inhalt	Zeile in der Übersicht
Studio	Name, Logo, Farben, Adresse	z. B. „Demo Alpha · eigenes Logo“
Buchungen	Standard-Plätze, Stornofrist, Warteliste, Nachrücken	„Stornofrist 24 h · Warteliste an“
Zahlungen	Online-Zahlung (Stripe), Vor-Ort-Zahlung, Steuerstatus	„Online aktiv · Kleinunternehmer“
Karten	5er-/10er-Produkte, Verfall	„2 Karten im Angebot“
Team	Lehrende, Admins, Rollen	„3 Personen“
Benachrichtigungen	(vorhandene Einstellungen; sonst Platzhalter „kommt bald“ weglassen → Kategorie nur zeigen, wenn Inhalt existiert)	–
Rechtliches	Impressum/AGB/Datenschutz, sofern vorhanden	„Impressum fehlt“

Je Zeile: Icon, Titel, Statuszeile (aus echten Daten), Pfeil. Kategorien ohne Inhalt nicht anzeigen. 2. „Braucht deine Aufmerksamkeit“ oben, nur wenn etwas fehlt (z. B. Steuerstatus fehlt bei aktivierter Online-Zahlung, Stripe-Konto nicht bereit). Jeder Eintrag springt direkt in die richtige Unterseite. 3. Unterseiten: eine Kategorie je Seite, Route je Kategorie (/settings/<kategorie>), Zurück-Pfeil mobil. Bestehende Formulare/Komponenten wiederverwenden, nur neu anordnen. Speichern je Unterseite (Knopf unten sticky, nur aktiv bei Änderung) oder sofort bei Schaltern — wie es die bestehende Komponente heute tut, aber einheitlich je Seite. 4. Rechte unverändert: wer heute eine Einstellung nicht sehen darf, sieht die Kategorie nicht. 5. Keine Einstellung darf verloren gehen: Liste „alt → neue Kategorie“ im Bericht.

Akzeptanz / Tests
Unit-Tests: Betrag-Validierung (Alles/Teil/zu hoch/leer/Komma), Chip-Pflicht bei „Sonstiges“, Badge-Zahl, Default-Reiter, Statuszeilen der Kategorien.
E2E (Playwright, DEV): (1) Owner erstattet in der Kasse Alles in einem Schritt; (2) Teilbetrag zu hoch → Knopf gesperrt + Fehlertext, dann gültig → Erfolg; (3) „Zahlungen“: Reiter wechseln, URL-Parameter, alte Route leitet um; (4) Einstellungen: Übersicht → „Buchungen“ → Stornofrist ändern → speichern → Übersicht zeigt neuen Wert; (5) Aufmerksamkeits-Kasten erscheint bei fehlendem Steuerstatus (Test-Studio).
Screenshots 360/1280 aller neuen Ansichten nach docs/screenshots/ux1/ (nicht committen).
DoD laut Regeldatei inkl. STAND.md. Logik- und Gestaltungs-Commits getrennt.
Haltestelle

Nach allem: Haltestelle 5 (Klicktest). Klickliste im Bericht, max. 10 Punkte.