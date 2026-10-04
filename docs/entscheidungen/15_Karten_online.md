# Entscheidung 15 — Karten online

Stand: 04.10.2026 · Entschieden von: Julius · Status: gilt  
Grundlage: Story [k1_karten_online.md](../stories/k1_karten_online.md).  
Rechtliche Einordnung von Claude, nicht anwaltlich geprüft — Texte genau so übernehmen.

| # | Entscheidung |
|---|---|
| K1 | Nur Termin-Karten (X Termine, einmal bezahlt). Keine Zeitkarten, keine Abos. Modell existiert (`pass_products.units`). |
| K2 | Mit Karte buchbar sind Kurse mit `pass_eligible = true` (Studio entscheidet je Kurs, wie heute). 1 Kurs = 1 Termin. |
| K3 | Gültigkeit je Kartenprodukt vom Studio festgelegt, Vorbelegung 12 Monate ab Kauf. Bestehende `validity_rule` nutzen. |
| K4 | Ablauf: ungenutzte Termine verfallen. Erinnerungs-Mail 30 und 7 Tage vorher; Owner/Admin kann eine Karte einzeln verlängern (neues Ablaufdatum + Pflicht-Notiz, Eintrag im Kartenverlauf). |
| K5 | Persönlich: nur die Käuferin bucht damit. |
| K6 | Bezahlen: online selbst (Karte, Apple Pay, Google Pay) über denselben Checkout wie Kurse; bar weiterhin nur über das Studio (Check-in › Karte verkaufen). Kein „online bestellen, vor Ort zahlen“. |
| K7 | Widerrufsrecht 14 Tage (Karte hat keinen festen Termin → Ausnahme § 312g Abs. 2 Nr. 9 BGB greift nicht). Sofort nutzbar, wenn die Käuferin es beim Kauf ausdrücklich verlangt (Pflicht-Häkchen). Bei Widerruf: Erstattung abzüglich Wertersatz für genutzte Termine = Preis ÷ Termine × genutzte Termine; restliche Termine werden entwertet. |
| K8 | Widerrufsbutton (§ 356a BGB, Pflicht seit 19.06.2026): während der Widerrufsfrist leicht erreichbar, zweistufig: Knopf „Vertrag widerrufen“ → Formular → Knopf „Widerruf bestätigen“ → sofortige Eingangsbestätigung per E-Mail. |
| K9 | Nach der Frist: kein Rückgaberecht; Owner/Admin kann auf Kulanz anteilig erstatten (bestehender Erstatten-Knopf), restliche Termine werden dabei entwertet. |
| K10 | Ort: Menüpunkt „Meine Karten“ für Teilnehmende (nur sichtbar, wenn das Studio online kaufbare Karten hat oder die Person eine Karte besitzt). Zusätzlich dezenter Hinweis im Kursdetail. |
| K11 | Preisgrenze 250,00 € wie bei Kursen (Kleinbetragsrechnung). Teurere Kartenprodukte nur im Studio verkaufbar (Hinweis in den Einstellungen). |
