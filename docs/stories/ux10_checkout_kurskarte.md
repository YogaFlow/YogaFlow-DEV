Story UX-10 — Checkout-Feinschliff, „Kurskarte“ statt „Mehrfachkarte“

Für Cursor (autonomer Ablauf). Stand: 07.10.2026, nach UX-9 (6e75519). Als docs/stories/ux10_checkout_kurskarte.md ablegen; Entscheidung 19 in docs/entscheidungen/19_Wording_Mehrfachkarte.md fortschreiben (W1 neu, Datei umbenennen in 19_Wording_Kurskarte.md). check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp. Vor Haltestelle 5: Workers-Build + Live-Bundle prüfen. Klickliste max. 8.

Entscheidung 19 — geändert (07.10.)
#	Regel
W1 (neu)	Oberbegriff „Kurskarte“ (statt „Mehrfachkarte“). Menü „Kurskarten“, Einstellungen „Kurskarten“. Konkrete Produkte weiter mit Namen („10er-Karte“).
W1a	Nie „Abo“ für Kurskarten: Sie werden einmal bezahlt und verlängern sich nicht. „Abo“/„Mitgliedschaft“ bleibt für ein späteres, wiederkehrendes Produkt reserviert (eigene Rechtsfolgen, z. B. Kündigungsknopf).
W2–W5	unverändert (Produktname wo konkret, nie „Karte“ allein, Zahlungsmittel „Kreditkarte“, interne Namen bleiben).
AGB-Vorlage agb.v1.md und Datenschutz-Vorlage: „Mehrfachkarte(n)“ → „Kurskarte(n)“. Keine neue Vorlagen-Version (v1 ist auf PROD noch nie freigegeben); auf DEV neue Fassung erzeugen, Demo-Studios erneut freigeben lassen (Seed).
Textsuche „Mehrfachkarte“ in src/, Mails, docs/legal/ = 0 Treffer.
A — Zahlarten im Checkout (Kurs + Kurskarte)

Stripe erlaubt nicht, den Text „Karte“ im Payment Element umzubenennen. Deshalb:

Layout Accordion mit Radio-Knöpfen (layout: { type: 'accordion', radios: true, spacedAccordionItems: true }): Jede Zahlart ist eine eigene Zeile; bei „Karte“ stehen die Logos Visa/Mastercard/Amex daneben → eindeutig Kreditkarte.
Reihenfolge fest: paymentMethodOrder: ['apple_pay', 'google_pay', 'card'].
Eigene Überschrift über dem Element: „Wie möchtest du bezahlen?“
Darunter klein grau mit Schloss-Symbol: „Sichere Zahlung über Stripe. Deine Kartendaten sehen wir nicht.“
Appearance API: Schrift, Radius, Farben wie Designsystem (Eingabefelder 48 px, Radius wie unsere Felder).
B — Zusammenfassung oben (was kaufe ich, was passiert, wenn …)

Kurs:

Hatha am Nachmittag
Di, 7. Okt · 18:00–19:15 · Studio Neuss · mit Lena
✓ Kostenlos abmelden bis Mo, 6. Okt, 18:00

Kurskarte:

10er-Karte
10 Termine · 12 Monate gültig · 12,00 € pro Termin
✓ Gilt für alle Kurse mit dem Hinweis „mit Kurskarte buchbar“
Eine Zeile Beruhigung mit Häkchen-Symbol (Abmeldefrist bzw. Gültigkeit). Abmeldefrist nur, wenn sie noch in der Zukunft liegt; sonst „Die kostenlose Abmeldefrist ist vorbei.“
C — Fuß und Knopf
Unverändert aus UX-9: Gesamtpreis + „Endpreis · keine USt (§ 19 UStG)“ bzw. „inkl. 19 % USt“, Knopf, Rechtszeile; mobil sticky.
Knopf-Zustände: normal → beim Tipp „Zahlung läuft …“ mit Spinner, Knopf gesperrt (kein Doppeltipp), Sheet nicht schließbar bis Ergebnis; bei Ablehnung Fehlermeldung von Stripe deutsch über dem Knopf, Knopf wieder aktiv; Erfolg → Erfolgsfenster wie heute.
Häkchen-Prüfung (Kurskarte) bleibt vor confirmPayment, auch bei Apple/Google Pay.
D — Nicht in dieser Story (Entscheidung offen, eigene Story später)
Zahlungsmittel merken („Für nächste Buchung speichern“) über Stripe CustomerSession: Stammkundinnen buchen mit einem Tipp, ohne Kartennummer. Braucht einen Stripe-Kunden je Studio-Konto (Direct Charges) und widerspricht Entscheidung 09 („kein Stripe-Kunde“) → eigene Entscheidung nach dem Pilot.
Stripe Link: aus lassen (in DE wenig bekannt, zusätzliches E-Mail-Feld verwirrt).
Wero: nach Zugangsfreigabe (Entscheidung 16).
Akzeptanz
Unit: Zusammenfassung (Frist künftig/vorbei), Knopf-Zustände.
E2E (e2eapp): Kurs online buchen → Zusammenfassung mit Frist, Zahlarten als Liste, Zahlung ok; Kurskarte kaufen → „10er-Karte“ + Gültigkeitszeile; Menü „Kurskarten“; Doppeltipp erzeugt nur einen PaymentIntent.
Screenshots 360/390/1280: Kurs-Checkout, Kurskarten-Checkout, Zustand „Zahlung läuft“, Ablehnung (Testkarte 4000 0000 0000 0002).