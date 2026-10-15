Nachtrag ZW-1 — Zahlart sichtbar am Knopf, Toast-Dauer nach Art

Für Cursor. Stand: 04.10.2026, HEAD e4de6b7. Klicktest ZW-1 (Julius): alle 10 Punkte ok. Je Punkt ein Commit, check:ci vor Push, Bericht docs/berichte/zw1_zahlungswege.md ergänzen, Haltestelle 5 mit kurzer Klickliste (max. 6).

N1 — Zahlart-Zeile direkt über dem Knopf (statt „Anders bezahlen“-Link)

Problem: Online und Vor Ort führen beide zu „Weiter zur Buchung“. Wer bisher immer vor Ort gezahlt hat, merkt nicht, wie er gerade bucht.

Lösung (Muster wie Zahlart-Zeile bei Uber/Lieferando): Unmittelbar über dem Knopf eine antippbare Zeile mit Icon, gewählter Zahlart und „Ändern ›“. Sie ersetzt den Link „Anders bezahlen“. Der Knopftext nennt den nächsten Schritt passend zur Zahlart:

Zahlart	Zeile über dem Knopf	Knopf
Karte	[Karten-Icon] 10er-Karte · noch 7 · Ändern ›	Mit 10er-Karte buchen
Online	[Kreditkarten-Icon] Online bezahlen · Karte, Apple Pay · Ändern ›	Weiter zur Zahlung
Vor Ort	[Münz-Icon] Vor Ort bezahlen · im Studio · Ändern ›	Weiter zur Buchung
Nur ein Weg verfügbar → Zeile ohne „Ändern ›“ (nicht antippbar), Zahlart bleibt trotzdem sichtbar.
„Ändern ›“ öffnet das bestehende Auswahl-Sheet.
Mobile Buchungsleiste: Zeile 1 Preis + Knopf, darunter die Zahlart-Zeile, darunter die Abmeldefrist (Icon-Spalte wie N3). Desktop-Buchungskarte: Zahlart-Zeile direkt über dem Knopf.
Einmaliger Hinweis für Gewohnheits-Vor-Ort-Zahler: Hat die Person schon Buchungen mit Vor-Ort-Zahlung, aber noch nie online bezahlt, und ist Online der Standard → an der Zahlart-Zeile ein kleines Abzeichen „Neu“ und darunter einmal die Zeile „Du kannst jetzt direkt online bezahlen.“ Nach der ersten Buchung (egal welche Zahlart) nicht mehr zeigen. Speicherung serverseitig am Mitglied (kein localStorage).
N2 — Toast-Dauer nach Art der Meldung
Art	Dauer	Zeitbalken
Kurze Bestätigung ohne Rückgängig („Gespeichert“)	3 s	nein
Bestätigung mit Rückgängig (Abmelden, Entfernen, Ein-Tipp-Buchung mit Karte)	6 s	ja
Fehler	bleibt, bis geschlossen	nein
Längerer Text (> 60 Zeichen)	+ 1 s	wie oben
Hover/Fokus pausiert weiter.
Texte konkret statt allgemein: „Du bist dabei · Yin Yoga, Mi 20:00“ statt „Erfolgreich angemeldet.“; „Hans Peter abgemeldet“ statt „Teilnehmer erfolgreich abgemeldet“.
Regel + Tabelle ins Designsystem.
N3 — Fehlende E2E-Fälle aus ZW-1

Bericht meldet E2E 1/1, die Story verlangt 4: (1) „beide“ ohne Karte → Online Standard; (2) mit 10er-Karte → Ein-Tipp + Toast; (3) „nur Vor Ort“ → Bestätigung mit „Zahlungspflichtig buchen“; (4) letzter Schalter in Einstellungen nicht abschaltbar. Plus neu: (5) Zahlart-Zeile + Knopftext je Zahlart, (6) „Neu“-Hinweis erscheint einmal. Alle im Studio e2eapp.

N4 — LAST_METHOD dokumentieren

Im Bericht beschreiben: wo gespeichert (serverseitig?), wie es mit der Reihenfolge Karte → Online → Vor Ort zusammenspielt. Regel: Eine gültige Karte hat immer Vorrang; danach darf die zuletzt gewählte Zahlart Standard sein, aber nur wenn sie verfügbar ist. In Entscheidung 14 als Z7 ergänzen.