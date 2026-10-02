Ziel

Teilnehmende wissen vor dem Abmelden, ob sie Geld zurückbekommen, und sehen danach den Stand der Erstattung. Owner/Admin können online bezahlte Beträge erstatten (voll/teilweise) und sehen bei Absage/Abmeldung/Entfernen, was erstattet wird.

Umfang
A. Teilnehmende
Abmelde-Dialog bei online bezahlter Buchung (Daten: cancellation_deadline, Betrag, bereits erstattet):
vor Frist: „Du bekommst 24,00 € zurück. Kostenlos abmelden bis Fr, 03.10., 18:00.“
nach Frist: „Die Abmeldefrist ist seit Fr, 03.10., 18:00 vorbei. Die 24,00 € werden nicht erstattet.“ Knopf weiter „Abmelden“ (danger).
nach Erfolg (aus refund_cents der Antwort): „Abgemeldet. 24,00 € werden erstattet – je nach Bank dauert das einige Werktage.“ Bei 0: „Abgemeldet.“
Kursdetail / Meine Anmeldungen, online bezahlte Buchung: Zeile „Online bezahlt · kostenlos abmelden bis …“ bzw. „Online bezahlt · Abmeldefrist vorbei“ (Muster wie bei Karten aus A6).
Erstattungsstand bei abgemeldeten/abgesagten Buchungen in Meine Anmeldungen (Bereich, in dem vergangene/stornierte Buchungen erscheinen; gibt es keinen → kleinste sinnvolle Lösung vorschlagen und begründen):
„Erstattung läuft · 24,00 €“
„Erstattet · 24,00 €“
„Teilweise erstattet · 10,00 € von 24,00 €“
fehlgeschlagen: „Erstattung verzögert sich – das Studio ist informiert.“ (keine Fehlerfarbe) Status nicht nur über Farbe (Text + Icon).
B. Owner / Admin
Erstatten-Dialog an jeder Stripe-Kartenzahlung mit Rest > 0 (Kasse, Teilnehmerliste, Personenverwaltung — dort, wo Zahlungen heute angezeigt werden). Nur Owner/Admin sehen den Knopf.
Felder: Betrag (vorbelegt mit Rest, max. Rest, Komma-Eingabe „10,00“), Grund (Pflicht, max. 200 Zeichen, Hinweis „nur für das Studio sichtbar“).
Zusammenfassung vor dem Bestätigen: „10,00 € an {Vorname} erstatten. Danach noch erstattbar: 14,00 €. Stripe erstattet seine Gebühr für die Zahlung nicht.“
Fehlercodes verständlich (AMOUNT_EXCEEDS_REMAINING, NOTHING_TO_REFUND, FORBIDDEN).
Liste der Erstattungen an der Zahlung: Datum, Betrag, Grund-Art (Kursabsage, Abmeldung, Studio, Entfernt, Spätzahlung, Manuell, Stripe-Dashboard), Status, Notiz (nur Owner/Admin).
Kursabsage-Dialog: vorher „3 haben online bezahlt. 72,00 € werden automatisch erstattet.“ (3 × 24,00 €); nachher aus refund_cents.
Studio meldet ab: „Die Online-Zahlung über 24,00 € wird automatisch erstattet.“
Person entfernen: „2 künftige online bezahlte Buchungen (48,00 €) werden erstattet.“
Rückbuchung offen (Dispute): Hinweis an der Zahlung („Rückbuchung offen – bitte im Stripe-Dashboard beantworten“), Glocke führt dorthin.
C. Daten

Wo eine Lese-RPC fehlt (z. B. Vorschau „wie viel würde erstattet“ für Dialoge 5–7, Erstattungsstand je Buchung für Teilnehmende), kleinste Ergänzung bauen. Vorschau-RPCs nur lesend, gleiche Logik wie der Auslöser (eine Quelle, nicht nachbauen).

Akzeptanz / Tests
Unit-Tests für Texte und Beträge (Frist vor/nach, voll/teil, fehlgeschlagen, 0 €).
Erstmals E2E mit Playwright gegen DEV (Grundgerüst anlegen, npm run dev:e2e, nur DEV-Guard): (1) Teilnehmerin bucht + bezahlt mit 4242…, meldet sich vor Frist ab → Dialog zeigt „Du bekommst 24,00 € zurück“, danach „Erstattung läuft“/„Erstattet“; (2) Owner erstattet 10,00 € manuell → Liste zeigt Teilerstattung, Teilnehmerin sieht „Teilweise erstattet · 10,00 € von 24,00 €“; (3) Kursabsage-Dialog zeigt Anzahl und Summe. Screenshots 360/1280 nach docs/screenshots/3_2c/ (nicht committen).
DoD wie in der Regeldatei, inkl. STAND.md.
Haltestelle

Nach Logik + Gestaltung + E2E: Haltestelle 5 (Klicktest Julius). Im Bericht eine kurze Klickliste (max. 10 Punkte) für das, was E2E nicht abdeckt (Optik, Gefühl, 360 px).