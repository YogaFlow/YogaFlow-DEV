UX-8 — Freigabe nach Teil 0 (Claude, 06.10.2026)

Für Cursor. Grundlage: docs/berichte/ux8_uebersicht_zu_erledigen.md. Befund Cursor: Demo-Rückgabe ist online (Olaf, card, 18 €), payment_refunds.status = failed; Dashboard filtert Online nicht aus.

Ursache der fehlgeschlagenen Erstattung (Claude auf DEV geprüft)
Die beiden Online-Zahlungen aus demo_v3.mjs haben erfundene PaymentIntent-Referenzen (pi_test_…, 28/30 Zeichen; echte Stripe-IDs: pi_ + 24 Zeichen = 27). Stripe kennt sie nicht → Erstattung bei Kursabsage endet korrekt mit NOT_FOUND.
Olafs „Teilerstattung 5 €“ hat eine erfundene Erstattungs-Referenz (re_te…) und steht als succeeded — der Seed hat die Erstattung direkt in die Tabelle geschrieben, am Erstattungsweg vorbei.
Der Erstattungsweg selbst ist in Ordnung: echte Zahlungen der letzten Tage wurden alle erfolgreich erstattet; die Überwachung hat refunds_failed und provider_jobs gemeldet (wie gewollt).
Regelverstoß: „Testdaten nur über RPCs/Testskripte“ — Zahlungs-/Erstattungszeilen dürfen nie direkt geschrieben werden.
Entscheidungen
#	Frage	Entscheidung
U0	Seed	demo_v3.mjs korrigieren: Online-Zahlungen nur über den echten Testweg (PaymentIntent im Testmodus des verbundenen Kontos, 4242, wie E2E K1). Erstattungen nur über request_refund/Kursabsage. Kein direktes INSERT in payments, payment_refunds, receipts, Hauptbuch. In der Regeldatei ergänzen.
U0b	Bestehende Fake-Zeilen	Nicht löschen (append-only). Betroffene Kurse/Personen per archived_at aus allen Listen nehmen (inkl. Todo-Liste), die beiden Alarme über den bestehenden Weg als erledigt markieren. Im Bericht: welche Zeilen, welche Kurse archiviert.
U1	Online in der Todo-Liste?	Nie als „Geld zurückgeben“. Laufende/erfolgreiche Online-Erstattungen erscheinen nicht. Bugfix freigegeben, Teil von buildTodoItems.
U2	Fehlgeschlagene Online-Erstattung	In die Liste, ganz oben, nur Owner/Admin: „Erstattung fehlgeschlagen · 18,00 € an {Name}“ → Sprung zur Zahlung mit „Erneut versuchen“ (R7). Glocke bleibt. Lehrende sehen die Zeile nicht. Archivierte ausgenommen.
U3	Demo	Beides, nach U0 neu geseedet: abgesagter Kurs mit echter Online-Zahlung (Erstattung muss succeeded werden, erscheint nicht in der Liste) und abgesagter Kurs mit Bar-Zahlung von Vera → „18,00 € bar an Vera Vorort zurückgeben“. Olafs Teilerstattung über den echten Erstatten-Knopf/RPC. Realistische Kursnamen.
Reihenfolge in der Liste (ergänzt)

Erstattung fehlgeschlagen → Geld zurückgeben (vor Ort) → Zahlung offen → zahlt vor Ort heute → Sammelzeile.

Akzeptanz zusätzlich
Unit: Online-Erstattung succeeded/pending → keine Zeile; failed → Zeile U2 (nur Owner/Admin); archiviert → keine Zeile.
Nach Neu-Seed: SQL im Bericht — alle Online-Zahlungen in demoalpha haben 27-stellige pi_-Referenzen, keine failed-Erstattung offen, ops_alerts für demoalpha ohne offene refunds_failed.