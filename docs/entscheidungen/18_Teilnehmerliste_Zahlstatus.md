# Entscheidung 18 — Teilnehmerliste mit Zahlstatus

Stand: 05.10.2026 · Entschieden von: Julius · Status: gilt  
Grundlage: Story [ux6_teilnehmerliste_zahlstatus.md](../stories/ux6_teilnehmerliste_zahlstatus.md), Freigabe Teil 0 [ux6_freigabe_teil0.md](../stories/ux6_freigabe_teil0.md).

| # | Entscheidung |
|---|---|
| T1 | Kein „Check-in“ mehr. Die eigene Seite wird zur Teilnehmerliste des Kurses (eine Ansicht für Teilnehmende + Zahlungen). Alle Texte „Check-in“/„Einchecken“ entfallen. Route `/kassieren` darf bleiben; Alt-Links leiten weiter. |
| T2 | Eine Aktion je offener Person, die sagt, was passiert: Primärknopf „Bar erhalten“; Menü ⋯: PayPal erhalten · Überweisung erhalten · Mit Karte bezahlen (nur wenn passend) · Erlassen… (Owner/Admin). Bestehende RPCs, keine neuen. Rückgängig wie heute (15-Minuten-Regel). Primäraktion bleibt `record_manual_payment(…, 'cash')`. Passt eine Karte: sekundärer Schnellknopf „Karte“ wie heute. |
| T3 | Zahlstatus mit Zeitbezug, überall gleich, aus **`coverageLabel`** (Story-Name `paymentStatusLabel` gilt als Alias): Parameter `courseStartsAt`, `now`. `open` vor Kursbeginn → Staff „Zahlt vor Ort“ (neutral), Teilnehmende „Bezahlung vor Ort“; ab Kursbeginn → Staff „Offen“ (Warnfarbe), Teilnehmende „Offen · bitte vor Ort bezahlen“. Übrige: „Bezahlt · online/bar/PayPal/Überweisung“, „Karte · noch n“, „Erlassen“, „Kostenlos“, „Zahlung läuft“ (`pending_payment`). Nie nur über Farbe. Lehrende sehen statt Methode nur „Bezahlt“ (E5). CSV bleibt ohne Zeitbezug („offen“), damit Exporte stabil sind. |
| T4 | Zahlungen › Offen zweigeteilt: „Überfällig“ (Kurs begonnen, wie heute, Arbeitsliste) und „Kommt noch · zahlt vor Ort“ (kommende Kurse, eingeklappt, Kopfzeile „5 Buchungen in 3 Kursen“, je Kurs gruppiert, Sprung zur Teilnehmerliste). Neue Lese-Funktion oder Parameter für kommende Kurse; gleiche Rechte/Filter wie `get_open_coverage` (Tenant, Archiv, nur `registered`). Keine Summen (E14), nur Anzahlen. |
| T5 | Teilnehmerliste zeigt auch heutige Kurse bis Tagesende (nicht nur kommende), damit nach dem Kurs vermerkt werden kann. Vergangene Kurse über „Überfällig“ und Kursdetail. (Globale `/participants`: Zeitraum bereits so.) |
| T6 | Übersichtskarte: vor Beginn „Heute 18:00 · Hatha · 3 zahlen vor Ort ›“, ab Beginn „… · 3 offen ›“; keine Karte, wenn nichts zu tun ist. Sektionstitel „Heute zu erledigen“. Kursdetail (Owner/Admin): ein Knopf „Teilnehmerliste“ (kein „Check-in öffnen“). |
| T7 | Anwesenheit: nicht bauen (Nicht jetzt). Erst bei konkretem Studio-Bedarf oder mit dem Thema Kundenbindung. |
| T8 | Zwei Seiten je Kurs (`/participants` Kontakt/CSV und `/kassieren` Zahlung) werden zu **einer** Seite unter `/course/:id/participants`, Titel = Kursname + Termin. Inhalt: Zahlstatus + Aktion (aus `CourseCheckout`) und Personen-Aktionen aus Participants im Zeilenmenü ⋯ (Kontakt anzeigen, Abmelden, Karte verkaufen/zurücknehmen, PayPal/Überweisung erhalten, Anderer Betrag…, Erlassen…/zurücknehmen). CSV-Export oben rechts im Seitenmenü. `/kassieren` leitet auf die neue Route weiter. Komponente wiederverwenden, nicht neu schreiben. |
| T9 | `coverageLabel` erweitern statt neu bauen (siehe T3). Alle Aufrufer mit Zeit (Liste, Meine Anmeldungen) übergeben `courseStartsAt`/`now`; CSV ohne Zeitbezug. |
| T10 | Globale Seite `/participants` (alle Kurse) bleibt in Aufbau und Zeitraum. Nur: Spalte Bezahlung nutzt das neue Label; Link „Check-in“ → „Teilnehmerliste“ (bei abgesagtem Kurs weiter „Rückgaben“) auf die zusammengelegte Kursseite. |

## Textersetzungen (verbindlich)

| alt | neu |
|---|---|
| Titel/Route „Check-in“ | Kursname · Termin (Brotkrume „Teilnehmerliste“) |
| Dashboard-Sektion „Check-in“ | „Heute zu erledigen“ mit Karten nach T6 |
| CourseDetail „Check-in öffnen“ + Sekundär „Teilnehmerliste“ | ein Knopf „Teilnehmerliste“ |
| RemovePersonDialog „Zum Check-in“ | „Zur Teilnehmerliste“ |
| „Check-in geht erst, wenn die Person nachrückt.“ | „Zahlung vermerken geht erst, wenn die Person nachrückt.“ |
| Primärknopf „Einchecken“ | „Bar erhalten“ |
| Unterzeile „Wer ist da, wer hat bezahlt.“ | Zähler: vor Beginn „n angemeldet · m zahlen vor Ort“, ab Beginn „… · m offen“, fertig „Alles erledigt ✓“ |

Nach Umsetzung: Textsuche `Check-in|Einchecken|kassieren` in `src/` (außer Route-Weiterleitung und internen Namen) = 0 Treffer.
