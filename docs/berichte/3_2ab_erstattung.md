# Bericht 3.2a/3.2b — 2026-10-02

Status: fertig

Commits:
- `5971a7e` chore(dev): Autonomer DEV-Ablauf – Guard, Wrapper-Skripte, Regeln, Entscheidungen
- `bbbe426` feat(geldkette): 3.2a Online-Erstattung Schema, Trigger, Test
- `ddba7eb` feat(geldkette): 3.2b Erstattung Port, Jobs, Webhook, E-Mail
- `a594747` test(geldkette): 3.2b Erstattung-Rauchtest F1-F6
- `986ad01` / `8c257e5` docs Bericht (zwischenzeitlich angehalten F5)
- (dieser Lauf) Hotfix `du_` Dispute-Refs, Race PAYMENT_NOT_READY, Replay-Skript, Regel, Bericht fertig

DEV-Stand:
- Migrationen bis `20261002202506` (Dispute-Prefix `du_`/`dp_`)
- Functions: `payments-jobs`, `payments-webhook` (Hotfix), `dispatch-emails`
- Cron `yogaflow_process_provider_jobs` aktiv; failed-Jobs aus Tests außerhalb = 0 (Stand Rollout)

Was gebaut wurde
- Teil A: DEV-Guard/`dev:*`, Regel autonom, Entscheidungen 08–10
- 3.2a Schema/RPCs/Trigger/Ledger H5'
- 3.2b Port/Jobs/Webhook/E-Mail/Pause
- F5-Hotfix: Stripe Dispute-IDs `du_…` (API 2026-08-26.dahlia); CHECK + `record_payment_dispute`; Adapter/Fake
- Race: Dispute vor `payments`-Zeile → 500 `PAYMENT_NOT_READY` (Stripe-Retry) statt final `PROCESSED`
- `scripts/dev/replay_provider_event.mjs` (Disputes: Stripe nachlesen + RPC)
- Regel `.cursor/rules/stripe-webhook-fixtures.mdc`

Definition of Done
- ✅ `dev:check` — Exit 0 (Deno 178 passed)
- ✅ `dev:apply` — inkl. `20261002202506`
- ✅ Funktions-Diff: `record_payment_dispute` nur Prefix-Regex `^(dp_|du_)` geändert
- ✅ `dev:test` — zuvor grün; Rauch ersetzt den Story-Beweis
- ✅ Rauchtest F1–F6 grün (`s3_2b_refund_smoke.mjs --direkt`, Lauf murawp40)
- ✅ Bericht

Rauchtest
- F1 Teilerstattung 10 € — OK
- F2 Dashboard 14 €, Summe 24 €, NOTHING_TO_REFUND — OK
- F3 Kursabsage course_cancelled — OK
- F4a vor Frist / F4b nach Frist — OK
- F5 Dispute `du_…`, Glocke, kein Gegenzeile — OK
- F6 Deno 17 — OK (vermerkt)

Ursache F5 (Behoben)
1. `INVALID_EVENT`: Fixture/Code erwarteten `dp_…`, Live-API liefert `du_…`
2. Danach Race: `charge.dispute.created` vor fertiger `payments`-Zeile → früher final `dispute.unknown`; jetzt transient `PAYMENT_NOT_READY`

Replay
- Ereignisse mit `processed_at` + Fehler werden **nicht** automatisch erneut verarbeitet (`already_processed`)
- DEV: `node scripts/dev/replay_provider_event.mjs <uuid>` (Dispute-Pfad)
- Altes Ereignis `e632e78c-…` (16:35) und Race `b1c060c7-…` nachverarbeitet

Abweichungen
- F4b über Studio-Fenster 72 h + Kurs morgen (kein Direkt-UPDATE Deadline)
- F6 nur Deno
- Signiertes Webhook-Re-POST des gespeicherten JSON scheitert (Bytes ≠ Original) → Replay per Stripe-Retrieve

Offene Fragen an Julius
1. Cursor Auto-Run/Allowlist: Befehle aus `omlify-autonom.mdc` Regel 1 freigeben (nicht selbst gesetzt)

Neue offene Punkte
- PROD: Replay-Skript / Umgang mit final falsch `PROCESSED` Webhook-Fehlern analog DEV notieren
- 3.2c UI unverändert offen
