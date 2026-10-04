# Bericht B2 — Überwachung und AVV-Zustimmung

Status: **fertig** (Klicktest offen, Haltestelle 5). Stand 04.10.2026.

Vorgabe: [docs/stories/b2_ueberwachung_avv.md](../stories/b2_ueberwachung_avv.md).
Entscheidung 13 gilt. AVV V0 bereits zuvor (Stand 04.10.2026).

## Commits

- Migration `20261004130000` ops_alerts + collect/apply + Cron 15 min
- Edge Function `ops-monitor` (+ Deno-Tests)
- Migration `20261004140000` legal_acceptances + AVV_MISSING
- Oberfläche: Banner, Einstellungen AVV, Onboarding-Checkbox, Aufmerksamkeit
- Vault/Secrets: `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL=support@omlify.de`; `OPS_HEARTBEAT_URL` nicht gesetzt

## U2-Abweichungen (Ist-Zustand)

| Check | Umsetzung |
|---|---|
| (c) payment.orphan | `provider_events_raw.processing_error = 'ORPHAN'` (kein `events`-Typ) |
| (g) process_ledger failed | flüchtig → Events `payment.recorded`/`reversed` ohne `ledger_event_log` > 30 min |
| (i) fehlende Belege | Stripe Zahlung/Erstattung > 10 min ohne Beleg; Lauf startet mit `retry_missing_receipts()` |
| (h) pg_cron | `cron.job_run_details` für `yogaflow_%` |

## DoD

- `dev:apply` bis `20261004140000` grün
- Deno ops-monitor 6 Tests grün
- `b2_legal_acceptances.mjs` grün
- `b2_ops_monitor_smoke.mjs` grün (collect + HTTP, Mail über Redirect)
- `tsc` grün
- Function `ops-monitor` auf DEV deployt; Cron `yogaflow_ops_monitor` */15

## Info Julius

- Testkundin PROD: AVV noch nicht bestätigt — nach Release über Banner (V4). Nichts extra gebaut.
- Heartbeat: `OPS_HEARTBEAT_URL` optional (Haltestelle 3).

## Klickliste (Julius)

1. Überwachungsmail ansehen (Redirect; Betreff `[Omlify DEV] Überwachung: …`).
2. AVV-Volltext `/legal/auftragsverarbeitung` Stand 04.10.
3. Banner „Bitte bestätige…“ → AVV abschließen.
4. Datum/Name/Version sichtbar, Banner weg.
5. Online-Schalter ohne AVV: `AVV_MISSING`; nach Abschluss frei (mit Stripe bereit).
6. Onboarding: ohne AVV-Häkchen kein Abschluss.
7. Einstellungen Rechtliches AVV 360 + 1280.
