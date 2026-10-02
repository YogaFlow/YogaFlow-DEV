Entscheidung 09 – Checkout Karte (Story 2.2)

Stand: 30.09.2026 · Entschieden von: Julius · Status: gilt Grundlage: Inventur 2.2 (Cursor, 30.09.), Stripe-Doku (Payment Method Domains, Checkout Sessions), Entscheidung 02 (native App mit Expo, Bezahlung in v1), Entscheidung 08.

Entscheidungen
#	Frage	Entscheidung
C1	Form des Checkouts	Eigener Checkout in der App. PaymentIntent als Direct Charge auf das Studio-Konto. Web: Stripe Payment Element (Karte, Apple Pay, Google Pay). App (später): Stripe PaymentSheet (@stripe/stripe-react-native). Ein Backend für beide. Keine gehostete Stripe-Seite, kein Embedded Checkout.
C2	Reservierung bei Direktbuchung	15 Minuten (Entscheidung 08 bleibt).
C3	–	entfällt (war nur für Checkout Sessions nötig)
C4	Zahlung kommt nach Ablauf an	Platz noch frei → neue Buchung registered + paid. Sonst automatisch voll erstatten, schon in 2.2a. Verlust des Studios je Fall: 24 € × 1,5 % = 0,36 € + 0,25 € = 0,61 € (Stripe erstattet die Gebühr nicht). Durch C10 ein seltener Randfall.
C5	Gebühren im Hauptbuch	Erst mit dem Auszahlungsabgleich (1b). Jetzt Bruttobetrag auf neues Konto psp_clearing. Beispiel 24 €: Kleinunternehmer → Soll psp_clearing 24,00 / Haben revenue_small_business 24,00. Regulär 19 % → 24,00 / 1,19 = 20,17 € netto, 24,00 − 20,17 = 3,83 € USt → Soll psp_clearing 24,00 / Haben revenue_standard 20,17 / Haben vat_output 3,83.
C6	Stripe-Kunde	Nein. Nur E-Mail vorbelegen. provider_customers wird nicht gebaut (P5 aus 1.2a erledigt sich).
C7	Bestätigung	Omlify: Glocke + E-Mail über die Outbox („Zahlung eingegangen, dein Platz ist sicher“). Stripe-Quittung stellt das Studio in seinem Dashboard ein. Belege kommen mit 4.2.
C8	Karte bei Online-Pflicht	Person wählt: „Mit Karte buchen“ (wie heute) oder „Online bezahlen“. Online-Pflicht heißt nur: keine Zahlung vor Ort.
C9	Webhook	payment_intent.succeeded, .payment_failed, .canceled → Stand bei Stripe nachlesen (W3) → Abschluss. Versuch und Zahlung tragen dieselbe Referenz pi_….
C10	Bezahlschritt	Bestätigung auf dem Server. Das Formular sammelt nur die Zahlungsdaten (Confirmation Token). Unsere Function prüft Reservierung und Betrag und bestätigt erst dann den PaymentIntent. So zahlt niemand für einen Platz, der schon frei ist. Gilt für Web und App gleich.
C11	Apple Pay / Google Pay im Web	Die Studio-Subdomain wird automatisch beim Studio-Konto registriert (payment_method_domains, mit Stripe-Account), sobald das Konto aktiv ist. Karte funktioniert auch ohne. In der App keine Domain nötig (Apple-Merchant-ID).
C12	acct_… im Browser	Erlaubt, nur als Parameter für Stripe.js (Direct Charges brauchen ihn). Nie anzeigen, nie loggen, nie in URLs. Ändert die Regel aus 1.3b.
Folgen
Frontend bekommt @stripe/stripe-js und @stripe/react-stripe-js; Grenz-Prüfung bekommt eine zweite Ausnahme (eine Datei für das Bezahlformular).
Publishable Key wird für die Bezahlung gebraucht → Absicherung gegen PAYMENTS_MODE gehört fest in 2.2b.
Eine CSP gibt es heute nicht. Wird sie eingeführt, müssen die Stripe-Quellen hinein.
Julius ergänzt im Stripe-Dashboard beim Ziel „Verbundene Konten“ die Ereignisse payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled.
Schnitt

2.2a-1 Datenbank → 2.2a-2 Port und Adapter → 2.2a-3 Function payments-checkout (Vorbereiten, Bestätigen, Domain-Registrierung) → 2.2a-4 Webhook-Zweige und Bestätigungs-E-Mail → 2.2b Oberfläche (Payment Element, Rückmeldung, Klicktest mit Testkarten). Jeder Schritt mit STOPP.