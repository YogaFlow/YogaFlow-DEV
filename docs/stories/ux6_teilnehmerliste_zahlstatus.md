Story UX-6 — Teilnehmerliste mit Zahlstatus statt „Check-in“

Für Cursor (autonomer Ablauf). Stand: 05.10.2026. Startet nach Klicktest RT-1. Als docs/stories/ux6_teilnehmerliste_zahlstatus.md ablegen; Entscheidung 18 unten als docs/entscheidungen/18_Teilnehmerliste_Zahlstatus.md (eigener Doku-Commit). check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp.

Befund (Julius-Klicktest, Claude auf DEV geprüft)
Omlify speichert keine Anwesenheit (registrations hat kein Feld dafür). Der Knopf „Einchecken“ (Umbenennung aus UX-3) verspricht also etwas, das es nicht gibt.
„Zahlungen › Offen“ (get_open_coverage) zeigt nur Kurse, die schon begonnen haben. Eine frische Vor-Ort-Buchung für einen kommenden Kurs taucht nirgends als „kommt noch“ auf → wirkt wie ein Fehler.
Ein Datenbank-Zustand (coverage_status = open) bedeutet vor dem Kurs „zahlt vor Ort“, danach „offen“ — die Oberfläche unterscheidet das nicht.
Teil 0 (nur lesen, kurzer Bericht, STOPP)
Was genau tut der Knopf „Einchecken“ heute (RPC, Datei:Zeile)? Was „Mehr“?
Alle Stellen mit „Check-in“/„Einchecken“ (Navigation, Seiten, Knöpfe, Mails, Hilfe, Übersichtskarte, Kursdetail „Check-in öffnen“).
Teilnehmerliste vs. Check-in-Seite: Was zeigt welche (Spalten, Aktionen, Rollen, Zeitraum — heute nur kommende Kurse?).
Wo wird der Zahlstatus heute als Text/Farbe dargestellt (Teilnehmerliste, Check-in, Meine Anmeldungen, Personen, CSV)? Gibt es eine zentrale Funktion?
Entscheidung 18 — Teilnehmerliste mit Zahlstatus (Julius, 05.10.2026)
#	Entscheidung
T1	Kein „Check-in“ mehr. Die eigene Seite wird zur Teilnehmerliste des Kurses (eine Ansicht für Teilnehmende + Zahlungen). Alle Texte „Check-in“/„Einchecken“ entfallen. Route darf bleiben, Alt-Links leiten weiter.
T2	Eine Aktion je offener Person, die sagt, was passiert: Primärknopf „Bar erhalten“; Menü ⋯: PayPal erhalten · Überweisung erhalten · Mit Karte bezahlen (nur wenn passend) · Erlassen… (Owner/Admin). Bestehende RPCs, keine neuen. Rückgängig wie heute (15-Minuten-Regel).
T3	Zahlstatus mit Zeitbezug, überall gleich, aus einer Funktion (paymentStatusLabel(registration, courseStartsAt, now)): vor Kursbeginn open = „Zahlt vor Ort“ (neutral grau); ab Kursbeginn = „Offen“ (Warnfarbe). Übrige: „Bezahlt · online/bar/PayPal/Überweisung“, „Karte · noch n“, „Erlassen“, „Kostenlos“, „Zahlung läuft“ (pending_payment). Nie nur über Farbe. Lehrende sehen statt Methode nur „Bezahlt“ (E5).
T4	Zahlungen › Offen zweigeteilt: „Überfällig“ (Kurs begonnen, wie heute, Arbeitsliste) und „Kommt noch · zahlt vor Ort“ (kommende Kurse, eingeklappt, Kopfzeile „5 Buchungen in 3 Kursen“, je Kurs gruppiert, Sprung zur Teilnehmerliste). Neue Lese-Funktion oder Parameter für kommende Kurse; gleiche Rechte/Filter wie get_open_coverage (Tenant, Archiv, nur registered). Keine Summen (E14), nur Anzahlen.
T5	Teilnehmerliste zeigt auch heutige Kurse bis Tagesende (nicht nur kommende), damit nach dem Kurs vermerkt werden kann. Vergangene Kurse über „Überfällig“ und Kursdetail.
T6	Übersichtskarte: vor Beginn „Heute 18:00 · Hatha · 3 zahlen vor Ort ›“, ab Beginn „… · 3 offen ›“; keine Karte, wenn nichts zu tun ist. Kursdetail (Owner/Admin): Knopf „Teilnehmerliste“ statt „Check-in öffnen“.
T7	Anwesenheit: nicht bauen (Nicht jetzt). Erst bei konkretem Studio-Bedarf oder mit dem Thema Kundenbindung.
Umfang
A — Teilnehmerliste je Kurs
Hatha Flow · heute 18:00                       ⋯
8 angemeldet · 3 zahlen vor Ort
───────────────────────────────────────────────
Anna Berg      Karte · noch 5
Olaf Online    Bezahlt · online
Vera Vorort    Zahlt vor Ort     [ Bar erhalten ] ⋯
Sortierung: zu erledigen zuerst (Offen → Zahlt vor Ort), dann alphabetisch. Warteliste eingeklappt darunter, Abgemeldete nicht.
Kopfzeile-Zähler passt sich an (vor Beginn „zahlen vor Ort“, danach „offen“), Erledigt-Zustand: „Alles erledigt ✓“.
360 px: Name + Status zweizeilig, Knopf rechts, Touch ≥ 44 px; 1280 px: Tabelle mit Spalten Name · Zahlstatus · Aktion.
Toast nach „Bar erhalten“: „Vera Vorort · bar vermerkt“ (4 s, Rückgängig nach Toast-Regel nur wo erlaubt).
B — Zahlungen › Offen (T4)
C — Texte und Einstiege (T1, T6), Liste der geänderten Texte im Bericht
D — Demodaten

demoalpha: ein heutiger Kurs (Beginn in ~2 h) mit Vera (vor Ort), Karla (Karte), Olaf (online) und ein gestriger Kurs mit Nina offen → Julius sieht beide Zustände.

Akzeptanz
Unit: paymentStatusLabel für alle Zustände × vor/nach Beginn × Rolle (Owner/Lehrende).
SQL: Lese-Funktion „kommt noch“ — kein Fremd-Tenant, keine Archivierten, keine Abgemeldeten, Lehrende ohne Zugriff, wenn heute auch so.
E2E (e2eapp): (1) Vor-Ort-Buchung kommender Kurs → „Kommt noch“ zeigt sie, Teilnehmerliste „Zahlt vor Ort“; (2) Kurs gestartet (Testzeit/Seed) → „Offen“ + in „Überfällig“; (3) „Bar erhalten“ → „Bezahlt · bar“, verschwindet aus Offen; (4) kein Text „Check-in“/„Einchecken“ mehr (Textsuche im Build).
Screenshots 360/1280. Haltestelle 5, Klickliste max. 8 Punkte (Konto je Punkt).