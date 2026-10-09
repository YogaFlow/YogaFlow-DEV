# Bericht — Release 2026-10 Phase 1 Bestandsaufnahme

Stand: 2026-10-09 · Branch `Julius` @ `99d8784` · **nur lesen** · Status: **angehalten (STOPP)**

Runbook: [docs/RELEASE_2026-10.md](../RELEASE_2026-10.md)

---

## Ampel-Übersicht

| § | Thema | Ampel | Kurz |
|---|--------|-------|------|
| 1 | Git | 🟢 | Probe-Merge konfliktfrei; Hotfixes #171/#174/#175 in Julius |
| 2 | Migrationen | 🟡 | 85 fehlend; `--include-all` nötig; A1/A2-Daten auf PROD ok; fachlich E5 |
| 3 | Rechte-Audit | 🟡 | DEV: kein PUBLIC-EXECUTE; 0-Policy-Tabellen service-only; `debug_request_tenant_header` noch da |
| 4 | Functions/Secrets/Cron/Storage | 🔴 | PROD ohne pg_cron; 9 Edge Functions fehlen; viele Secrets fehlen; Bucket `studio-legal` fehlt |
| 5 | PROD-Snapshot | 🟢 | Zählwerte aufgenommen; A2-Impact quantifiziert |
| 6 | Bekannte Risiken | 🟡 | Expand-Pfad plausibel; Signatur `register_for_course` mit Defaults; E8/E5 offen |

**Gesamt vor Freeze:** 🔴 — ohne Handgriffe (Cron-Extension, Secrets, Functions, Storage, E5/E8) kein GO.

---

## 1 — Git 🟢

| Ref | Hash |
|-----|------|
| `origin/main` | `5a40976` (Merge #175 Kurs-zuweisen mobil) |
| `origin/Julius` / HEAD | `99d8784` (RT-2 Abs. 3+4 Deploy-Nachweis) |

- Commits `Julius ∖ main`: **313**
- Diff: **549 Dateien**, **+130 875 / −1 275** Zeilen
- Probe-Merge `git merge-tree … origin/main origin/Julius`: **Exit 0, keine Konflikte** (nicht gepusht)
- Hotfixes auf `main` seit 17.09. — Ancestry in Julius:
  - #171 signup-role (`e5f7b80` / `eb3965c`) → ja
  - #174 teacher-guard (`3bcd961` / `f1845d3`) → ja
  - #175 Kurs-zuweisen mobil (`5a40976` / `6a9f380`) → ja  
  Merge `main`→Julius: `88c0694`

---

## 2 — Migrationen 🟡

### Bestand

| | Version (letzte) | Anzahl |
|--|------------------|--------|
| PROD applied | `20260928213000` `security_courses_teacher_guard_hotfix` | 114 |
| DEV / Repo Julius | `20261009140000` `rt2_agb_para9_abs3_abs4` | 199 |
| **Fehlend auf PROD** | ab `20260926141500` … | **85** |

Auf PROD liegen die Hotfixes `20260926160500` und `20260928213000`, aber **nicht** die dazwischen liegenden A1–S1-Migrationen (21 Versionen **vor** letzter PROD-Version).

→ **`db push --include-all` ist zwingend** (wie in `scripts/db.mjs` / CLAUDE.md).

### Risikoklassen (fehlende 85)

| Klasse | Bedeutung | Anzahl (Überlappung möglich) |
|--------|-----------|------------------------------|
| Funktion | CREATE/REPLACE FUNCTION | ~77 |
| RLS/Rechte | Policies, GRANT/REVOKE | ~72 |
| Constraint | NOT NULL, CHECK, UNIQUE, FK | ~69 |
| Daten/Backfill | top-level UPDATE/INSERT auf Bestand | siehe unten |
| Additiv | neue Tabellen/Spalten/Typen | ~27 |
| Test/Seed-verdächtig | Demo-/Guard-Kommentare | 5 Dateien (kein freier Demo-RPC) |

### Daten-Migrationen mit PROD-Wirkung (essentiell)

| Migration | Tabellen | PROD betroffen | Laufzeit-Schätzung | Vorbedingungen PROD | Ampel |
|-----------|----------|----------------|--------------------|---------------------|-------|
| `20260926141500` enum `cancelled` | — | 0 Zeilen | &lt;1 s | — | 🟢 |
| `20260926141501` A1 Soft-Cancel | `registrations` | **8** mit `cancellation_timestamp` (5 registered + 3 waitlist → `cancelled`/`legacy_closed`) | &lt;1 s | status NULL=0; aktive Duplikate course+user=0; orphan course/user=0 | 🟢 |
| `20260926190000` A2 coverage+price | `registrations` | **325** alle Zeilen: `coverage_status` + `price_cents_at_booking` | wenige s | price NULL=0; alle Kurse preis &gt;0 → alle **open** (0 free) | 🟢 technisch / 🟡 fachlich E5 |
| `20260928203500` platform_flags | neu | INSERT `online_payments` default aus | &lt;1 s | — | 🟢 |
| `20261002114000` refund-job backfill | `provider_jobs` | Tabelle existiert nicht → 0 | &lt;1 s | — | 🟢 |
| `20261004180000` AVV-Hash | `legal_document_versions` | Tabelle fehlt → wird vorher angelegt; Backfill nur vorhandene Zeilen | &lt;1 s | — | 🟢 |
| `20261006120000` UX-7 | `tenants` | **5** `pass_hint_enabled=false` | &lt;1 s | — | 🟢 |
| `20261008200000`+`09120000`+`09140000` RT-2 | `legal_document_versions` | INSERT Omlify AGB/Datenschutz-Hashes | &lt;1 s | — | 🟢 |

**A2 fachlich (E5):** Nach Backfill wären **alle 325** Anmeldungen `open` (kein Kurs mit Preis 0). Davon aktiv (registered/waitlist):

| Tenant-Präfix | Vergangenheit → open | Kommend → open | Aktiv gesamt |
|---------------|----------------------|----------------|--------------|
| `892370b8` | 199 | 111 | 310 |
| `5110be00` | 7 | 2 | 9 |
| `1ffd7778` | 6 | 0 | 6 |

→ Pilot-Studio (vermutlich `892370b8`) sieht nach Release massiv „offen“. Entscheidung E5 bleibt.

### Testhelfer / Seed auf PROD?

- Keine `demo_*`/`seed_*`-RPCs in `public` mit Client-EXECUTE gefunden.
- `record_service_ping`: SECURITY DEFINER, `authenticated`+`service_role` (bewusst Testwerkzeug, schon vor Geldkette).
- `debug_request_tenant_header`: noch vorhanden, `authenticated` EXECUTE — Stufe-4-Aufräumen offen (bekannt).
- RT-2-/A9-/4.3-Migrationen: Selbstchecks + Cron; keine offenen Seed-INSERT für Demo-Nutzer.
- Demo-Secrets (`DEMO_*`) liegen nur auf DEV Edge Secrets — **nicht** nach PROD kopieren.

---

## 3 — Rechte-Audit (Lehre B1) 🟡

Gemessen auf **DEV** (Zielbild nach Push).

### SECURITY DEFINER — EXECUTE-Zusammenfassung

| Schema | SecDef gesamt | anon | authenticated | PUBLIC | service_only (kein Client) |
|--------|---------------|------|---------------|--------|----------------------------|
| `public` | 138 | **3** | 69 | **0** | 62 |
| `yogaflow_private` | 98 | **0** | 10 (RLS-Helfer) | **0** | 83 |

**anon EXECUTE (bewusst öffentlich):**

- `get_public_studio_legal(text)` — Tenant aus Header
- `lookup_pass_withdrawal_public` / `confirm_pass_withdrawal_public` — Beleg+E-Mail+Rate-Limit

**Heuristik „keine Rollenprüfung im Körper“** bei Client-EXECUTE: nach Nachlesen falsch-positiv für `get_course_participant_counts` (nutzt `get_my_tenant_id`). `get_receipt_by_payment` delegiert an `get_receipt` (hat Rollenprüfung). Öffentliche Withdrawal-/Legal-RPCs: Tenant/Beleg-gebunden, kein Staff-Bypass.

**Soll:** Nach jeder Migration `REVOKE ALL … FROM PUBLIC, anon, authenticated` + gezielte GRANTs. DEV-Selbstchecks in vielen Geldkette-Migrationen prüfen das.

### Neue Tabellen — RLS

Alle geprüften Geldkette-/Legal-Tabellen: **`relrowsecurity = true`**.

| Muster | Beispiele | Bewertung |
|--------|-----------|-----------|
| SELECT-Policy für Manager/Own | `payments`, `passes`, `receipts`, `ledger_*`, `legal_acceptances`, … | ok |
| 0 Policies, anon/auth SELECT=false, service_role SELECT=true | `platform_flags`, `provider_events_raw`, `provider_jobs`, `ops_alerts`, `email_deliveries`, `payment_refunds`, `payment_disputes`, … | fail-closed über Default-REVOKE + RLS (wie Plattformtabellen) |

### Append-only / Immutability (DEV Trigger, Auszug)

Vorhanden u. a.: `payments_no_delete`/`payments_immutable`, `receipts_append_only`, `legal_acceptances_append_only`, `pass_movements_append_only`, `ledger_entries_append_only`, `provider_events_raw_*`, `events`/`audit_log` append-only, `platform_flag_changes_append_only`, `registrations_price_immutable`.

---

## 4 — Edge Functions, Secrets, Cron, Storage, Cloudflare, Webhooks 🔴

### Edge Functions

| | DEV | PROD |
|--|-----|------|
| Anzahl ACTIVE | 20 | 11 |
| Stand zuletzt | 2026-10-07 (meiste) | 2026-09-17 … 09-26 |

**Neu auf DEV, fehlen auf PROD:**

| Function | verify_jwt (`config.toml`) |
|----------|----------------------------|
| `payments-webhook` | false |
| `payments-onboarding` | false |
| `payments-checkout` | false |
| `payments-jobs` | false |
| `dispatch-emails` | false |
| `ops-monitor` | false |
| `legal-pdf` | false |
| `calendar-ics` | false |
| `reset-passwords` | (Altbestand DEV, nicht in Repo-`functions/` — klären/löschen) |

Bereits auf beiden: Mail-/Auth-Functions, `onboarding-public`, `update-user`, `delete-user`, `service-ping`, `set-participant-password`.

### Secrets (nur Namen, Edge `supabase secrets list`)

**PROD hat:** `APP_BASE_DOMAIN`, `APP_URL`, `INTERNAL_EMAIL_SECRET`, `SENDER_EMAIL`, `SMTP_*`, `SUPABASE_*` (plattform).

**Auf PROD fehlend (Release-Tag / Phase 6):**

| Name | Wann | Hinweis |
|------|------|---------|
| `EMAIL_DISPATCH_SECRET` | Release | Cron dispatch-emails |
| `PROVIDER_JOBS_SECRET` | Release | payments-jobs |
| `OPS_MONITOR_SECRET` | Release | ops-monitor |
| `OPS_ALERT_EMAIL` | Release | E6 |
| `OPS_HEARTBEAT_URL` | optional | auch DEV ungesetzt |
| `LEGAL_PDF_SECRET` | Release | legal-pdf (+ ggf. Vault) |
| `CALENDAR_ICS_SECRET` | Release | calendar-ics |
| `PAYMENTS_MODE` | Release = `test` oder aus; Phase 6 = `live` | Stripe-Modus |
| `STRIPE_SECRET_KEY` | Phase 6 live; Release ggf. leer/Platzhalter | nie Test-Key auf PROD-Live |
| `STRIPE_WEBHOOK_SECRET` / `_THIN` / `_2` | Phase 6 | Live-Endpunkte |
| `EMAIL_REDIRECT_TO` | **nicht setzen** auf PROD | korrekt abwesend |

**DEV-only — nicht nach PROD:** `DEMO_*`, `DEMO_PASSWORT`, `EMAIL_REDIRECT_TO`.  
**DEV-Auffälligkeit:** doppelter Name `ops_monitor_SECRET` neben `OPS_MONITOR_SECRET` — vor PROD-Secrets bereinigen.

Vault (`vault.secrets`): in dieser Phase nicht ausgelesen (Auto-Review); STAND nennt `LEGAL_PDF_SECRET` im Vault auf DEV — am Release-Tag mit Dashboard/CLI Namen prüfen.

### Cron

| | DEV | PROD |
|--|-----|------|
| `pg_cron` | ja, 10 Jobs | **Extension fehlt** (`cron.job` Relation existiert nicht) |

DEV-Jobs (alle active):

| Job | Schedule (UTC) | Ziel |
|-----|----------------|------|
| `yogaflow_dispatch_emails` | `* * * * *` | `invoke_email_dispatch` |
| `yogaflow_expire_payment_holds` | `* * * * *` | `expire_payment_holds` |
| `yogaflow_expire_pass_payment_attempts` | `* * * * *` | `expire_pass_payment_attempts` |
| `yogaflow_process_provider_jobs` | `* * * * *` | `invoke_provider_jobs` |
| `yogaflow_process_legal_pdf` | `* * * * *` | `invoke_legal_pdf_jobs` |
| `yogaflow_process_ledger` | `*/5 * * * *` | `process_ledger` |
| `yogaflow_ops_monitor` | `*/15 * * * *` | `invoke_ops_monitor` |
| `yogaflow_expire_passes` | `5 * * * *` | `expire_passes` |
| `yogaflow_pass_expiry_reminders` | `15 6 * * *` | `enqueue_pass_expiry_reminders` |
| `yogaflow_retention_cleanup` | `15 3 * * *` | `invoke_retention_cleanup` |

Anlage: Migrationen rufen `CREATE EXTENSION IF NOT EXISTS pg_cron` + `cron.schedule` auf (z. B. A6-3, A7-1, 2.1b, Stripe-Jobs, B2, K1, RT-1, RT-2).  
**Handgriff:** In Supabase PROD Dashboard Extensions → `pg_cron` freischalten **bevor**/`während` Push; nach Push Jobs zählen (=10). Ohne Extension scheitert der Push an Cron-Migrationen.

### Storage

| Bucket | DEV | PROD |
|--------|-----|------|
| `studio-branding` (public) | ja | ja (2 Objekte gesamt) |
| `studio-legal` (private) | ja | **fehlt** |

→ Mit RT-1-Migration anlegen (oder Handgriff, falls Migration das Bucket erwartet). Policies auf DEV mitziehen.

### Cloudflare Build-Variablen (Namen)

Worker: DEV `omlify-dev` ← Branch Julius; PROD `yogaflow-dev` ← Branch main (`wrangler.jsonc`).

| Variable | DEV erwartet | PROD Release (Schalter aus) | Phase 6 |
|----------|--------------|-----------------------------|---------|
| `VITE_SUPABASE_URL` | DEV | PROD | — |
| `VITE_SUPABASE_ANON_KEY` | DEV | PROD | — |
| `VITE_APP_BASE_DOMAIN` | `omlify-dev.de` | `omlify.de` | — |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | **leer** | `pk_live_…` |
| `VITE_PAYMENTS_MODE` | `test` | **leer/aus** | `live` |

Dashboard-Vergleich yogaflow-dev vs omlify-dev in dieser Phase nicht API-gelesen — Julius prüft Namen im Cloudflare UI.

### Stripe-Webhooks (Vorlage Live = Phase 6)

URL: `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook`

- **Verbundene Konten / Snapshot** (`STRIPE_WEBHOOK_SECRET`):  
  `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
- **Plattform / Thin** (`STRIPE_WEBHOOK_SECRET_THIN`): v2 account.* — Liste vom DEV-Ziel abschreiben (Dashboard).

Am Release-Abend **keine** Live-Webhooks nötig (Schalter aus; Function ohne Secret → `CONFIG_ERROR`).

---

## 5 — PROD-Snapshot (Zählwerte) 🟢

Erfasst 2026-10-09 (Vergleichsbasis vor Release).

| Metric | n |
|--------|---|
| tenants | 5 |
| users total | 56 |
| users owner / admin / teacher / user | 4 / 2 / 1 / 49 |
| auth.users | 57 |
| auth ohne Profil | **2** |
| tenants ohne Owner | **1** (`7038931e…`, 0 users) |
| courses total / upcoming | 51 / 13 |
| registrations total | 325 |
| registrations registered / waitlist | 312 / 13 |
| mit cancellation_timestamp (→ A1 cancelled) | 8 |
| messages | 12 |
| user_notifications | 63 |
| payments / coverage_status | Tabellen/Spalten **fehlen** noch |
| storage.objects | 2 |
| storage.buckets | 1 (`studio-branding`) |

Je Tenant-Präfix (users / courses / regs):  
`892370b8` 45/37/310 · `5110be00` 6/8/9 · `1ffd7778` 4/6/6 · `7038931e` 0/0/0 · `a95a11ec` 1/0/0

**A2 „würde open“:** siehe §2 (212 Vergangenheit + 113 kommend aktiv ≈ 325 open nach Backfill inkl. stornierter Altzeilen).

---

## 6 — Bekannte Risiken 🟡

### Altes Frontend gegen neues Schema (Expand)

Reihenfolge Runbook: Migrationen → Functions → Merge Frontend. Altes `main`-Frontend:

| Stelle | Risiko | Einschätzung |
|--------|--------|--------------|
| `register_for_course` nur `{ p_course_id }` | Signatur jetzt `(uuid, boolean DEFAULT false, text DEFAULT null)`; alte `(uuid,uuid)` gedroppt | 🟢 named args + Defaults — in Generalprobe belegen |
| `unregister_from_course` nur `{ p_course_id }` | Soft-Cancel statt DELETE; `p_user_id` optional | 🟢 |
| Listen filtern `cancellation_timestamp IS NULL` | A1 setzt Status cancelled konsistent | 🟢 |
| Neue Spalten `coverage_*` | Alt liest sie nicht | 🟢 |
| Neue RPCs/Seiten (Kasse, Zahlungen, Legal) | Alt ruft sie nicht | 🟢 |
| Admin `p_user_id` an Enroll-RPCs | Signaturen prüfen in Probe | 🟡 |
| Hard-Delete Kurse mit Anmeldungen | schon RESTRICT auf PROD | 🟢 |

**Brechen könnte:** PostgREST-Fehler wenn Client noch `p_user_id` an `register_for_course` schickt (main tut das nicht). Rückgabe-JSON mit neuen Keys — Alt ignoriert meist.

### E-Mail / Redirect

- `EMAIL_REDIRECT_TO` auf PROD **nicht** gesetzt — korrekt.
- `SENDER_EMAIL` / SMTP auf PROD vorhanden (Namen). Domain/Absender-Inhalt nicht ausgelesen — Julius smoke nach Release.

### ops-monitor

- Empfänger: Secret `OPS_ALERT_EMAIL` auf PROD **fehlt** → E6.
- `OPS_HEARTBEAT_URL` DEV+PROD ungesetzt — optional, kein Blocker für Schalter-aus-Release.

### Rechtstexte

- Apex `/legal/*` v2 kommt mit Frontend-Merge; Bestands-Owner (Yomita): Banner AVV/AGB ohne Sperre (RT-1/RT-2 Design) — in Probe/Abnahme klicken.
- Studio-Rechtstexte-Bucket `studio-legal` muss existieren bevor PDF-Jobs laufen.

### retention_cleanup am ersten Tag auf PROD

Löscht nur: `ops_alerts` (resolved &gt;90d), `email_deliveries` (&gt;12m), `provider_events_raw` (&gt;13m processed/reviewed), verwaiste `legal_acceptances` (&gt;3y).  
Diese Tabellen sind auf PROD **heute nicht vorhanden** → nach Migrationen leer bzw. frisch → **erster Lauf löscht 0** (solange keine Altlasten importiert werden).

---

## Muss vor Freeze behoben / entschieden werden

1. **E5** — Alt-Anmeldungen „offen“ mit Testkundin klären (A8 Bulk „vor Omlify erledigt“).
2. **E8** — Hotfix Sitzung & App-Version vor Freeze.
3. **pg_cron auf PROD** freischalten; Push mit `--include-all`; 10 Jobs verifizieren.
4. **Rechte-Audit auf Probe** nach Migrationen wiederholen (nicht nur DEV).
5. **`debug_request_tenant_header`** — Stufe 4: entfernen oder EXECUTE entziehen vor/mit Release?
6. DEV Secret-Duplikat `ops_monitor_SECRET` bereinigen; PROD-Secret-Liste aus §4 setzen (ohne DEMO/EMAIL_REDIRECT).
7. Edge Function `reset-passwords` auf DEV (Alt) — nicht nach PROD deployen.
8. Cloudflare PROD-Variablen: Stripe-VITE leer bis Phase 6.
9. Generalprobe auf PROD-Kopie (E3) mit Durchlauf A (altes Frontend) — Pflicht wegen Signatur-/Soft-Cancel.

---

## Handgriffe am Release-Tag

1. Backup PROD (Actions) + Snapshot Zählwerte (diese Tabelle als Vorlage).
2. Extension `pg_cron` → Migrationen `npm run db:push:prod -- --include-all` (**Julius tippt**, B5).
3. Secrets setzen (Namen §4; `PAYMENTS_MODE` nicht live; kein `EMAIL_REDIRECT_TO`).
4. Edge Functions deployen (alle aus Repo; verify_jwt wie config.toml).
5. Cron-Jobs zählen; `ops-monitor` einmal ohne Fehlalarm.
6. Storage: `studio-legal` + Policies prüfen.
7. PR merge → Cloudflare `yogaflow-dev` Build success + Bundle-Merkmal.
8. Smoke omlifytest; Yomita nur ansehen.
9. **Nicht** am Tag: Live-Stripe-Webhooks/Keys (Phase 6).

---

## Offene Fragen an Julius

1. E1–E9: welche Empfehlungen aus dem Runbook übernimmst du unverändert? Besonders **E5** (212+ vergangene „offen“ bei `892370b8…`) und **E8**.
2. Tenant ohne Owner (`7038931e…`) und 2 auth-ohne-Profil: vor Release aufräumen oder dokumentiert ignorieren?
3. Soll `debug_request_tenant_header` noch im Release bleiben?
4. Cloudflare yogaflow-dev: sind `VITE_SUPABASE_*` und `VITE_APP_BASE_DOMAIN` schon PROD-korrekt? (hier nicht API-gelesen)
5. Mail-Absender-Domain PROD: bestätigt `SENDER_EMAIL` / SPF wie gewünscht?
6. Probe-Projekt (E3): Wegwerf-Ref und Zeitfenster?

---

## STOPP

Phase 1 abgeschlossen. Keine Schreibzugriffe auf PROD. Kein Commit in diesem Lauf (Bericht liegt uncommitted unter `docs/berichte/release_2026-10_bestandsaufnahme.md`). Wartet auf Julius: Entscheidungen E1–E9 / Freigabe Phase 2.
