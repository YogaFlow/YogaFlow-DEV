K1 — Freigabe nach Teil 0 (Claude, 04.10.2026)

Für Cursor. Grundlage: docs/berichte/k1_karten_online.md (4dbad3d). Claude hat die Kurzfassung geprüft; der Einhänge-Vorschlag ist freigegeben mit den Antworten unten. Danach K1 Teile A–F umsetzen, check:ci vor jedem Push, E2E nur in e2eapp, am Ende Haltestelle 5.

Grundsatz

Freigegeben: Attempt bezieht sich auf das Kartenprodukt, die Karte (passes) entsteht erst bei erfolgreicher Zahlung atomar in complete_*; gleiches Payment Element; Widerruf als neuer Erstattungsgrund withdrawal; H5' bleibt unverändert.

Antworten auf die 10 Punkte
#	Punkt	Entscheidung
1	Attempt-Subject	payment_attempts bekommt subject_type = 'pass_product'. Schnappschuss von Name, Terminen, Preis, Gültigkeit im Attempt speichern; die Karte wird aus dem Schnappschuss angelegt (Produktänderung während des Bezahlens ändert nichts). Anlage idempotent je PaymentIntent — Webhook- und Job-Pfad.
2	Timeout ohne Hold	Kein Platz-Hold. Attempt läuft nach 30 min ab → PaymentIntent über den bestehenden Outbox-Auftrag abbrechen. Kommt die Zahlung trotzdem durch (Rennen), wird die Karte trotzdem angelegt — anders als bei Kursen gibt es keine Knappheit, also keine automatische Erstattung. Test dafür.
3	UI-Default 12 Monate	Ja: validity_rule „Monate ab Kauf“, Wert 12, im Formular vorbelegt.
4	Verlängerung	Kein pass_movements mit delta = 0. Eigene append-only Tabelle pass_validity_changes (alt, neu, Notiz Pflicht, wer, wann); im Kartenverlauf als Zeile „Verlängert bis … (Notiz)“. Nur Owner/Admin.
5	Wertersatz-Rundung	In Cent auf die Summe, nicht je Termin: wertersatz = round(price_cents × genutzt ÷ termine) (kaufmännisch). Erstattung = Preis − Wertersatz, nie < 0. Beispiele als Unit-Test: 12000/10, 2 genutzt → 2400 / 9600; 10000/3, 1 genutzt → 3333 / 6667; 6500/5, 5 genutzt → 6500 / 0. Rechenweg im Widerrufs-Dialog und in der Mail anzeigen.
6	Kulanz entwertet Rest	Ja. Bei jeder Erstattung einer Karte (Kulanz oder Widerruf) werden alle Resttermine in derselben Transaktion entwertet (pass_movements kind void, negatives Delta, Grund). Danach kein Buchen mehr.
7	Consent-Speicher	Append-only Tabelle pass_purchase_consents: Attempt/Payment, Mitglied, Zeitpunkt, Text-Hash des Häkchentexts und der Widerrufsbelehrung (gleiche Hash-Logik wie AVV). Nicht in localStorage, nicht nur im Attempt-JSON.
8	Öffentliche /widerruf	Ohne Login: Belegnummer + E-Mail. Gleiche Antwort, ob gefunden oder nicht („Wenn die Angaben zu einem Kauf passen, siehst du jetzt die Zusammenfassung“ bzw. neutraler Hinweis) — keine Aufzählbarkeit. Rate-Limit je IP und je Belegnummer. Bei Treffer: Zusammenfassung mit Rechenweg → „Widerruf bestätigen“. Eingangsbestätigung geht an die gespeicherte E-Mail der Käuferin (nicht an eine eingegebene andere).
9	Mail „Noch 1 Termin“	Einmal je Karte, ausgelöst beim Einlösen, wenn danach genau 1 Termin übrig ist. Nicht senden, wenn die Karte innerhalb von 7 Tagen abläuft (dann deckt die Ablauf-Mail das ab).
10	14-Tage-Ende vs. 30/7	Kein Ereignis für das Fristende: Fristende = Kaufzeitpunkt + 14 Tage, beim Lesen berechnet (Knopf erscheint/verschwindet danach). Ablauf-Erinnerungen 30/7 Tage über einen täglichen Cron, nur bei offenen Terminen, je Karte und Stufe genau einmal (Merker). Ist die Karte kürzer als 30 Tage gültig, nur die 7-Tage-Mail.
Zusätzlich beachten
Belege: Beleg-Trigger und retry_missing_receipts auf Kartenkäufe erweitern; Leistungstext „10er-Karte ‚…‘ (10 Termine, gültig bis …)“. Überwachung (i) „Zahlung ohne Beleg“ muss Kartenkäufe einschließen.
Disputes, Dashboard-Erstattungen, Webhook-Tenant-Prüfung gelten unverändert auch für Kartenzahlungen — je ein Test.
Alle Stellen, die heute registration annehmen (Inventur-Liste), im Bericht abhaken: angepasst / bewusst nicht betroffen.
Preisgrenze 250 € serverseitig beim Anlegen des Attempts prüfen, nicht nur in der Oberfläche.
Demodaten demoalpha: 5er-Karte 65 €, 10er-Karte 120 €, beide online kaufbar, 12 Monate. Karla behält ihre bestehende Karte.