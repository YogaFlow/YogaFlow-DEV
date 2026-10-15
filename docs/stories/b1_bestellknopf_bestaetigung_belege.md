Story B1 — Studio-Angaben, Bestellknopf, Bestätigungs-E-Mail, Belege

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Startet nach UX-1 (HEAD nach UX-1 oder neuer). Als docs/stories/b1_bestellknopf_bestaetigung_belege.md ablegen und committen. Grundlage: Entscheidung 12 unten (als docs/entscheidungen/12_Kaufprozess_Rechtliches.md ablegen, eigener Doku-Commit), docs/DESIGNSYSTEM.md, Entscheidungen 09–11. Rechtliche Einordnung von Claude, nicht anwaltlich geprüft (bewusste Entscheidung von Julius). Texte genau so übernehmen; Abweichungen → Haltestelle 1.

Warum

Ein Online-Kauf mit Verbrauchern braucht (1) vor dem Kauf die Pflichtangaben und einen eindeutig beschrifteten Knopf (§ 312j BGB — sonst kommt kein wirksamer Vertrag zustande), (2) danach eine Bestätigung auf dauerhaftem Datenträger (§ 312f BGB) und (3) einen Beleg im Namen des Studios (§ 33 UStDV). Verkäufer ist immer das Studio, Omlify ist nur die Technik.

Ist-Zustand (von Claude auf DEV gelesen, 04.10.)
tenants hat keine Anschrift, keine Kontakt-E-Mail → für Beleg/Bestätigung fehlt der Verkäufer. Teil A schafft das.
tenant_tax_settings(regime ∈ regular|small_business, vat_rate_bp ∈ 1900|700|0, valid_from) existiert.
payment_succeeded-Mail (dispatch-emails/handler.ts) sagt nur „Zahlung eingegangen“, ohne Anbieter, Stornoregel, AGB.
send-email sendet mit Absender "Omlify" <SENDER_EMAIL>, kein Reply-To.
Kein Beleg, keine Belegnummer.
Entscheidung 12 — Kaufprozess & Rechtliches (gilt)
#	Entscheidung
K1	Studio-Angaben (neu, je Studio, Owner pflegt unter Einstellungen → Rechtliches): Anbietername (Studio bzw. Inhaber:in, z. B. „Yoga Mitte · Anna Beispiel“), Straße + Nr., PLZ, Ort, Land (Standard DE), Kontakt-E-Mail, Telefon (optional), Steuernummer oder USt-IdNr. (optional, nur Anzeige im Impressum später). Diese Angaben sind die Quelle für Bestätigung, Beleg und (Block 2) Impressum.
K2	Sperre: Online-Zahlung kann im Studio nur eingeschaltet sein, wenn K1-Pflichtfelder vollständig sind (neben Plattform-Schalter, Konto bereit, Steuerstatus). Fehlen sie bei bereits aktivem Studio → booking_payment_options() liefert online_required=false + Grund LEGAL_PROFILE_MISSING, Kurse fallen auf bisherigen Weg zurück; „Braucht deine Aufmerksamkeit“ zeigt es. (Block 2 erweitert die Sperre um AGB/Datenschutz.)
K3	Preisgrenze 250,00 € brutto je Online-Zahlung (Grenze Kleinbetragsrechnung). Darüber kein Online-Checkout (online_required=false, Grund AMOUNT_ABOVE_RECEIPT_LIMIT). Kurs anlegen/ändern zeigt Hinweis.
K4	Bestellknopf: Der Knopf, der die Zahlung auslöst, heißt genau „Zahlungspflichtig buchen“. Kein Betrag, kein Zusatz im Knopf. Der Betrag steht direkt darüber. Der Knopf davor in der Kursansicht (der nur den Platz reserviert) heißt „Weiter zur Buchung“, nicht „Anmelden und bezahlen“.
K5	Pflichtangaben direkt über dem Bestellknopf (im Zahlungs-Sheet, ohne Scrollen sichtbar auf 360 px soweit möglich, sonst direkt über dem Knopf): Kurs, Datum + Uhrzeit, Dauer, Ort/Raum, Lehrende · Gesamtpreis „24,00 € inkl. 19 % USt“ bzw. „24,00 € · gemäß § 19 UStG ohne USt“ · Anbieter: Name, Ort (Link „Anbieterangaben“ öffnet volle Anschrift + Kontakt) · Abmelderegel: „Kostenlos abmelden bis Fr, 03.10., 18:00 – du bekommst den vollen Betrag zurück. Danach keine Erstattung.“ · Widerruf: „Für Kurse mit festem Termin besteht kein Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).“ · Link „AGB“ und „Datenschutz“ des Studios nur wenn vorhanden (Block 2), sonst weglassen. Keine Checkbox.
K6	Bestätigungs-E-Mail = Vertragsbestätigung, ersetzt payment_succeeded. Inhalt: Betreff „Buchungsbestätigung: {Kurs} am {Datum}“ · Anbieter mit voller Anschrift + Kontakt-E-Mail · Leistung (Kurs, Datum, Uhrzeit, Dauer, Ort, Lehrende) · Preis wie K5 · Zahlungsart „Karte (online)“, Datum · Abmelderegel mit konkreter Frist · Widerrufs-Hinweis wie K5 · Belegnummer + Link zum Beleg · Link „Meine Anmeldungen“ · AGB des Studios als Volltext unten in der Mail, sobald Block 2 sie liefert (ein Link allein ist kein dauerhafter Datenträger).
K7	Absender: Anzeigename „{Studioname} über Omlify“, Adresse bleibt SENDER_EMAIL, Reply-To = Kontakt-E-Mail des Studios (K1). Gilt für alle Mails an Teilnehmende, die einem Studio zugeordnet sind.
K8	Beleg je erfolgreicher Online-Zahlung, im Namen des Studios, als Kleinbetragsrechnung: Überschrift „Beleg“, Belegnummer, Ausstellungsdatum (= Zahlungsdatum, Europe/Berlin), Verkäufer (K1, volle Anschrift), Leistung „Yogakurs ‚{Titel}‘ am {Datum} {Uhrzeit}“, Menge 1, Bruttobetrag, Steuer: regular → „enthält {19
K9	Erstattungsbeleg je erfolgreicher Erstattung (payment_refunds → succeeded): „Erstattungsbeleg zu Beleg {Nr}“, eigene Nummer, Datum, erstatteter Betrag (negativ dargestellt „−10,00 €“), gleicher Steuertext wie der Originalbeleg, Grund-Satz wie in der Erstattungs-Mail. Link in der Erstattungs-Mail.
K10	Belegnummer: je Studio fortlaufend, Format {JJJJ}-{00001} (Zähler je Studio und Jahr). Vergabe in derselben Transaktion, die die payments-Zeile bzw. den Erstattungs-Erfolg schreibt (Zeilensperre auf Zählerzeile). Lücken sollen nicht entstehen; falls doch (Rollback), ist das bei Kleinbetragsrechnungen unkritisch — aber Test dafür.
K11	Beleg ist unveränderlich: Speicherung als Schnappschuss (Verkäufer, Steuerregime/-satz, Leistungstext, Betrag) zum Ausstellungszeitpunkt. Spätere Änderungen an Studio-Angaben oder Kurs ändern alte Belege nicht. Kein UPDATE/DELETE für App-Rollen. Anonymisierung einer Person entfernt den Namen der Person (falls gespeichert — wir speichern keinen Käufernamen im Beleg, nicht nötig bis 250 €).
K12	Wer sieht Belege: Teilnehmende ihre eigenen (Meine Anmeldungen → „Beleg“), Owner/Admin alle des Studios (Zahlungen → Detail → „Beleg“). Lehrende nicht. Belege erscheinen im bestehenden CSV-Export als Spalte „Belegnummer“.
K13	Format: druckfreundliche HTML-Seite in der App (/receipts/:id, Druck-CSS, „Drucken / als PDF speichern“). Kein PDF-Server in dieser Story. Mail enthält die Belegdaten im Text + Link.
K14	Nur Online-Zahlungen bekommen automatisch Belege. Bar/PayPal/Überweisung/Karten-Verkauf: unverändert (offener Punkt, später).
Umfang
Teil A — Studio-Angaben (K1, K2, K3)
Tabelle tenant_legal_profiles (1:1 zu tenants): Felder aus K1, updated_by, updated_at. RLS: lesen alle Mitglieder des Studios + öffentlich nur die Felder, die für Anzeige im Kaufprozess nötig sind (über Lese-RPC, nicht über breite Policy); schreiben nur Owner. Validierung serverseitig (PLZ DE 5 Ziffern wenn Land DE, E-Mail-Format, Pflichtfelder nicht leer, Längen).
RPC get_studio_provider_info() (im Studio-Kontext, auch für Teilnehmende): Name, Anschrift, Kontakt-E-Mail, Telefon.
booking_payment_options() erweitern um K2/K3 (Rückgabe zusätzlich reason). Bestehende Aufrufer nicht brechen.
Einstellungen → Rechtliches → „Anbieterangaben“ (Formular nach Muster UX-1). „Braucht deine Aufmerksamkeit“: „Anbieterangaben fehlen – ohne sie ist keine Online-Zahlung möglich.“
Kurs anlegen/ändern: bei Preis > 250,00 € und aktiver Online-Zahlung Hinweis „Über 250,00 € ist keine Online-Zahlung möglich – Teilnehmende zahlen vor Ort.“
Teil B — Bestellknopf (K4, K5)
Kursansicht: Knopf „Weiter zur Buchung“ bei Online-Pflicht.
Zahlungs-Sheet: Block „Deine Buchung“ mit K5-Inhalten über dem Payment Element bzw. direkt über dem Knopf; Knopf „Zahlungspflichtig buchen“. Bestehende Logik (prepare/confirm, Retry L2, Hold-Ablauf) unverändert.
Texte zentral (eine Datei), Unit-Tests für alle Varianten (regular 19/7, small_business, Frist vorhanden/Frist schon vorbei → dann Satz „Eine kostenlose Abmeldung ist nicht mehr möglich.“).
Teil C — Belege (K8–K14)
Tabellen receipt_counters(tenant_id, year, last_no) und receipts(id, tenant_id, number, kind receipt|refund_receipt, payment_id, refund_id null, original_receipt_id null, issued_at, amount_cents, snapshot jsonb, created_at). Unique (tenant_id, number), unique (payment_id) where kind='receipt', unique (refund_id) where kind='refund_receipt'. RLS nach K12, keine UPDATE/DELETE-Rechte für authenticated.
Ausstellen idempotent in der Server-Logik, die heute die Online-Zahlung als erfolgreich bucht bzw. eine Erstattung auf succeeded setzt (Webhook-Pfad und Job-Pfad — beide!). Doppelte Webhooks → genau ein Beleg.
Backfill: bestehende erfolgreiche Online-Zahlungen auf DEV bekommen keine rückwirkenden Belege (Testdaten). Für PROD gibt es noch keine Online-Zahlungen → kein Backfill nötig; im Release-Plan vermerken.
Lese-RPC get_receipt(id) mit Rechteprüfung K12; Seite /receipts/:id (Druck-CSS, 360/1280).
Links: Meine Anmeldungen (eigene Buchung) und Zahlungen-Detail (Owner/Admin). CSV-Export: Spalte „Belegnummer“.
Teil D — Bestätigungs- und Erstattungs-Mail (K6, K7, K9)
dispatch-emails: payment_succeeded → Vertragsbestätigung nach K6 (Kontext um Studio-Angaben, Belegnummer/-link, Frist, Dauer, Ort, Lehrende, Steuertext erweitern). Gate: ohne Beleg noch nicht senden (Delivery zurückgeben ohne Zählen, kurzer Wiederversuch) — Reihenfolge-Rennen absichern.
payment_refunded + Link zum Erstattungsbeleg.
send-email: optionale Felder fromName, replyTo (validiert); dispatch-emails setzt sie nach K7. Kein Logging von Adressen (Maskierer bleibt).
AGB-Platzhalter: Abschnitt „Allgemeine Geschäftsbedingungen“ wird nur gerendert, wenn das Studio AGB-Text hat (Feld kommt in Block 2; jetzt Schnittstelle vorbereiten, kein Feld anlegen).
Akzeptanz / Tests
SQL/RPC: Rechte (Owner schreibt, Admin/Lehrende/Teilnehmende nicht; fremdes Studio nie), Validierung, booking_payment_options mit fehlenden Angaben → LEGAL_PROFILE_MISSING; Preis 250,01 € → AMOUNT_ABOVE_RECEIPT_LIMIT, 250,00 € → online möglich.
Belege: Nummern fortlaufend je Studio und Jahr; zwei Studios zählen getrennt; paralleles Ausstellen (2 gleichzeitige Zahlungen) → keine doppelte Nummer; doppelter Webhook → ein Beleg; Teilerstattung 10 € + Rest 14 € → zwei Erstattungsbelege mit Bezug auf Original; Studio-Anschrift ändern → alter Beleg unverändert; Teilnehmende sieht fremden Beleg nicht (auch nicht per ID).
Unit: Texte K5/K6/K8/K9 je Steuerregime; Datum/Frist in Europe/Berlin.
E2E (Playwright, DEV): (1) Kurs ohne Anbieterangaben → kein Online-Checkout, Aufmerksamkeits-Kasten; Angaben ausfüllen → Online-Checkout da; (2) Buchen mit 4242…: Sheet zeigt K5-Angaben, Knopf heißt exakt „Zahlungspflichtig buchen“ → Erfolg → Meine Anmeldungen → Beleg öffnen, Nummer + § 19-Satz bzw. USt-Satz sichtbar; (3) Owner erstattet 10 € → Erstattungsbeleg in Zahlungen-Detail.
Mail: DEV-Delivery sent für Bestätigung mit Reply-To; Inhalt per Unit-Test geprüft (kein echter Posteingang nötig).
Screenshots 360/1280 (Sheet, Beleg, Einstellungen Anbieterangaben) nach docs/screenshots/b1/ (nicht committen).
DoD laut Regeldatei, STAND.md, Bericht docs/berichte/b1_bestellknopf_belege.md. Logik- und Gestaltungs-Commits getrennt. Release-Plan um neue Migrationen/Function-Änderungen ergänzen.
Haltestellen
Haltestelle 1, wenn: der Erfolgs-Pfad der Zahlung an mehr als den zwei bekannten Stellen (Webhook, Job) gebucht wird; booking_payment_options von Stellen genutzt wird, die bei neuem reason brechen; Testkundin auf DEV betroffen wäre.
Haltestelle 4: Migration ändert Nicht-Testdaten (z. B. Default-Anbieterangaben für echte Studios) → nicht automatisch befüllen, Studios füllen selbst.
Am Ende Haltestelle 5 (Klicktest), Klickliste max. 10 Punkte, darunter eine echte Mail an Julius (Bestätigung + Beleg ansehen).