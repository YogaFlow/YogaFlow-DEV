Story UX-8 — Übersicht: eine Liste „Zu erledigen“

Für Cursor (autonomer Ablauf). Stand: 06.10.2026, HEAD 29f0ad8. Als docs/stories/ux8_uebersicht_zu_erledigen.md ablegen. check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp, Haltestelle 5 (Klickliste max. 6).

Befund (Screenshot Julius, Owner demoalpha)

Drei Karten mit Überschneidung:

„Rückgaben offen“ — „Abgesagt mit Erstattung Sa, 10. Okt – 1 Rückgabe“
„Offene Zahlungen — 1 Anmeldungen bei 1 Personen“ (= Nina/Yin Yoga, doppelt mit der nächsten Karte; Grammatik falsch)
„Heute zu erledigen“ — enthält auch „Gestern 10:00 · Yin Yoga · 1 offen“ Drei Überschriften für dieselbe Art Arbeit, ein Fall doppelt, „Heute“ enthält Gestern.
Teil 0 (nur lesen, kurz, dann weiter ohne STOPP, außer bei Abweichung)
Warum zeigt der abgesagte Demo-Kurs „1 Rückgabe“? Ist das eine Vor-Ort-Zahlung (Rückgabe von Hand, richtig) oder eine online bezahlte Buchung, die automatisch erstattet wurde (dann darf sie dort nicht stehen → Fehler, Haltestelle)? Und: Der Kurs heißt im Seed „Abgesagt mit Erstattung“ → realistischen Namen geben (z. B. „Yoga am Samstagmorgen“).
Welche Quellen speisen die drei Karten heute (RPC/Datei:Zeile)?
Neu: eine Karte „Zu erledigen“
Zu erledigen                                           3
──────────────────────────────────────────────────────────
↩  18,00 € bar an Vera Vorort zurückgeben                 ›
   Yoga am Samstagmorgen · abgesagt · Sa, 10. Okt
€  1 Zahlung offen · Yin Yoga                             ›
   Gestern, 10:00
◷  2 zahlen vor Ort · Hatha am Nachmittag                 ›
   Heute, 19:29
──────────────────────────────────────────────────────────
   + 4 weitere offene Zahlungen aus früheren Kursen      ›
Eine Karte ersetzt „Rückgaben offen“, „Offene Zahlungen“ und „Heute zu erledigen“.
Ein Fall erscheint genau einmal. Zeilenarten (Icon + Text, nie nur Farbe):
Geld zurückgeben (abgesagter Kurs mit Vor-Ort-Zahlung ohne Gegenzeile): je Person eine Zeile mit Betrag, Name, Methode → Sprung zur Teilnehmerliste des Kurses („Rückgaben“-Ansicht wie heute).
Zahlung offen (Kurs begonnen, gestern oder heute): je Kurs eine Zeile „n Zahlung(en) offen · Kurs“ → Teilnehmerliste.
Zahlt vor Ort (heutiger Kurs, noch nicht begonnen): je Kurs „n zahlen vor Ort · Kurs“ → Teilnehmerliste.
Ältere offene Zahlungen (vor gestern): eine Sammelzeile „+ n weitere offene Zahlungen aus früheren Kursen“ → Zahlungen › Offen › Überfällig.
Reihenfolge: Geld zurückgeben → Zahlung offen → Zahlt vor Ort (heute) → Sammelzeile. Innerhalb nach Zeit.
Zähler rechts in der Überschrift = Anzahl Zeilen ohne Sammelzeile.
Leer: „Alles erledigt ✓ — nichts offen.“ (kleine Karte, keine leeren Abschnitte).
Mehrzahl/Einzahl korrekt („1 Zahlung“, „2 Zahlungen“). Datumswörter: Heute / Gestern / sonst „Sa, 10. Okt“.
Rollen: Lehrende sehen nur Zeilen ihrer Kurse und keine Beträge/Methoden (E5): „1 Rückgabe offen · Kurs“ statt Betrag. Owner/Admin alles.
Online-Erstattungen erscheinen nie (laufen automatisch); fehlgeschlagene Erstattungen weiter über Glocke/Überwachung wie heute.
Mobil: Zeile 2-zeilig (Titel fett, Unterzeile grau), ganze Zeile tippbar ≥ 56 px.
Technik
Eine Funktion im Client buildTodoItems(sources, now, role) → typisierte Liste {kind, title, subtitle, amountCents?, href, sortKey}; speist nur die Übersicht. Bestehende RPCs wiederverwenden, keine neue Tabelle. (Später kann dieselbe Liste serverseitig entstehen — Grundlage für eine Aufgaben-/Inbox-Ansicht. Jetzt nicht bauen.)
Unit-Tests: Dedupe (Nina erscheint einmal), Reihenfolge, Gestern/Heute/älter, Rollen, Einzahl/Mehrzahl, leer.
Akzeptanz
E2E (e2eapp): (1) Vor-Ort-Zahlung, Kurs abgesagt → Zeile „zurückgeben“; (2) offene Zahlung gestern + vor-Ort heute → je eine Zeile, keine Doppelung; (3) alles erledigt → Leerzustand.
Screenshots 360/1280 (Owner, Lehrende, leer).