Entscheidung 13 – Überwachung und AVV-Zustimmung (Story B2)

Stand: 04.10.2026 · Vorgegeben von: Julius in Story B2 · Status: **gilt**
Grundlage: Story [b2_ueberwachung_avv.md](../stories/b2_ueberwachung_avv.md), AVV-Änderungen [AVV_Aenderungen_v2_Zahlungen.md](../rechtliches/AVV_Aenderungen_v2_Zahlungen.md), Entscheidung 12 (K2).

Überwachung

| # | Entscheidung |
|---|---|
| U1 | Ein Prüflauf alle 15 Minuten (`pg_cron` → Edge Function `ops-monitor`, Secret-Header wie `payments-jobs`). Er prüft nur Zählwerte, nie Inhalte. |
| U2 | Prüfungen (je Studio gezählt, Mail nennt nur Studio-Slug + Anzahl + Art): (a) `provider_jobs` endgültig fehlgeschlagen oder > 30 min offen/geclaimt · (b) `payment_refunds` Status `failed` · (c) Ereignis `payment.orphan` (Zahlung ohne passende Buchung) · (d) neuer `payment_disputes`-Eintrag · (e) `provider_events_raw` mit Verarbeitungsfehler (außer bekannte transiente wie `PAYMENT_NOT_READY` < 30 min) · (f) `email_deliveries` `failed` · (g) `process_ledger` mit `failed` > 0 · (h) `pg_cron`-Läufe der eigenen Jobs mit Status `failed` in den letzten 60 min oder letzter erfolgreicher Lauf älter als 3 × Intervall. Ist-Zustand der Quellen/Status prüfen und Abfragen anpassen (Abweichung im Bericht). |
| U3 | Entprellen: Tabelle `ops_alerts(key, first_seen, last_seen, count, notified_at, resolved_at)`. Mail nur beim ersten Auftreten eines Schlüssels und erneut, wenn er 24 h später noch offen ist. Eine Mail je Lauf mit allen neuen Punkten, nicht eine je Fund. Wird ein Punkt wieder 0 → `resolved_at`, in der nächsten Mail „erledigt: …“. |
| U4 | Empfänger nur aus Secret `OPS_ALERT_EMAIL` (nie im Code, nie im Log). Fehlt das Secret → Funktion meldet `NOT_CONFIGURED` im Log, sonst nichts. |
| U5 | Totmannschalter gegen „Cron steht komplett“: `ops-monitor` ruft am Ende eine optionale URL aus Secret `OPS_HEARTBEAT_URL` auf (z. B. healthchecks.io). Bleibt der Ruf aus, schickt der externe Dienst Julius eine Mail. Konto + URL legt Julius an; gebaut wird nur der Aufruf. Keine personenbezogenen Daten an den Dienst. |
| U6 | Mailtext kurz. Betreff „[Omlify DEV] Überwachung: {n} Punkte“ (auf PROD ohne „DEV“). Keine Personen, keine Beträge, keine IDs außer Studio-Slug und Art. |
| U7 | Auf DEV standardmäßig an, aber mit `EMAIL_REDIRECT_TO`-Schutz wie heute. |

AVV-Zustimmung

Die AVV existiert bereits (`docs/legal/AVV_Auftragsverarbeitung.md`, live unter `/legal/auftragsverarbeitung`, Stand 21.09.2026). Sie wird heute nur stillschweigend über die Nutzung einbezogen. Keinen neuen AVV-Text schreiben.

| # | Entscheidung |
|---|---|
| V0 | Text-Update auf Version 2 nach [AVV_Aenderungen_v2_Zahlungen.md](../rechtliches/AVV_Aenderungen_v2_Zahlungen.md): nur die dort genannten Ergänzungen in die bestehende Datei, neues Stand-Datum, Seite neu rendern (`scripts/render-legal-pages.mjs`). Eigener Commit. Kein PROD-Deploy. |
| V1 | Tabelle `legal_acceptances(id, tenant_id, user_id, document ∈ {avv, terms, privacy}, version, content_hash, accepted_at)`. Schreiben nur Owner über RPC, nur eigenes Studio. Alte Zustimmungen bleiben gespeichert. |
| V2 | `version` = Stand-Datum der Datei (z. B. 2026-10-04), Hash aus dem gerenderten Text. Aktuelle Version + Hash als Konstante im Build; Server prüft, dass die akzeptierte Version die aktuelle ist. |
| V3 | Neue Studios: Checkbox im OnboardingWizard um die AVV erweitern („Ich schließe den Vertrag zur Auftragsverarbeitung ab“, Link auf `/legal/auftragsverarbeitung`); beim Anlegen wird `legal_acceptances` geschrieben (auch für AGB/Datenschutz, wenn dort heute nichts gespeichert wird). |
| V4 | Bestehende Owner ohne Zustimmung zur aktuellen Version: nicht blockierend: Banner im Owner-Bereich + „Braucht deine Aufmerksamkeit“: „Bitte bestätige den Vertrag zur Auftragsverarbeitung.“ → Einstellungen › Rechtliches › „Auftragsverarbeitung (AVV)“: Link zum Volltext, Version, Knopf „AVV abschließen“, danach „Abgeschlossen am {Datum} von {Name}, Version {v}.“ |
| V5 | Sperre: Online-Zahlung lässt sich nur einschalten, wenn die aktuelle AVV-Version akzeptiert ist (gleicher Mechanismus wie K2 in B1; Grund `AVV_MISSING`). Studios mit bereits aktiver Online-Zahlung nicht abschalten, nur Banner (auf PROD gibt es keine). |
| V6 | Neue AVV-Version später → Banner erscheint wieder; alte Zustimmungen bleiben gespeichert. |

Hinweis

U6 und V1 waren in der Story-Quelle am Zeilenende abgeschnitten. Betreff und Tabellenschema folgen dem übrigen Text (eine Mail je Lauf, Nachweis in Textform, Dokumente avv/terms/privacy).
