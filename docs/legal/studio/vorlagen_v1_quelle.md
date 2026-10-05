Vorlagen Studio-Rechtstexte — Version 1 (Claude, 05.10.2026)

Für Cursor (Story RT-1): je Abschnitt eine Datei docs/legal/studio/impressum.v1.md, agb.v1.md, datenschutz.v1.md — Wortlaut nicht ändern. Unklare Stellen → Haltestelle, nicht selbst formulieren. Rechtliche Einordnung von Claude, nicht anwaltlich geprüft. Zielbild: vorsichtige, kurze, verständliche Texte, die genau zu dem passen, was Omlify technisch tut. Vor breitem Rollout fachlich prüfen lassen.

Platzhalter
Platzhalter	Quelle
{{studio_name}}	Anzeigename des Studios
{{legal_name}}	Anbieterangaben: Name/Firma
{{legal_form_label}}	Rechtsform (Klartext); bei Einzelunternehmen leer
{{representatives}}	Vertretungsberechtigte (nicht bei Einzelunternehmen)
{{street}} {{house_number}}, {{postal_code}} {{city}}, {{country}}	Anbieterangaben
{{contact_email}}, {{phone}}	Anbieterangaben (Telefon optional)
{{register_court}}, {{register_number}}	optional
{{vat_id}}, {{economic_id}}	optional
{{studio_url}}	https://{subdomain}.omlify.de bzw. eigene Domain
{{cancellation_hours}}	Stornofrist in Stunden, als Text „24 Stunden“ (1 → „1 Stunde“)
{{tax_small_business}}	true = § 19 UStG
{{pay_online}}, {{pay_onsite}}	Zahlungswege (Entscheidung 14)
{{passes_any}}	Studio hat irgendein Kartenprodukt
{{passes_online}}	mind. ein Kartenprodukt online kaufbar
{{extra_rules}}	Freitext „Weitere Regeln“ (escaped), sonst Abschnitt weglassen
{{stand_date}}	Datum der Fassung, „5. Oktober 2026“
{{subprocessors_list}}	gleiche Quelle wie AVV-Anlage (Name, Zweck, Ort, Garantie)
{{health_notes}}	nur falls Teil 0 ein Freitextfeld findet, in dem Gesundheitsangaben landen können

Bedingungen: {{#if x}}…{{/if}}, {{#unless x}}…{{/unless}}. Einbindung der bestehenden Widerrufsbelehrung aus K1: {{> widerrufsbelehrung_karten}} (eine Quelle, kein Duplikat).

1 · Impressum (impressum.v1.md)
markdown
# Impressum

**Angaben gemäß § 5 DDG**

{{legal_name}}{{#if legal_form_label}} ({{legal_form_label}}){{/if}}
{{street}} {{house_number}}
{{postal_code}} {{city}}
{{country}}

{{#if representatives}}**Vertreten durch:** {{representatives}}
{{/if}}
**Kontakt**
E-Mail: {{contact_email}}
{{#if phone}}Telefon: {{phone}}
{{/if}}
{{#if register_number}}**Registereintrag**
{{register_court}}, {{register_number}}
{{/if}}
{{#if vat_id}}**Umsatzsteuer-Identifikationsnummer** gemäß § 27a UStG: {{vat_id}}
{{/if}}
{{#if economic_id}}**Wirtschafts-Identifikationsnummer:** {{economic_id}}
{{/if}}
**Verbraucherstreitbeilegung**
Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.

---
Diese Seite wird technisch bereitgestellt von Omlify. Anbieter der Kurse und Inhalte ist {{legal_name}}.

Stand: {{stand_date}}
2 · AGB (agb.v1.md)
markdown
# Allgemeine Geschäftsbedingungen von {{studio_name}}

Stand: {{stand_date}}

## 1. Geltungsbereich und Anbieter
1. Diese AGB gelten für alle Buchungen von Kursen, Workshops und sonstigen Terminen{{#if passes_any}} sowie für den Kauf von Mehrfachkarten{{/if}} über die Buchungsseite {{studio_url}}.
2. Vertragspartner ist {{legal_name}}, {{street}} {{house_number}}, {{postal_code}} {{city}} (im Folgenden „wir“). Die Buchungsseite wird technisch von Omlify betrieben; Omlify wird nicht Vertragspartner.
3. Abweichende Bedingungen der Teilnehmenden gelten nicht.

## 2. Leistungen
1. Inhalt, Ort, Datum, Uhrzeit, Dauer und Preis eines Termins ergeben sich aus der Beschreibung auf der Buchungsseite zum Zeitpunkt der Buchung.
2. Wir dürfen die Lehrkraft aus wichtigem Grund (z. B. Krankheit) durch eine andere qualifizierte Lehrkraft ersetzen. Das berechtigt nicht zur Minderung.

## 3. Kundenkonto
Für eine Buchung brauchst du ein Konto. Deine Zugangsdaten hältst du geheim. Die Angaben im Konto müssen stimmen, insbesondere deine E-Mail-Adresse, an die wir Bestätigungen schicken.

## 4. Vertragsschluss
1. Die Darstellung der Termine{{#if passes_any}} und Karten{{/if}} ist noch kein verbindliches Angebot.
2. Mit Klick auf **„Zahlungspflichtig buchen“**{{#if passes_online}} bzw. **„Zahlungspflichtig kaufen“**{{/if}} gibst du ein verbindliches Angebot ab. Der Vertrag kommt zustande, wenn die Buchung auf der Seite bestätigt wird. Bei Online-Zahlung kommt er erst mit erfolgreicher Zahlung zustande. Die Bestätigung mit diesen AGB erhältst du zusätzlich per E-Mail.
3. **Warteliste:** Der Eintrag auf die Warteliste ist noch kein Vertrag. Wird ein Platz frei, rücken Personen in der Reihenfolge der Warteliste nach.{{#if pay_online}} Ist für den Termin eine Online-Zahlung nötig, halten wir den Platz bis zu der in der Benachrichtigung genannten Frist (höchstens 12 Stunden und spätestens bis 2 Stunden vor Beginn). Zahlst du bis dahin nicht, verfällt der Platz ohne Kosten für dich.{{/if}}

## 5. Preise und Zahlung
1. Alle Preise sind Endpreise. {{#if tax_small_business}}Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.{{/if}}{{#unless tax_small_business}}Sie enthalten die gesetzliche Umsatzsteuer.{{/unless}}
{{#if pay_online}}2. **Online-Zahlung:** Du zahlst bei der Buchung über unseren Zahlungsdienstleister Stripe (z. B. Kreditkarte, Apple Pay, Google Pay). Der Betrag ist sofort fällig. Du erhältst einen Beleg per E-Mail.
{{/if}}{{#if pay_onsite}}3. **Zahlung vor Ort:** Der Preis ist spätestens zu Beginn des Termins im Studio fällig.
{{/if}}{{#if passes_any}}4. **Mehrfachkarte:** Bei einer Buchung mit Karte wird ein Termin von deiner Karte abgebucht; es entsteht keine weitere Zahlungspflicht.
{{/if}}

## 6. Abmeldung durch dich
1. Du kannst dich bis **{{cancellation_hours}} vor Beginn** eines Termins kostenlos abmelden (in deinem Konto unter „Meine Anmeldungen“).
   - Online bezahlt: Du bekommst den vollen Betrag auf das ursprüngliche Zahlungsmittel zurück.
   {{#if passes_any}}- Mit Karte gebucht: Der Termin wird deiner Karte wieder gutgeschrieben.{{/if}}
   {{#if pay_onsite}}- Vor Ort zu zahlen: Es fällt nichts an.{{/if}}
2. Bei einer späteren Abmeldung oder wenn du nicht erscheinst, behalten wir den Anspruch auf den Preis: Ein online gezahlter Betrag wird nicht erstattet{{#if passes_any}}, ein mit Karte gebuchter Termin gilt als genutzt{{/if}}{{#if pay_onsite}}, ein vor Ort zu zahlender Preis bleibt geschuldet{{/if}}. Dir bleibt der Nachweis offen, dass uns kein oder ein geringerer Schaden entstanden ist.
3. Das gesetzliche Recht zur Kündigung aus wichtigem Grund bleibt unberührt.

## 7. Absage und Änderungen durch uns
1. Wir dürfen einen Termin absagen, z. B. bei Krankheit der Lehrkraft, zu wenigen Anmeldungen oder höherer Gewalt. Wir informieren dich so früh wie möglich per E-Mail.
2. Bei einer Absage durch uns erhältst du den vollen online gezahlten Betrag zurück{{#if passes_any}} bzw. den Termin auf deine Karte{{/if}}. Weitergehende Ansprüche bestehen nur nach Ziffer 11.
3. Wir dürfen dich aus wichtigem Grund (z. B. wiederholte grobe Störung) von künftigen Terminen abmelden. Bereits bezahlte künftige Termine erstatten wir dann voll.

{{#if passes_any}}## 8. Mehrfachkarten
1. Eine Karte enthält die beim Kauf angegebene Zahl an Terminen und ist für die beim Kauf angegebene Dauer gültig. Sie gilt für alle Termine, die auf der Buchungsseite als „mit Karte buchbar“ gekennzeichnet sind; ein Termin entspricht einer Einheit.
2. Die Karte ist persönlich und nicht übertragbar.
3. Nicht genutzte Termine verfallen mit Ablauf der Gültigkeit. Wir erinnern dich 30 und 7 Tage vorher per E-Mail. Eine Verlängerung im Einzelfall liegt in unserem Ermessen.
4. Eine Auszahlung nicht genutzter Termine ist ausgeschlossen, soweit nicht ein Widerruf (Ziffer 9) oder eine Absage durch uns vorliegt. Erstatten wir aus Kulanz einen Teil des Preises, werden die restlichen Termine der Karte entwertet.
{{#if pay_onsite}}5. Karten, die im Studio gekauft werden, bezahlst du vor Ort.{{/if}}
{{/if}}

## 9. Widerrufsrecht
1. Für die Buchung **einzelner Termine** besteht kein Widerrufsrecht, weil es sich um Freizeitdienstleistungen mit festem Termin handelt (§ 312g Abs. 2 Nr. 9 BGB). Die kostenlose Abmeldung nach Ziffer 6 gilt unabhängig davon.
{{#if passes_online}}2. Beim **Online-Kauf einer Mehrfachkarte** steht dir als Verbraucherin oder Verbraucher ein Widerrufsrecht zu:

{{> widerrufsbelehrung_karten}}
{{/if}}

## 10. Gesundheit und Teilnahme
1. Du entscheidest selbst, ob deine körperliche Verfassung die Teilnahme erlaubt. Bei Beschwerden, Verletzungen, Schwangerschaft oder Unsicherheit sprich bitte vorher mit einer Ärztin oder einem Arzt.
2. Informiere die Lehrkraft vor Beginn über Einschränkungen, die für die Übungen wichtig sind, und folge ihren Anweisungen. Übungen, die sich nicht gut anfühlen, darfst du jederzeit abbrechen.
3. Yoga ersetzt keine ärztliche oder therapeutische Behandlung.

## 11. Haftung
1. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.
2. Bei leichter Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen Vertragspflicht (einer Pflicht, deren Erfüllung die Durchführung des Vertrags erst ermöglicht und auf die du vertrauen darfst), begrenzt auf den vorhersehbaren, typischen Schaden.
3. Für mitgebrachte Gegenstände haften wir nur nach Absatz 1 und 2.

{{#if extra_rules}}## 12. Weitere Regeln von {{studio_name}}
{{extra_rules}}
{{/if}}

## {{#if extra_rules}}13{{/if}}{{#unless extra_rules}}12{{/unless}}. Streitbeilegung und Schlussbestimmungen
1. Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
2. Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Bist du Verbraucherin oder Verbraucher, bleiben zwingende Schutzvorschriften des Staates, in dem du lebst, unberührt.
3. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.

Hinweis für Cursor: Abschnittsnummern automatisch zählen lassen (Renderer nummeriert ## -Überschriften), die {{#if extra_rules}}13…-Konstruktion oben ist nur zur Lesbarkeit; Ziffern in Querverweisen („Ziffer 6/9/11“) müssen nach dem Rendern stimmen → Unit-Test. Ist Abschnitt 8 ausgeblendet, verschieben sich die Nummern — dann Querverweise per Anker statt fester Zahl.

3 · Datenschutzerklärung (datenschutz.v1.md)
markdown
# Datenschutzerklärung von {{studio_name}}

Stand: {{stand_date}}

## 1. Wer ist verantwortlich?
{{legal_name}}, {{street}} {{house_number}}, {{postal_code}} {{city}}, E-Mail: {{contact_email}}{{#if phone}}, Telefon: {{phone}}{{/if}}.
Wir haben keine Datenschutzbeauftragte bzw. keinen Datenschutzbeauftragten, weil wir dazu nicht verpflichtet sind. Bei Fragen schreib uns an die oben genannte E-Mail-Adresse.

## 2. Überblick
Wir verarbeiten deine Daten, um Buchungen{{#if passes_any}}, Kartenkäufe{{/if}} und Zahlungen abzuwickeln und dich darüber zu informieren. Wir verkaufen keine Daten, nutzen keine Werbe-Tracker und erstellen keine Profile.

## 3. Aufruf der Buchungsseite
Beim Aufruf verarbeitet der Server technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser-Informationen), um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Diese Protokolle werden nur so lange gespeichert, wie es für Sicherheit und Fehlersuche nötig ist, und danach automatisch gelöscht.

## 4. Speicherung im Browser
Wir speichern im Browser nur, was für die Funktion nötig ist (z. B. dass du angemeldet bist, deine Spracheinstellung). Das ist ohne Einwilligung zulässig (§ 25 Abs. 2 Nr. 2 TDDDG). Wir setzen keine Analyse- oder Werbe-Cookies.

## 5. Kundenkonto und Buchungen
Für Konto und Buchungen verarbeiten wir: Name, E-Mail-Adresse, gegebenenfalls Telefonnummer, deine Buchungen und Abmeldungen, Wartelisten-Einträge{{#if passes_any}}, deine Karten und deren Verlauf{{/if}} sowie die von dir gewählte Zahlungsart. Rechtsgrundlage ist die Durchführung des Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Lehrkräfte sehen die Teilnehmendenliste ihrer Termine.
{{#if health_notes}}
Angaben zu gesundheitlichen Einschränkungen machst du **freiwillig**. Wir nutzen sie nur, damit die Lehrkraft im Kurs darauf Rücksicht nehmen kann. Rechtsgrundlage ist deine ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die du jederzeit widerrufen kannst, indem du die Angabe löschst oder uns schreibst.
{{/if}}

## 6. E-Mails
Wir schicken dir E-Mails, die zur Buchung gehören: Bestätigungen, Belege, Änderungen und Absagen, Wartelisten-Benachrichtigungen{{#if passes_any}}, Hinweise zu deiner Karte (z. B. bevor sie abläuft){{/if}}. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Werbung schicken wir dir über diese Buchungsseite nicht.

{{#if pay_online}}## 7. Online-Zahlung
1. Online-Zahlungen wickelt **Stripe Payments Europe, Limited**, 1 Grand Canal Street Lower, Dublin 2, Irland („Stripe“) ab. Stripe erhält dazu die für die Zahlung nötigen Daten (z. B. Betrag, Kartendaten bzw. Daten der Wallet wie Apple Pay oder Google Pay, E-Mail-Adresse, IP-Adresse). Deine vollständigen Kartendaten sehen wir nicht.
2. Rechtsgrundlage ist die Durchführung des Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Stripe verarbeitet Daten zur Betrugsverhinderung und zur Erfüllung eigener gesetzlicher Pflichten (z. B. Geldwäscheprävention) als **eigener Verantwortlicher**; dafür gilt die Datenschutzerklärung von Stripe: https://stripe.com/de/privacy. Dabei können Daten in die USA übermittelt werden; Stripe stützt sich auf das EU-US Data Privacy Framework bzw. Standardvertragsklauseln.
3. Nutzt du Apple Pay oder Google Pay, gelten zusätzlich die Datenschutzbestimmungen von Apple bzw. Google.
{{/if}}

## 8. Belege, Buchhaltung und Nachweise
1. Zu jeder Online-Zahlung und Erstattung erstellen wir einen Beleg. Belege und Buchungsunterlagen müssen wir aufbewahren (Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO): Buchungsbelege **8 Jahre**, geschäftliche Korrespondenz **6 Jahre**, jeweils ab Ende des Kalenderjahres.
{{#if passes_online}}2. Beim Online-Kauf einer Karte speichern wir, dass und wann du der sofortigen Nutzung zugestimmt hast, sowie einen Widerruf mit Zeitpunkt. Das dient dem Nachweis unserer gesetzlichen Pflichten (Art. 6 Abs. 1 lit. c und f DSGVO).{{/if}}

## 9. Wer deine Daten außerdem erhält
1. Die Buchungsseite wird von **Omlify** als technischem Dienstleister betrieben. Omlify verarbeitet deine Daten nur in unserem Auftrag und nach unserer Weisung (Auftragsverarbeitung nach Art. 28 DSGVO).
2. Omlify setzt dafür folgende Unterauftragsverarbeiter ein:

{{subprocessors_list}}

3. Werden Daten in ein Land außerhalb der EU/des EWR übermittelt, geschieht das nur auf Grundlage eines Angemessenheitsbeschlusses (z. B. EU-US Data Privacy Framework) oder von EU-Standardvertragsklauseln.
4. Darüber hinaus geben wir Daten nur weiter, wenn wir gesetzlich dazu verpflichtet sind (z. B. an Finanzbehörden).

## 10. Wie lange wir Daten speichern
Kontodaten speichern wir, bis du dein Konto löschst oder uns um Löschung bittest. Buchungsdaten speichern wir, solange sie für den Vertrag und mögliche Ansprüche nötig sind (in der Regel bis zum Ende der gesetzlichen Verjährung von drei Jahren ab Jahresende). Für Belege gelten die Fristen aus Ziffer 8; bis dahin werden diese Daten gesperrt statt gelöscht.

## 11. Deine Rechte
Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und **Widerspruch** gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine erteilte Einwilligung kannst du jederzeit für die Zukunft widerrufen. Schreib uns dazu an {{contact_email}}.

## 12. Beschwerderecht
Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere in dem Bundesland, in dem du lebst oder in dem wir unseren Sitz haben.

## 13. Pflicht zur Angabe
Ohne Name und E-Mail-Adresse können wir keine Buchung annehmen. Weitere Angaben sind freiwillig.

## 14. Keine automatisierten Entscheidungen
Wir treffen keine Entscheidungen, die ausschließlich auf automatisierter Verarbeitung beruhen und dir gegenüber rechtliche Wirkung entfalten.

Hinweise für Cursor: (1) Omlify wird bewusst ohne Anschrift genannt — Art. 13 DSGVO verlangt nur Empfänger bzw. Kategorien; so steht Julius' Privatanschrift nicht in jeder Studio-Datenschutzerklärung. (2) subprocessors_list als Liste „Name — Zweck — Ort/Sitz — Garantie“ aus derselben Quelle wie AVV-Anlage 2; Abweichung zwischen AVV und Liste = Testfehler. (3) Findet Teil 0 Analytics, Fremd-Schriften o. ä. auf Studio-Seiten: Haltestelle, nicht Text anpassen — entweder Dienst entfernen oder Claude ergänzt die Vorlage. (4) Abschnittsnummern automatisch (siehe AGB-Hinweis).