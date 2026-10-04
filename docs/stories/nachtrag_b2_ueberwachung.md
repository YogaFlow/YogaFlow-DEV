Omlify · Nachtrag B2 — Überwachung ohne Fehlalarme

Für Cursor. Stand: 04.10.2026, HEAD 261c7d9. Kleiner Nachtrag, je Punkt ein Commit, danach STAND.md + Bericht b2 ergänzen. Darf parallel zum Klicktest von Julius laufen (keine Oberfläche betroffen).

Claude-Prüfung DEV (lesend)

Gut: Beleg-Trigger schließt Erstattungszeilen jetzt aus und blockiert die Zahlung nicht mehr; receipt.issue_failed = 0; Nachholung hat alle alten Stripe-Zahlungen nachgetragen; alle Ops-Funktionen ohne anon/authenticated; legal_acceptances und receipts append-only.

Befunde aus dem ersten Lauf (5 offene ops_alerts):

Schlüssel	Bewertung
_platform:cron:yogaflow_expire_passes	Fehlalarm. Job läuft stündlich (5 * * * *) und war immer succeeded; Prüfung (h) nimmt für unbekannte Zeitpläne 45 min an → ab :50 jede Stunde Alarm, ab :05 „erledigt“, also eine Mail pro Stunde.
_platform:cron:yogaflow_ops_monitor	Fehlalarm beim ersten Lauf (Job war gerade angelegt, noch nie gelaufen).
demobeta:ledger_stuck (6)	Gewollt nicht gebucht: 6 manuelle Zahlungen vom 28./29.09., demobeta hat keinen Steuerstatus, Hauptbuch wartet absichtlich. Auf PROD hätte nach dem Release jedes Studio ohne Steuerstatus, das in der Kasse bar abhakt, Dauer-Alarm.
_unresolved:provider_event_error (9)	Alte Testfehler (u. a. F5). Werden nie „erledigt“ → Erinnerung alle 24 h für immer.
demoalpha:disputes (3)	Richtig (Test-Disputes offen).
Aufträge
#	Was
O1	Prüfung (h) Toleranz je Job statt Pauschale: feste Liste im Code — * * * * * → 5 min, */5 → 15 min, */15 → 45 min, stündlich (<m> * * * *) → 3 h. Unbekannter Zeitplan → 24 h und Hinweis im Log. Ein Job, der noch nie gelaufen ist und jünger als seine Toleranz ist, zählt nicht.
O2	Prüfung (g) nur für Studios mit gültigem Steuerstatus. Ohne Steuerstatus wartet das Hauptbuch absichtlich; das Studio sieht es schon in „Braucht deine Aufmerksamkeit“.
O3	Fehler als geprüft markieren: Spalte provider_events_raw.reviewed_at; Prüfung (e) und (c) zählen nur ungeprüfte. Funktion ops_mark_provider_errors_reviewed(p_before timestamptz) nur für service_role + Skript npm run dev:ops:review -- <ISO-Zeitpunkt> (DEV-Guard). Auf DEV die 9 alten Testfehler damit markieren (Testdaten → keine Haltestelle). Im Release-Plan: PROD-Variante als Runbook-Schritt (Julius führt aus).
O4	Tests: je Fall ein Unit-/SQL-Test (stündlicher Job ok um :55, Job nie gelaufen, Studio ohne Steuerstatus, geprüfter Fehler zählt nicht). Danach einmal ops-monitor auf DEV auslösen: übrig bleiben darf nur demoalpha:disputes; die anderen vier → „erledigt“. Ergebnis (nur Schlüssel + Anzahl) in den Bericht.
Hinweise (nichts tun)
Beleg 2026-00003 (Art „receipt“, −10,00 €) stammt aus der Zeit vor N1 und bleibt wegen append-only stehen. Nur DEV, im Bericht erwähnen.
legal_acceptances ist auf DEV leer, die AVV-Zustimmung wurde also noch nie wirklich gespeichert. Das prüft Julius im Klicktest. Falls der E2E-Fall die Zustimmung nur simuliert, im Bericht so benennen.