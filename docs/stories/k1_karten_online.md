Story K1 — Karten online kaufen, „Meine Karten“, Widerruf

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Startet nach UX-5. Als docs/stories/k1_karten_online.md ablegen; Entscheidung 15 unten als docs/entscheidungen/15_Karten_online.md (eigener Doku-Commit). Rechtliche Einordnung von Claude, nicht anwaltlich geprüft — Texte genau so übernehmen. Teil 0 zuerst (nur lesen, Bericht, STOPP): Inventur, wie heute Karten verkauft, gebucht, zurückgebucht und im Hauptbuch verbucht werden (pass_products, passes, pass_movements, Kasse „Karte verkaufen“, A6/A7), und wo payment_attempts/payments/receipts/Webhook/Jobs heute fest auf Buchungen (registration) zugeschnitten sind. Vorschlag, wie „Zahlung für eine Karte“ dort eingehängt wird, mit Liste der Stellen. → Haltestelle 1, Claude prüft.

Entscheidung 15 — Karten online (bestätigt von Julius, 04.10.2026)
#	Entscheidung
K1	Nur Termin-Karten (X Termine, einmal bezahlt). Keine Zeitkarten, keine Abos. Modell existiert (pass_products.units).
K2	Mit Karte buchbar sind Kurse mit pass_eligible = true (Studio entscheidet je Kurs, wie heute). 1 Kurs = 1 Termin.
K3	Gültigkeit je Kartenprodukt vom Studio festgelegt, Vorbelegung 12 Monate ab Kauf. Bestehende validity_rule nutzen.
K4	Ablauf: ungenutzte Termine verfallen. Erinnerungs-Mail 30 und 7 Tage vorher; Owner/Admin kann eine Karte einzeln verlängern (neues Ablaufdatum + Pflicht-Notiz, Eintrag im Kartenverlauf).
K5	Persönlich: nur die Käuferin bucht damit.
K6	Bezahlen: online selbst (Karte, Apple Pay, Google Pay) über denselben Checkout wie Kurse; bar weiterhin nur über das Studio (Check-in › Karte verkaufen). Kein „online bestellen, vor Ort zahlen“.
K7	Widerrufsrecht 14 Tage (Karte hat keinen festen Termin → Ausnahme § 312g Abs. 2 Nr. 9 BGB greift nicht). Sofort nutzbar, wenn die Käuferin es beim Kauf ausdrücklich verlangt (Pflicht-Häkchen). Bei Widerruf: Erstattung abzüglich Wertersatz für genutzte Termine = Preis ÷ Termine × genutzte Termine; restliche Termine werden entwertet.
K8	Widerrufsbutton (§ 356a BGB, Pflicht seit 19.06.2026): während der Widerrufsfrist leicht erreichbar, zweistufig: Knopf „Vertrag widerrufen“ → Formular → Knopf „Widerruf bestätigen“ → sofortige Eingangsbestätigung per E-Mail.
K9	Nach der Frist: kein Rückgaberecht; Owner/Admin kann auf Kulanz anteilig erstatten (bestehender Erstatten-Knopf), restliche Termine werden dabei entwertet.
K10	Ort: Menüpunkt „Meine Karten“ für Teilnehmende (nur sichtbar, wenn das Studio online kaufbare Karten hat oder die Person eine Karte besitzt). Zusätzlich dezenter Hinweis im Kursdetail.
K11	Preisgrenze 250,00 € wie bei Kursen (Kleinbetragsrechnung). Teurere Kartenprodukte nur im Studio verkaufbar (Hinweis in den Einstellungen).
Umfang
A — Einstellungen › Karten (Owner/Admin)
Je Kartenprodukt: Name, Termine, Preis, Gültigkeit (Vorbelegung 12 Monate), kurze Beschreibung (optional, 140 Zeichen), Schalter „Online kaufbar“.
Vorschau-Zeile: „10 Termine · 120,00 € · 12,00 € pro Termin · 12 Monate gültig“.
Online kaufbar nur, wenn Online-Zahlung des Studios bereit ist (gleiche Prüfung wie bei Kursen) und Preis ≤ 250 €; sonst Schalter gesperrt mit Grund.
B — „Meine Karten“ (Teilnehmende)
Aktive Karten als Karten-Kacheln: Name, „noch 6 von 10“, Fortschrittsbalken, „gültig bis 4. Okt 2027“, Link „Verlauf“ (gebucht/zurück/verlängert, mit Kurs + Datum).
Während der Widerrufsfrist an der Karte: Text-Link „Vertrag widerrufen“ (K8) mit Hinweis „bis 18. Okt 2026 möglich“.
Abgelaufene/verbrauchte Karten eingeklappt darunter.
„Karte kaufen“: Liste der online kaufbaren Produkte mit Preis pro Termin und Ersparnis gegenüber dem häufigsten Einzelpreis des Studios, z. B. „10 Termine · 120 € · du sparst 30 €“ (Rechnung im Tooltip: „10 × 15 € = 150 € − 120 € = 30 €“).
C — Kaufen
Checkout-Sheet wie bei Kursen (gleiche Komponente, gleicher Fuß). Zusammenfassung: „10er-Karte · 10 Termine · gültig 12 Monate ab heute“.
Pflicht-Häkchen (nicht vorausgewählt), direkt über dem Knopf:

„Ich verlange ausdrücklich, dass ich die Karte sofort nutzen kann. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Termine anteilig Wertersatz leiste.“

Kleiner Text darüber: „Du hast ein 14-tägiges Widerrufsrecht. Widerrufsbelehrung ›“ (Pop-up wie Rechtstexte).
Knopf „Zahlungspflichtig kaufen“. Gesamtpreis + Steuerangabe direkt davor.
Nach Erfolg: Karte sofort aktiv, Erfolgsfenster „Deine 10er-Karte ist bereit“ + „Jetzt Kurs buchen“.
Häkchen-Zustimmung mit Zeitpunkt + Textfassung speichern (Nachweis).
D — Beleg, Mails, Hauptbuch
Beleg je Kartenkauf (Kleinbetragsrechnung wie K8 aus Entscheidung 12): Leistung „10er-Karte ‚Yoga‘ (10 Termine, gültig bis …)“. Erstattungsbeleg bei Widerruf/Kulanz.
Bestätigungs-Mail (Vorlage UX-3): „Deine 10er-Karte ist bereit“, Termine, gültig bis, Knopf „Kurs buchen“, Beleg-Link; im Fuß Widerrufsbelehrung + Muster-Widerrufsformular als Text und Hinweis auf die erteilte Zustimmung zur sofortigen Nutzung (dauerhafter Datenträger).
Mails: Erinnerung 30/7 Tage vor Ablauf (nur wenn noch Termine offen), „Noch 1 Termin auf deiner Karte“ (einmal), Widerruf-Eingangsbestätigung, Widerruf-Erstattung.
Hauptbuch: Online-Kartenverkauf wie heutiger Kartenverkauf verbuchen, nur Gegenkonto psp_clearing (wie Online-Kurszahlung). Erstattung/Wertersatz analog H5'. Teil 0 belegt, dass das zusammenpasst.
E — Widerruf (K7/K8)
Erreichbar ohne Umwege: in „Meine Karten“ an der Karte, als Link in der Bestätigungs-Mail und als öffentliche Seite je Studio /widerruf (verlinkt im Fuß der Studio-Seite) — dort ohne Login: Name, E-Mail, Belegnummer.
Ablauf: „Vertrag widerrufen“ → Formular (vorbefüllt, wenn eingeloggt) → Zusammenfassung „Erstattung: 120,00 € − 2 genutzte Termine × 12,00 € = 96,00 €“ → „Widerruf bestätigen“ → Eingangsbestätigung sofort per Mail (mit Datum/Uhrzeit des Widerrufs) → Karte entwertet → Stripe-Erstattung über den bestehenden Erstattungsweg (Grund withdrawal) innerhalb von 14 Tagen (automatisch sofort).
Nach Ablauf der Frist: Knopf verschwindet; öffentliche Seite meldet „Die Widerrufsfrist für diesen Kauf ist abgelaufen“ (Datum nennen).
Owner sieht Widerrufe in „Zahlungen“ als Erstattung mit Grund „Widerruf“.
F — Kursdetail-Hinweis (K10)

Nur wenn Kurs pass_eligible, ein Produkt online kaufbar ist und die Person keine aktive Karte hat: unter der Zahlart-Zeile klein „Mit der 10er-Karte zahlst du 12,00 € statt 15,00 € ›“ → öffnet „Karte kaufen“.

Akzeptanz
SQL/RPC: Kauf aktiviert Karte genau einmal (doppelter Webhook), Widerruf rechnet Wertersatz richtig (0, 2, 10 genutzte Termine), Verlängerung nur Owner/Admin mit Notiz, keine Fremd-Studio-Zugriffe, öffentliche Widerrufsseite verrät nichts ohne passende Belegnummer + E-Mail.
Unit: Texte (Ersparnis mit Rechenweg, Fristen, Wertersatz), Häkchen-Pflicht.
E2E (e2eapp): (1) Karte kaufen mit 4242 → aktiv → Kurs mit Karte buchen; (2) Widerruf nach 2 genutzten Terminen → Erstattung 96,00 € (bei 120 €/10), Karte entwertet, Mail; (3) Owner verlängert Karte; (4) Produkt > 250 € nicht online kaufbar.
Demodaten (demoalpha, nach UX-5): 5er-Karte 65 € und 10er-Karte 120 €, beide online kaufbar, 12 Monate.
check:ci grün. Haltestelle 5, Klickliste max. 12 Punkte.