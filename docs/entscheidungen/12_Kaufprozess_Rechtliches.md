Entscheidung 12 – Kaufprozess & Rechtliches (Story B1)

Stand: 04.10.2026 · Vorgegeben von: Julius in Story B1 · Status: **gilt**
Grundlage: Story [b1_bestellknopf_bestaetigung_belege.md](../stories/b1_bestellknopf_bestaetigung_belege.md), Entscheidungen 09–11, DESIGNSYSTEM.
Rechtliche Einordnung von Claude, nicht anwaltlich geprüft (bewusste Entscheidung von Julius).

Verkäufer ist immer das Studio, Omlify ist nur die Technik.

Entscheidungen

| # | Entscheidung |
|---|---|
| K1 | Studio-Angaben (neu, je Studio, Owner pflegt unter Einstellungen → Rechtliches): Anbietername (Studio bzw. Inhaber:in, z. B. „Yoga Mitte · Anna Beispiel“), Straße + Nr., PLZ, Ort, Land (Standard DE), Kontakt-E-Mail, Telefon (optional), Steuernummer oder USt-IdNr. (optional, nur Anzeige im Impressum später). Diese Angaben sind die Quelle für Bestätigung, Beleg und (Block 2) Impressum. |
| K2 | Sperre: Online-Zahlung kann im Studio nur eingeschaltet sein, wenn K1-Pflichtfelder vollständig sind (neben Plattform-Schalter, Konto bereit, Steuerstatus). Fehlen sie bei bereits aktivem Studio → `booking_payment_options()` liefert `online_required=false` + Grund `LEGAL_PROFILE_MISSING`, Kurse fallen auf bisherigen Weg zurück; „Braucht deine Aufmerksamkeit“ zeigt es. (Block 2 erweitert die Sperre um AGB/Datenschutz.) |
| K3 | Preisgrenze 250,00 € brutto je Online-Zahlung (Grenze Kleinbetragsrechnung). Darüber kein Online-Checkout (`online_required=false`, Grund `AMOUNT_ABOVE_RECEIPT_LIMIT`). Kurs anlegen/ändern zeigt Hinweis. |
| K4 | Bestellknopf: Der Knopf, der die Zahlung auslöst, heißt genau „Zahlungspflichtig buchen“. Kein Betrag, kein Zusatz im Knopf. Der Betrag steht direkt darüber. Der Knopf davor in der Kursansicht (der nur den Platz reserviert) heißt „Weiter zur Buchung“, nicht „Anmelden und bezahlen“. |
| K5 | Pflichtangaben direkt über dem Bestellknopf (im Zahlungs-Sheet, ohne Scrollen sichtbar auf 360 px soweit möglich, sonst direkt über dem Knopf): Kurs, Datum + Uhrzeit, Dauer, Ort/Raum, Lehrende · Gesamtpreis „24,00 € inkl. 19 % USt“ bzw. „24,00 € · gemäß § 19 UStG ohne USt“ · Anbieter: Name, Ort (Link „Anbieterangaben“ öffnet volle Anschrift + Kontakt) · Abmelderegel: „Kostenlos abmelden bis Fr, 03.10., 18:00 – du bekommst den vollen Betrag zurück. Danach keine Erstattung.“ · Widerruf: „Für Kurse mit festem Termin besteht kein Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).“ · Link „AGB“ und „Datenschutz“ des Studios nur wenn vorhanden (Block 2), sonst weglassen. Keine Checkbox. |
| K6 | Bestätigungs-E-Mail = Vertragsbestätigung, ersetzt `payment_succeeded`. Inhalt: Betreff „Buchungsbestätigung: {Kurs} am {Datum}“ · Anbieter mit voller Anschrift + Kontakt-E-Mail · Leistung (Kurs, Datum, Uhrzeit, Dauer, Ort, Lehrende) · Preis wie K5 · Zahlungsart „Karte (online)“, Datum · Abmelderegel mit konkreter Frist · Widerrufs-Hinweis wie K5 · Belegnummer + Link zum Beleg · Link „Meine Anmeldungen“ · AGB des Studios als Volltext unten in der Mail, sobald Block 2 sie liefert (ein Link allein ist kein dauerhafter Datenträger). |
| K7 | Absender: Anzeigename „{Studioname} über Omlify“, Adresse bleibt `SENDER_EMAIL`, Reply-To = Kontakt-E-Mail des Studios (K1). Gilt für alle Mails an Teilnehmende, die einem Studio zugeordnet sind. |
| K8 | Beleg je erfolgreicher Online-Zahlung, im Namen des Studios, als Kleinbetragsrechnung: Überschrift „Beleg“, Belegnummer, Ausstellungsdatum (= Zahlungsdatum, Europe/Berlin), Verkäufer (K1, volle Anschrift), Leistung „Yogakurs ‚{Titel}‘ am {Datum} {Uhrzeit}“, Menge 1, Bruttobetrag, Steuer: regular → „enthält {19 % / 7 %} USt“, small_business → „gemäß § 19 UStG ohne USt“. Kein Käufername (nicht nötig bis 250 €). |
| K9 | Erstattungsbeleg je erfolgreicher Erstattung (`payment_refunds` → `succeeded`): „Erstattungsbeleg zu Beleg {Nr}“, eigene Nummer, Datum, erstatteter Betrag (negativ dargestellt „−10,00 €“), gleicher Steuertext wie der Originalbeleg, Grund-Satz wie in der Erstattungs-Mail. Link in der Erstattungs-Mail. |
| K10 | Belegnummer: je Studio fortlaufend, Format `{JJJJ}-{00001}` (Zähler je Studio und Jahr). Vergabe in derselben Transaktion, die die payments-Zeile bzw. den Erstattungs-Erfolg schreibt (Zeilensperre auf Zählerzeile). Lücken sollen nicht entstehen; falls doch (Rollback), ist das bei Kleinbetragsrechnungen unkritisch — aber Test dafür. |
| K11 | Beleg ist unveränderlich: Speicherung als Schnappschuss (Verkäufer, Steuerregime/-satz, Leistungstext, Betrag) zum Ausstellungszeitpunkt. Spätere Änderungen an Studio-Angaben oder Kurs ändern alte Belege nicht. Kein UPDATE/DELETE für App-Rollen. Anonymisierung einer Person entfernt den Namen der Person (falls gespeichert — wir speichern keinen Käufernamen im Beleg, nicht nötig bis 250 €). |
| K12 | Wer sieht Belege: Teilnehmende ihre eigenen (Meine Anmeldungen → „Beleg“), Owner/Admin alle des Studios (Zahlungen → Detail → „Beleg“). Lehrende nicht. Belege erscheinen im bestehenden CSV-Export als Spalte „Belegnummer“. |
| K13 | Format: druckfreundliche HTML-Seite in der App (`/receipts/:id`, Druck-CSS, „Drucken / als PDF speichern“). Kein PDF-Server in dieser Story. Mail enthält die Belegdaten im Text + Link. |
| K14 | Nur Online-Zahlungen bekommen automatisch Belege. Bar/PayPal/Überweisung/Karten-Verkauf: unverändert (offener Punkt, später). |

Hinweis

K8 war in der Story-Quelle am Zeilenende abgeschnitten („enthält {19“). Der Steuertext folgt K5: regular mit Satz, small_business nach § 19 UStG.
