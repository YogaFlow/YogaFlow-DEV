UX-6 — Freigabe nach Teil 0 (Claude, 05.10.2026)

Für Cursor. Teil 0 freigegeben. Zuerst Entscheidung 18 (aus der Story, ergänzt um T8–T10 unten) als Doku-Commit docs/entscheidungen/18_Teilnehmerliste_Zahlstatus.md, dann A–D. check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp, Haltestelle 5.

Antworten auf den Bericht
#	Befund	Entscheidung
T8	Zwei Seiten je Kurs: /course/:id/participants (Kontakt, Abmelden, CSV) und /course/:id/kassieren (Zahlung)	Zusammenlegen zu einer Seite je Kurs unter /course/:id/participants, Titel = Kursname + Termin. Inhalt: Zahlstatus + Aktion (aus CourseCheckout) und die Personen-Aktionen aus Participants im Zeilenmenü ⋯ (Kontakt anzeigen, Abmelden, Karte verkaufen/zurücknehmen, PayPal/Überweisung erhalten, Anderer Betrag…, Erlassen…/zurücknehmen). CSV-Export oben rechts im Seitenmenü. /kassieren leitet auf die neue Route weiter (Alt-Links, Lesezeichen). Komponente wiederverwenden, nicht neu schreiben.
T9	Zentrale Funktion heißt coverageLabel, kein paymentStatusLabel	coverageLabel erweitern statt neu bauen: zusätzliche Parameter courseStartsAt, now. open vor Beginn → Staff „Zahlt vor Ort“, Teilnehmende „Bezahlung vor Ort“; ab Beginn → Staff „Offen“, Teilnehmende „Offen · bitte vor Ort bezahlen“. Alle bisherigen Aufrufer (Liste, Meine Anmeldungen, CSV) übergeben die Zeit; CSV bleibt ohne Zeitbezug („offen“), damit Exporte stabil sind. Story-Text paymentStatusLabel gilt als coverageLabel.
T10	Globale Seite /participants (alle Kurse)	Bleibt in Aufbau und Zeitraum (heute inkl. begonnen bis Tagesende → T5 ist bereits erfüllt). Nur: Spalte Bezahlung nutzt das neue Label; Link „Check-in“ → „Teilnehmerliste“ (bei abgesagtem Kurs weiter „Rückgaben“) auf die zusammengelegte Kursseite.
Primäraktion und Texte
Primärknopf „Bar erhalten“ (statt „Einchecken“), weiterhin record_manual_payment(…, 'cash'). Passt eine Karte: sekundärer Schnellknopf „Karte“ wie heute. Undo unverändert.
Unterzeile „Wer ist da, wer hat bezahlt.“ → Zähler: vor Beginn „8 angemeldet · 3 zahlen vor Ort“, ab Beginn „8 angemeldet · 3 offen“, fertig „Alles erledigt ✓“.
Textersetzungen (vollständig, inkl. Tests):
alt	neu
Titel/Route „Check-in“	Kursname · Termin (Brotkrume „Teilnehmerliste“)
Dashboard-Sektion „Check-in“	„Heute zu erledigen“ mit Karten nach T6
CourseDetail „Check-in öffnen“ + Sekundär „Teilnehmerliste“	ein Knopf „Teilnehmerliste“
RemovePersonDialog „Zum Check-in“	„Zur Teilnehmerliste“
„Check-in geht erst, wenn die Person nachrückt.“	„Zahlung vermerken geht erst, wenn die Person nachrückt.“
Nach Umsetzung: Textsuche Check-in|Einchecken|kassieren in src/ (außer Route-Weiterleitung und internen Namen) = 0 Treffer, im Bericht belegen.
Unverändert

T1–T7 aus der Story, B (Zahlungen › Offen zweigeteilt) und D (Demodaten) wie beschrieben.