Story UX-4 — Feinschliff 2 + Sammel-Nachtrag

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Voraussetzung: UX-3 auf Julius (HEAD da23dd4). Als docs/stories/ux4_feinschliff_2.md ablegen. Grundlage: Klicktest UX-3 von Julius (Punkte 5–9 ok), Claude-Prüfung AVV-Diff. Mobile Pixelgleichheit gilt diesmal nicht für: Kopfleiste (E4), Kursdetail-Aktionen (A3), Buchungskarte (B1). Alles andere mobil unverändert. Logik- und Gestaltungs-Commits getrennt.

A — Rückmeldungen und Aktionen

A1 Toast: Fehler. „Rückgängig“ war nicht sichtbar, Tippen bewirkte nichts. Ursache finden und im Bericht nennen; E2E muss das echte Tippen auf „Rückgängig“ prüfen (nicht nur die Funktion).

A2 Toast: neues Design (bisher zu unauffällig, generisch):

Dunkle, kräftige Pille (Hintergrund = Textfarbe, Schrift weiß), Radius 14 px, deutlicher Schatten, max. 420 px breit; mobil unten über der Navigation, Desktop unten mittig.
Links ein Icon im farbigen Kreis (Erfolg: Markenfarbe, Fehler: Fehlerfarbe), Text kurz und fett („Hans Peter abgemeldet“), keine zweite Zeile, wenn nicht nötig.
Rechts „Rückgängig“ als klarer Text-Knopf in heller Markenfarbe, Tippfläche ≥ 44 px.
Unten ein dünner Zeitbalken, der in 5 s abläuft (zeigt, wie lange Rückgängig geht). Ohne Rückgängig: 4 s, kein Balken.
Hineingleiten von unten (200 ms), wegwischbar; prefers-reduced-motion → nur einblenden.
Wann Rückgängig: nur wenn die Aktion vollständig umkehrbar ist. Abmelden einer online bezahlten Buchung löst eine Erstattung aus → kein Rückgängig (Toast ohne Knopf). Regel ins Designsystem.

A3 Kursdetail mobil: „Kurs absagen“ / „Kurs löschen“ kleben weiterhin aneinander. Wie am Desktop in ein „⋯“-Menü oben rechts (Bearbeiten, Kurs absagen, Kurs löschen; letzte zwei in Fehlerfarbe, mit Bestätigungsdialog). Lose Knöpfe entfernen.

B — Kursdetail und Checkout

B1 Buchungskarte: Abmeldefrist nur einmal und immer konkret.

Gebucht: „✓ Angemeldet · online bezahlt“ und darunter eine Zeile „Kostenlos abmelden bis Do, 8. Okt, 15:45“ (nach Frist: „Die kostenlose Abmeldefrist ist abgelaufen.“). Die allgemeine Zeile „… bis 24 h vor Kursbeginn“ entfällt.
Nicht gebucht: ebenfalls das konkrete Datum statt „24 h vor Kursbeginn“.
Eine gemeinsame Textfunktion für Karte, Checkout, Mail (Tests).

B2 Zahlungshinweis freundlicher: Statt Schloss + „Online-Zahlung erforderlich“ → Karten-Icon + „Du bezahlst direkt bei der Buchung“. Kein Schloss-Icon außerhalb des Bezahl-Fußes.

B3 Erfolgsfenster nach dem Bezahlen neu (bisher: Kurs + Termin doppelt, wirkt unfertig):

Kopf-Zusammenfassung im Erfolgszustand ausblenden, kein „Buchung abschließen“-Titel mehr.
Mitte: Häkchen im weichen Kreis der Markenfarbe (ruhige Einblend-Animation, 300 ms, kein Konfetti), Überschrift „Du bist dabei!“ (wie Mail), eine Zeile „Test Kurs V7 · Sa, 31. Okt · 10:30“.
Klein darunter: „Bestätigung und Beleg kommen per E-Mail.“
Knöpfe: Primär „In Kalender eintragen“ (wie C1), Sekundär „Fertig“; Text-Link „Beleg ansehen“.
C — Kalender

C1 Eine eigene Kalender-Seite statt direktem Download (die Mail und B3 verlinken darauf, Token wie bisher):

Kleine, mobil optimierte Seite in Studio-Optik: Kurs, Datum, Uhrzeit, Ort, dann Knöpfe je nach Gerät:
iPhone/iPad: Primär „Apple Kalender“ (ICS mit Content-Type: text/calendar und Content-Disposition: inline → Safari zeigt „Zum Kalender hinzufügen“), darunter „Google Kalender“.
Android: Primär „Google Kalender“, darunter „Andere Kalender (.ics)“.
Desktop: „Outlook / Apple (.ics)“ und „Google Kalender“ gleichwertig.
Gerät nur zur Reihenfolge erkennen, alle Wege bleiben sichtbar.
Grenzen (im Bericht festhalten, nicht lösbar): Öffnet die Gmail-App Links in Chrome, entscheidet Chrome über .ics; Googles Termin-Link zeigt im mobilen Browser ohne Google-Kalender-App die Desktop-Ansicht.
Test auf iPhone (Safari + Gmail-App), Android, Desktop → Ergebnis-Tabelle im Bericht.
D — Navigation und Kopfleiste

D1 Reihenfolge Seitenmenü (Owner/Admin), sonst nichts ändern:

Übersicht · 2. Kurse · 3. Teilnehmer · 4. Nachrichten · 5. Zahlungen · 6. Kurse verwalten · 7. Nutzerverwaltung · 8. Einstellungen · 9. Profil (ganz unten über „Abmelden“). Logik: täglich → wöchentlich → selten; Persönliches unten. Lehrende/Teilnehmende: gleiche relative Reihenfolge für ihre Punkte. Mobiles Menü identisch.

D2 Kopfleiste mobil mit Markenfarbe: bleibt durchscheinend (Unschärfe wie heute), bekommt einen leichten Farbstich der Studiofarbe (≈ 8 % Deckkraft, z. B. color-mix(in srgb, var(--brand) 8%, transparent)). Kontrast Titel/Icons ≥ 4,5:1 prüfen, auch bei sehr hellen/dunklen Studiofarben. Desktop unverändert.

E — Sammel-Nachtrag (aus Claude-Prüfung)
AVV § 2 „Art der Verarbeitung“ ergänzen: „… Übermitteln an die betroffene Person und an den Zahlungsdienstleister des Verantwortlichen, …“. Zweck-Satz grammatisch anschließen: „Betrieb einer Kurs- und Buchungsverwaltung für den Verantwortlichen sowie die Abwicklung von Online-Zahlungen …“. Stand-Datum bleibt 04.10.2026 (redaktionell, vor jeder echten Zustimmung auf PROD). Nur diese zwei Änderungen; Diff in den Bericht.
AVV-Fingerabdruck über den Text, nicht über das HTML: SHA-256 über den normalisierten Markdown-Text (Zeilenenden, Leerzeichen am Ende). Test: Layoutänderung ändert den Hash nicht, Textänderung schon; Hash ≠ Fassung 21.09. Die eine DEV-Zustimmung von demoalpha bleibt stehen (append-only); da sich der Hash ändert, zeigt DEV danach wieder das Banner — erwartet, im Bericht vermerken.
E2E ux2.spec.ts auf DEV ausführen (war nur angelegt), Ergebnis in den Bericht.
Auth- und Kursformulare auf FormField (eigener Aufräum-Commit).
Akzeptanz
E2E: Abmelden (bar) → Toast → echtes Tippen „Rückgängig“ → wieder angemeldet; Abmelden (online bezahlt) → Toast ohne Rückgängig; „⋯“-Menü mobil; Erfolgsfenster zeigt Kurs nur einmal; Kalender-Seite liefert je User-Agent die richtige Reihenfolge, ICS 200 text/calendar, gefälschtes Token 404.
Unit: Abmeldefrist-Text (vor/nach Frist, gebucht/nicht gebucht), Kontrast Kopfleiste für 5 Beispielfarben, Hash-Normalisierung.
Screenshots 360/1280 aller geänderten Ansichten, Toast hell und dunkel.
Haltestelle 5, Klickliste max. 12 Punkte.