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
- Nachtrag O1–O4: Migration `20261004150000`, Skript `dev:ops:review`, Test `b2_ops_monitor.mjs`

## U2-Abweichungen (Ist-Zustand)

| Check | Umsetzung |
|---|---|
| (c) payment.orphan | `provider_events_raw.processing_error = 'ORPHAN'` (kein `events`-Typ); nur `reviewed_at IS NULL` |
| (e) provider_event_error | nur `reviewed_at IS NULL` |
| (g) ledger stuck | Events ohne `ledger_event_log` > 30 min, **nur Studios mit gültigem Steuerstatus** |
| (h) pg_cron | Toleranz je Schedule (O1); nie gelaufen + jünger als Toleranz zählt nicht |
| (i) fehlende Belege | Stripe Zahlung/Erstattung > 10 min ohne Beleg; Lauf startet mit `retry_missing_receipts()` |

## Claude-Prüfung — Nachtrag O1–O4

| # | Inhalt | Beleg |
|---|---|---|
| O1 | Toleranz: `* * * * *` 5 min, `*/5` 15 min, `*/15` 45 min, stündlich 3 h, unbekannt 24 h + Log; jung & nie gelaufen zählt nicht | `b2_ops_monitor.mjs` |
| O2 | (g) nur mit Steuerstatus | Teststudio ohne Status + demobeta resolved |
| O3 | `reviewed_at` + `ops_mark_provider_errors_reviewed` + `npm run dev:ops:review`; 9 Altfehler auf DEV markiert; PROD-Runbook in Release-Plan 0.12 | markiert 9 |
| O4 | Tests grün; ops-monitor: nur `demoalpha:disputes` offen | siehe unten |

### O4 — ops-monitor nach Fix (nur Schlüssel + Anzahl)

| Schlüssel | Status | count |
|---|---|---|
| `demoalpha:disputes` | offen | 3 |
| `_platform:cron:yogaflow_expire_passes` | erledigt | 0 |
| `_platform:cron:yogaflow_ops_monitor` | erledigt | 0 |
| `_unresolved:provider_event_error` | erledigt | 0 |
| `demobeta:ledger_stuck` | erledigt | 0 |

collect liefert genau 1 Finding: `demoalpha:disputes` (3).

## Hinweise

- Beleg `2026-00003` (Art `receipt`, −10,00 €) stammt aus der Zeit vor dem Umkehr-Fix und bleibt append-only stehen (nur DEV).
- `legal_acceptances` auf DEV: E2E B1 speichert die AVV **nicht über die UI**, sondern simuliert per RPC `accept_legal_document` in `e2e/_dev.ts` (Voraussetzung Online-Schalter). Ob Zeilen liegen, hängt vom letzten E2E-Lauf ab — echte UI-Zustimmung prüft Julius im Klicktest.

## DoD

- `dev:apply` bis `20261004150000` grün
- Deno ops-monitor 6 Tests grün
- `b2_legal_acceptances.mjs` grün
- `b2_ops_monitor.mjs` grün (O1–O4)
- `b2_ops_monitor_smoke.mjs` grün
- Function `ops-monitor` auf DEV deployt; Cron `yogaflow_ops_monitor` */15

## Info Julius

- Testkundin PROD: AVV noch nicht bestätigt — nach Release über Banner (V4). Nichts extra gebaut.
- Heartbeat: `OPS_HEARTBEAT_URL` optional (Haltestelle 3).
- PROD Altfehler markieren: Release-Plan Abschnitt 0.12 (Julius führt aus).

## Klickliste (Julius)

1. Überwachungsmail ansehen (Redirect; Betreff `[Omlify DEV] Überwachung: …`).
2. AVV-Volltext `/legal/auftragsverarbeitung` Stand 04.10.
3. Banner „Bitte bestätige…“ → AVV abschließen (echte Speicherung in `legal_acceptances`).
4. Datum/Name/Version sichtbar, Banner weg.
5. Online-Schalter ohne AVV: `AVV_MISSING`; nach Abschluss frei (mit Stripe bereit).
6. Onboarding: ohne AVV-Häkchen kein Abschluss.
7. Einstellungen Rechtliches AVV 360 + 1280.
