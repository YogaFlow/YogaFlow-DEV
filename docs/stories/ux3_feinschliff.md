Story UX-3 — Feinschliff nach Klicktest UX-2

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Voraussetzung: UX-2 auf Julius (HEAD af6b669). Als docs/stories/ux3_feinschliff.md ablegen. Grundlage: Klicktest Julius 04.10. (UX-2 Punkte 1–9, 10, 13, 14 ok), docs/DESIGNSYSTEM.md. Regel wie UX-2: Mobile Ansicht von Kursdetail und Kasse bleibt pixelgleich zur Referenz von UX-2 (außer der Umbenennung in C1). Logik- und Gestaltungs-Commits getrennt.

A — Rückmeldungen ohne Extra-Klick

Befund: Nach Aktionen (z. B. „Abgemeldet – Teilnehmer erfolgreich abgemeldet“ + OK) kommt ein Dialog ohne Abdunklung. Er ist ein Klick zu viel.

Regel (ins Designsystem):

Situation	Muster
Aktion erfolgreich	Toast unten (mobil über der Navigation), 4 s, kein OK-Knopf, nicht blockierend, role="status". Wo möglich mit „Rückgängig“ (z. B. Abmelden innerhalb von 5 s zurücknehmen, solange noch nichts erstattet wurde; sonst ohne).
Aktion fehlgeschlagen	Toast in Fehlerfarbe, bleibt bis zum Schließen, role="alert".
Vor einer folgenschweren Aktion (Kurs absagen, löschen, erstatten, entfernen)	Bestätigungsdialog mit Abdunklung + Unschärfe (A3 aus UX-2).

Alle bestehenden Erfolgs-Dialoge umstellen (Inventur im Bericht: Stelle, alt → neu). Keine alert()/confirm() des Browsers.

B — Mails
„In Kalender eintragen“ funktioniert nicht (Gmail blockiert data:/Anhang-Links). Neu:
Knopf zeigt auf eine https-Adresse: Edge Function calendar-ics liefert text/calendar für eine Buchung. Zugriff über ein signiertes Token (HMAC, nur Buchungs-ID + Ablauf 1 Jahr), kein Login nötig, im ICS nur Kurs, Zeit, Ort, Studio — keine Personendaten. Fremdes/gefälschtes Token → 404.
Darunter klein ein zweiter Link „Google Kalender“ (fertiger calendar.google.com/calendar/render?action=TEMPLATE…-Link).
.ics-Anhang bleibt zusätzlich.
Test: iPhone Mail, Gmail Web, Gmail Android, Outlook Web — Ergebnis im Bericht.
Interner Text in Kundenmail: „AGB als PDF folgen mit den Studio-Rechtstexten (Block 2).“ steht in der echten Mail → entfernen. Regel: Mails enthalten nie Entwickler-Hinweise; Test, der Mail-HTML auf „Block“, „TODO“, „Story“ prüft.
Eine Akzentfarbe: Bestätigung hat eine blaue Linie, Erstattung eine olivgrüne. Beide = Markenfarbe des Studios (bzw. Omlify-Grün als Rückfall), überall gleich.
Datumsblock mit Wochentag: „MO / 5 / OKT“.
Abmeldezeile freundlich: vor Frist „Kostenlos abmelden bis Fr, 3. Okt, 18:00“, nach Frist „Die kostenlose Abmeldefrist ist abgelaufen.“ (nicht „nicht mehr möglich“).
Erstattungs-Mail ins neue Design: Überschrift „12,00 € sind auf dem Weg zu dir“, Karte mit Kurs + Termin (wie Bestätigung, ausgegraut), Kasten Erstattung: Betrag, „zurück auf deine Karte“, Grund-Satz, „Gutschrift je nach Bank in einigen Werktagen“, Link „Erstattungsbeleg 2026-00138 ansehen →“. Fußbereich wie Bestätigung (Anbieter, Kontakt). Teilerstattung: „10,00 € von 24,00 €“.
Nachrücken- und Überwachungs-Mail: gleiche Vorlage prüfen (Akzentfarbe, Fuß).
C — Wording und Export
„Kassieren“ → „Check-in“ (Navigation, Seitentitel, Knöpfe, Texte, Mails, Hilfe). Unterzeile auf der Seite: „Wer ist da, wer hat bezahlt.“ Knopf je Person „Einchecken“; Zahlungsaktion „Zahlung vermerken“. Interne Namen (Code, Tabellen) bleiben. Liste der geänderten Texte im Bericht.
Zeitraum beim Export neu (mobil + Desktop, kein Browser-Monatsfeld mehr):
Chips: Dieser Monat · Letzter Monat · Dieses Jahr · Eigener Zeitraum
Darunter ein Monats-Umschalter ‹ Oktober 2026 › (Pfeile, Text dazwischen). „Eigener Zeitraum“ zeigt zwei solche Umschalter (von/bis).
Unter der Auswahl eine Vorschauzeile: „23 Zahlungen im Zeitraum“.
Exportarten als zwei große Auswahlkarten mit Titel + einer Zeile Erklärung (statt Radio-Liste); Hinweistext zum Kassenbuch klein darunter.
D — Kursdetail Desktop (ab 1024 px)

Befund: Inhalt hängt links-mittig mit leerer Fläche, Liste wirkt wie ein Formular, „8 Plätze frei“ und „2 von 10 belegt“ doppelt, „Kurs absagenKurs löschen“ klebt zusammen und sieht wie ein Fehler aus.

Neuer Aufbau (Inhalt mittig, max. 1120 px):

Kopfbereich über die volle Breite: kleine Zeile „Kurse ›“ (Brotkrumen statt „Zurück“), Titel groß (32 px), darunter Chips: „Morgen · Mo, 5. Okt“ · „13:00–14:00“ · „Neuss“. Rechts im Kopf ein „⋯“-Menü (Owner/Admin) mit Bearbeiten, Kurs absagen, Kurs löschen (letzte zwei in Fehlerfarbe, mit Bestätigungsdialog). Die losen roten Links unten entfallen.
Links (≈ 2/3): Kachelreihe mit 3 Infos (Icon oben, Wert groß, Label klein): Dauer 60 Min · Lehrende (Avatar + Name) · Ort (mit Karten-Link). Darunter „Über den Kurs“ mit ordentlicher Typografie (max. 70 Zeichen Zeilenbreite).
Rechts (≈ 1/3), bleibt beim Scrollen stehen: Buchungskarte — Preis groß „12,00 €“ + „pro Termin“; Belegung als Balken „2 von 10 · 8 frei“ (nur einmal!); Abmeldefrist; dann je Rolle:
Teilnehmende: Primärknopf „Weiter zur Buchung“ bzw. Status der eigenen Buchung.
Owner/Admin: Primärknopf „Check-in öffnen“, Sekundär „Teilnehmerliste“.
Abstände nach 8-px-Raster, Kartenrand + leichter Schatten wie im Designsystem, keine Linien zwischen jeder Zeile.
Akzeptanz
Unit: Toast-Komponente, ICS (Zeitzone, UID, Token-Prüfung inkl. gefälschtes Token), Mail-Texte (vor/nach Frist, voll/teil), Export-Zeitraum (Monatsgrenzen, Jahr).
E2E: Abmelden → Toast + Rückgängig; Kurs absagen über „⋯“ mit Bestätigung; Export „Letzter Monat“ lädt Datei mit passender Zeilenzahl; ICS-Link liefert 200 + text/calendar, gefälschtes Token 404.
Screenshot-Vergleich mobil (außer Wording) = Referenz; Screenshots Desktop 1280/1440 + Mails (Gmail Web, iPhone hell/dunkel) in den Bericht.
Haltestelle 5 am Ende, Klickliste max. 12 Punkte.