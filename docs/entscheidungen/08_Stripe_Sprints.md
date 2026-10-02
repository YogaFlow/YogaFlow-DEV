Entscheidung 08 – Stripe-Sprints: Umfang, Modell, Schalter

Stand: 28.09.2026 · Entschieden von: Julius · Status: gilt

#	Frage	Entscheidung
P1	Release	Ein gemeinsames PROD-Update, Sprint A und Stripe zusammen (Entscheidung 07).
P2	Zahlungsmodell	Variante D: payment_attempts für Versuche; payments-Zeile erst bei succeeded. Erstattungen/Rückbuchungen sind negative Zeilen mit eigener Referenz (re_…, dp_…).
P3	Erste Ausbaustufe	Nur Kartenzahlung (inkl. Apple Pay / Google Pay) für einzelne Kurstermine. SEPA und 2.4 später.
P4	Wer schaltet ein	Owner, sobald das Stripe-Konto bereit ist; zusätzlich Plattform-Schalter (nur service_role), auf PROD beim Release aus.
P6	Vertragspartner Plattform	Julius als Einzelunternehmer.
P7	Konto-Konfiguration	Accounts v2, dashboard: full, fees_collector: stripe, losses_collector: stripe, card_payments, Direct Charges, eingebettetes Onboarding. Folge: Studios können im Stripe-Dashboard selbst erstatten und Disputes bearbeiten → Omlify muss das per Webhook nachbuchen.
P8	Reihenfolge	Erst alles auf DEV im Testmodus; Rechts-Epic, Anwalt, Steuerberatung danach, vor dem Plattform-Schalter auf PROD.
P9	Online aus	Ist Online nicht wirksam an, ist Vor-Ort-Zahlung immer erlaubt.
P10	Online wirksam	Plattform-Schalter und Studio-Schalter; ein zentraler Helfer.

Weitere Vorgaben: Webhook als Edge Function, Webhooks sind die Wahrheit (nachlesen). Reservierung Checkout 15 Min., Nachrücken bei Online-Pflicht 12 h, spätestens 2 h vor Beginn. Erstatten nur Owner/Admin. Plattformgebühr 0 €. Keine Umsatzanzeige am Bildschirm. Keine Plattform-Admin-Rolle.

Einschalten durch Owner nur wenn: Plattform an (PLATFORM_DISABLED), Konto bereit (PROVIDER_NOT_READY), Steuerstatus gesetzt (TAX_SETTING_MISSING). Ausschalten immer erlaubt.