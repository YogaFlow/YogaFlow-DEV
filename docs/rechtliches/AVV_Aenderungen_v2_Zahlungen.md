Warum eine neue Version

Die AVV vom 21.09. kennt keine Zahlungen. Seitdem verarbeitet Omlify im Auftrag der Studios Zahlungsvermerke, Erstattungen, Rückbuchungen, Karten/Guthaben, Hauptbuch und (mit B1) Belege. Das muss in § 2 stehen, und Stripe muss eingeordnet werden.

Änderungen

§ 2 Datenkategorien — ergänzen:

Zahlungs- und Abrechnungsdaten: Betrag, Zahlungsart, Status, Zeitpunkte, Erstattungen (Betrag, Grund, interne Notiz des Studios), Rückbuchungen, Karten und Guthaben, Buchungen der vorbereitenden Buchhaltung, Referenznummern beim Zahlungsdienstleister. Keine Kartendaten — die gibt die Person direkt bei Stripe ein.
Belege: Belegnummer, Datum, Leistung, Betrag, Steuerangabe, Anbieterangaben des Studios.
Anbieterangaben des Studios: Name, Anschrift, Kontakt-E-Mail, Telefon, Steuernummer/USt-IdNr. (bei Einzelpersonen personenbezogen).

§ 2 Zweck — ergänzen: „Abwicklung von Online-Zahlungen über das Stripe-Konto des Verantwortlichen (Zahlung auslösen, erstatten, Status abgleichen), Ausstellung von Belegen und Buchungsbestätigungen im Namen des Verantwortlichen, vorbereitende Buchhaltung.“

§ 6 — neuer Absatz am Ende: „Keine Unterauftragsverarbeitung ist die Zahlungsabwicklung durch die Stripe Payments Europe, Ltd. (Irland). Stripe handelt über das eigene Stripe-Konto des Verantwortlichen als eigener Verantwortlicher; es gilt der Vertrag zwischen dem Verantwortlichen und Stripe. Der Auftragsverarbeiter übermittelt Stripe im Auftrag des Verantwortlichen nur die für die jeweilige Zahlung nötigen Angaben.“

Anlage 1 — Zeilen ergänzen:

„Zahlungsdaten: Kartendaten werden von Omlify weder verarbeitet noch gespeichert.“
„Protokolle: E-Mail-Adressen, Beträge, Zahlungs- und Kontokennungen werden in Protokollen maskiert.“

Anlage 2: unverändert (Supabase, AWS, Resend, Cloudflare, R2, IONOS).

Stand: neues Datum = Tag der Freigabe.

Vor der Freigabe (sonst stimmt die bestehende AVV schon heute nicht)
2-Faktor-Anmeldung bei Supabase, Cloudflare, GitHub, Stripe, Resend, IONOS. Anlage 1 behauptet das seit dem 21.09.
R2-Lifecycle-Regel 90 Tage im Bucket omlify-backups — Status prüfen (offener Punkt 3 vom 21.09.).
Testkundin: AVV rückwirkend per E-Mail mit Bitte um Bestätigung in Textform (offener Punkt 2 vom 21.09.) — Status prüfen. Mit Version 2 bestätigt sie per Klick in der App (B2).