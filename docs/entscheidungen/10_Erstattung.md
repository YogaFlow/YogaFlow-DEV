Entscheidung 10 – Erstattung online bezahlter Buchungen (Story 3.2, Teile von 2.3)

Stand: 02.10.2026 · Entschieden von: Julius · Status: gilt Grundlage: Inventur 2.3/3.1/3.2 (Cursor, 02.10.), Epic 3.2 + E3, Nachtrag §5a/§10, Entscheidung 08/09.

Ausgangslage (Inventur)

Online bezahltes Geld bleibt heute beim Studio, wenn sich jemand abmeldet (in oder nach Frist), das Studio abmeldet, der Kurs abgesagt oder die Person entfernt wird. Erstattungen und Rückbuchungen im Stripe-Dashboard sieht Omlify nicht. Erstattet wird nur automatisch bei REFUND_REQUIRED (Platz weg nach Spätzahlung), und nur voll.

Entscheidungen
#	Frage	Entscheidung
R1	Gebühr	Teilnehmerin bekommt immer den vollen Betrag zurück. Das Studio trägt die Stripe-Gebühr (bei 24 €: 24 × 1,5 % = 0,36 € + 0,25 € = 0,61 € je Erstattung). Kein Abzug, kein AGB-Sonderfall.
R2	Automatisch voll erstatten bei	Kursabsage durch das Studio · Selbstabmeldung vor der Stornofrist (gleiche Frist wie bei Karten, cancellation_deadline) · Abmeldung durch das Studio (unabhängig von der Frist) · Person entfernen (alle künftigen online bezahlten Buchungen). Erstattet wird jeweils der noch nicht erstattete Restbetrag.
R3	Selbstabmeldung nach der Frist	Kein Geld zurück. Der Abmelde-Dialog sagt das vorher klar, mit Betrag.
R4	Manuelle Erstattung	Eigener Knopf in Omlify (Owner und Admin, nicht Lehrende), voll oder Teilbetrag, mit Pflichtgrund. Summe aller Erstattungen ≤ Zahlungsbetrag.
R5	Erstattungen im Stripe-Dashboard	Werden per Webhook (charge.refunded, refund.updated/refund.failed) nachgebucht, auch Teilbeträge. Omlify bleibt die Wahrheit für Buchung und Hauptbuch.
R6	Rückbuchungen (Disputes)	Vorerst: Ereignis speichern, Glocke an Owner/Admin, Zahlung als „Rückbuchung offen“ markieren. Buchung im Hauptbuch mit dem Auszahlungsabgleich (1b).
R7	Fehlgeschlagene Erstattung	Status „fehlgeschlagen“, Glocke an Owner/Admin, erneuter Versuch über den Knopf möglich.
R8	Datenmodell	Teilerstattungen jetzt, nicht später: eine Erstattung = eigener Datensatz mit eigenem Betrag und eigenem Idempotency-Key. Mehrere Erstattungen je Zahlung. Gilt auch für die bestehende Auto-Erstattung aus 4a (W3).
R9	Anzeige für Teilnehmende (2.3)	„Erstattung läuft“ und „Erstattet (24,00 €)“ bzw. „Teilweise erstattet (10,00 € von 24,00 €)“ in Meine Anmeldungen. E-Mail „Zahlung erstattet“ wie bisher, mit Betrag.
R10	Reihenfolge	Vor dem Einschalten von Online-Zahlung auf PROD fertig: R1–R9. Zahlungsübersicht für das Studio (3.1) direkt danach.
Schnitt

3.2a Datenbank (Erstattungen als Datensätze, Auslöser in Absage/Abmeldung/Entfernen, Erstatten-RPC) → 3.2b Functions (Teilbetrag im Port, Webhook charge.refunded/refund.*/charge.dispute.*) → 3.2c Oberfläche (Abmelde-Dialog mit Vorab-Info, Erstatten-Dialog, Kursabsage-Dialog, Status in Meine Anmeldungen) → 3.2d Deploy, Rauchtest, Klicktest. Danach 3.1.

Hinweis

Die Dateien claude/Entscheidung_* liegen nicht im Repo. Cursor übernimmt R1–R10 in den Nachtrag (docs/EPIC_GELDKETTE_1A_NACHTRAG_2026-09-21.md), damit sie dort nachlesbar sind.

Sieh dir den Aufgabenfortschritt für längere Aufgaben an.

Entscheidung_10_Erstattung.md
Geldkette_Uebergabe_nach_Sprint_A.md
10_Erstattung.md
09_Checkout_Karte.md
Geldkette_Autonom_3_2_Setup_und_Rollout.md
08_Stripe_Sprints.md
Geldkette_Stripe_3_2b_Cursor_Prompt_Functions.md
Geldkette_Stripe_3_2a_Cursor_Prompt_Schema.md
Geldkette_Stripe_2_3_3_x_Cursor_Prompt_Inventur.md
Geldkette_Stripe_2_2b_3_Klicktest.md
Geldkette_Stripe_2_2b_2_Cursor_Prompt_Gestaltung.md
Geldkette_Stripe_2_2b_1_Cursor_Prompt_Logik.md
Geldkette_Stripe_2_2b_Cursor_Prompt_Inventur.md
Omlify
Konnektoren
Supabase