# FS-1 — Feinschliff nach Release

Stand: 2026-10-17 · Branch `Julius` · **STOPP vor PROD** (Klicktest Julius)

## Teil 0 — Kurzbefund

1. **Erstattungen Owner/Admin**
   - Einzel: `src/components/payments/PaymentRefundSheet.tsx` (Checkout u. a. via Sheet)
   - Kurs absagen: `src/components/courses/CourseCancelDialog.tsx` (+ `useCourseCancellation.ts`)
   - Person entfernen: `src/components/users/RemovePersonDialog.tsx` (`Users.tsx` Preview)

2. **Tatsächliche Stripe-Gebühr:** nein — weder `payments` noch Hauptbuch speichern Balance-Transaction-Fees (geplant 1b). Schätzung: **1,5 % + 0,25 €**.

3. **`invoke_ops_monitor`:** `net.http_post` ohne `timeout_milliseconds` → pg_net-Default **5000 ms** (`20261004130000`). Andere Invokes: `invoke_email_dispatch` schon 15 s; `invoke_provider_jobs` / `invoke_legal_pdf_jobs` / `invoke_retention_cleanup` ohne explizites Timeout (nicht angefasst).

4. **Widerruf „Meine Karten“:** `onDone` → `reload()` mit `loading=true` → frühes Return unmountet Dialog/Liste; `withdrawPass` blieb gesetzt → Dialog startete neu. Status „Widerrufen“ fehlte in der Inaktiv-Liste (`passInactiveLabel` = „storniert am …“ bzw. Resttermine). `pass_units_low` nur in `redeem_pass` bei Rest 1 (`20261004274000`); `void_pass_remaining` löst es nicht aus.

5. **Webhook `TENANT_NOT_RESOLVED`:** bei `provider_account.updated` und `tenant_id` null → `markProcessed` + HTTP 200 (kein Stripe-Retry). `mark_provider_event_failed` existierte für Transienten, wurde dafür nicht genutzt. Dedup behielt `tenant_id` null auch nach Kontozuordnung.

## A — Erstatten-Dialoge Gebührenhinweis

| | |
|---|---|
| Dateien | `src/lib/stripeFee.ts`, `src/lib/refundTexts.ts`, `PaymentRefundSheet.tsx`, `CourseCancelDialog.tsx`, `RemovePersonDialog.tsx`, `scripts/test/stripe_fee.ts`, `scripts/test/refund_texts.ts` |
| Commit | `37a9fc5` |
| Test | Unit: 15 € → 0,48 €; 1 € → 0,27 €; 8×15 → 3,84 €; Teilerstattung; Mehrfach-Text — grün |

## B — Kosten-Text Zahlungsseite

| | |
|---|---|
| Dateien | `src/features/payments/paymentSetupCopy.ts` (`FEES_BODY_TEXT`), Test in `stripe_fee.ts` |
| Commits | `f62e848`, `d4b042b` |
| Weitere Stellen | **Keine** Treffer mit gleichem Premium-/Gebührenabsatz in Onboarding, „Neu für dich“, Mails. Nur Docs/Epic (nicht angepasst). Marketing-FAQ bleibt allgemein („Gebühren deines Zahlungsanbieters“). |
| Test | Unit Kosten-Text — grün |

## C — ops-monitor Timeout 15 s

| | |
|---|---|
| Migration | `20261017120000_fs1_ops_monitor_timeout.sql` (DEV applied) |
| Commit | `689dcae` |
| Rechte-Audit | `has_timeout_15s=true`, `anon_exec=false`, `auth_exec=false` |
| Andere Invokes | `invoke_email_dispatch` schon 15 s; `invoke_provider_jobs`, `invoke_legal_pdf_jobs`, `invoke_retention_cleanup` ohne Timeout (nur Bericht) |
| Beleg | `b2_ops_monitor_smoke.mjs` OK; letzte `net._http_response` (30 min): `timed_out=0`, HTTP 200 |

## D — Kurskarte Widerruf

| | |
|---|---|
| Dateien | `MyPasses.tsx`, `MyPassesSection.tsx`, `passes.ts` (`passInactiveLabel` → „Widerrufen“), `k1_pass_online.mjs` (Assertion) |
| Commit | `c4c5e17` |
| Test | Soft-Reload + Status; `pass_units_low`-Assertion in K1. Voll-K1 auf DEV: `PLATFORM_DISABLED` (Allowlist) — Assertion liegt bereit; Code-Audit: nur `redeem_pass` enqueue’t `pass_units_low`. |

## E — Webhook TENANT_NOT_RESOLVED Retry

| | |
|---|---|
| Migration | `20261017130000_fs1_webhook_tenant_retry.sql` (Tenant nachlösen + `attempts`) |
| Function | `payments-webhook` DEV deployed |
| Dateien | `handler.ts`, `store.ts`, `handler_test.ts` |
| Commit | `c62ec92` |
| Verhalten | `provider_account.updated` + kein Tenant → HTTP 500 / `markFailed` bis `attempts >= 3`, dann `TENANT_NOT_RESOLVED` + 200 (ops-monitor Alarm wie bisher). Bei Nachlösen: verarbeiten, kein Alarm. |
| Rechte-Audit | `record_provider_event`: service_role EXECUTE, anon/authenticated false; `attempts` in Def |
| Test | Deno `handler_test.ts` 38/38 inkl. Race + Final — grün |

**Haltestelle E?** Nein — nur Wiederholungs-Pfad + nötiges Tenant-Nachlösen auf derselben Rohzeile; keine Policy-/Grant-Änderung, keine Datenumschreibung außer `tenant_id` NULL→gesetzt bei Retry.

## F — Prüfung

| Check | Ergebnis |
|---|---|
| Unit Gebühren / Texte B | grün |
| Deno Webhook | 38/38 grün |
| `npm run check:ci` | grün |
| Rechte-Audit C+E | grün (s. o.) |
| ops-monitor Smoke | OK, mailed=false |
| K1 voll | blockiert PLATFORM_DISABLED (Allowlist) |
| Integration „Kurs absagen 2 Online“ Dialog-Summe | Unit-Text `refundStripeFeeHintMulti(2, …)`; Klicktest Julius |

## Migrationen für PROD

**2** neu gegenüber Stand vor FS-1:

1. `20261017120000_fs1_ops_monitor_timeout.sql`
2. `20261017130000_fs1_webhook_tenant_retry.sql`

(Plus ggf. noch offene BC-1-Migrationen — separat, siehe `bc1_buchungsbestaetigung.md`.)

## PROD-Reihenfolge (nach Klicktest / Merge)

1. **Function** `payments-webhook` deployen (Retry-Logik), **bevor** oder zusammen mit Merge — sonst Race ohne Retry.
2. **Merge** Julius → main (Frontend A/B/D + Code).
3. **Migrationen** `db push` (C Timeout + E `record_provider_event`) — Timeout und Tenant-Nachlösen wirken erst mit Migration; Handler ohne Migration: `attempts` fehlt → Store default 0 → Retry trotzdem (immer transient bis … wait: without attempts always 0, so always retry forever!). Deshalb Migration **vor oder mit** Function-Deploy auf PROD zwingend, oder Function erst nach Migration.

Empfehlung PROD: **Migration → Function → Merge** (Frontend unabhängig). Alternativ Function+Migration in einem Fenster vor Merge.

## Klicktest Julius (DEV, demoalpha)

1. Owner: Online-Zahlung erstatten → Gebühren-Hinweis mit Betrag über dem Knopf.
2. Owner: Kurs mit mehreren Online-Zahlungen absagen → Summe im Dialog.
3. Einstellungen › Zahlungen → neuer Kosten-Text (kein Premium-Absatz 2,8 %).
4. Teilnehmer: Kurskarte online kaufen → widerrufen → Ansicht sofort „Widerrufen“, keine Mail „Karte fast aufgebraucht“.
5. (Cursor) ops-monitor: Timeout 15 s in Funktion; aktuelle `_http_response` ohne `timed_out`.

## STOPP

Warten auf Klicktest. **Kein PROD** ohne Freigabe.
