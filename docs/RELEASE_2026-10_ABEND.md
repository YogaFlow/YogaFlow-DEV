# Release 2026-10 — Abend-Checkliste

**Ausgeführt 15.10.2026 — GO.** Bericht: [berichte/release_2026-10_abend.md](berichte/release_2026-10_abend.md). Die Schritte unten sind der Ablauf des Abends.

**Freeze:** `release-2026-10-freeze` = `origin/Julius` (NU-1 Zuklappen-Toggle) · Branch `Julius` · PROD-Migrationen zum Abend fehlend **92** (danach angewendet) · Release-Reihenfolge unverändert  
Der Hash steht nicht in dieser Datei: er ist der Commit, auf den der Tag zeigt. Ein zweiter Doku-Commit nur für den Hash würde das Bundle wieder ändern.
**Wer:** **J** = Julius tippt/klickt · **C** = Cursor (nur nach Freigabe, nie PROD-Passwort im Chat)  
**Passwort / Secrets / Keys:** nur Terminal oder Dashboard — **nie in Chat/Bericht**.

### Lehren aus der Probe (nicht verhandeln)

| Regel | Detail |
|-------|--------|
| Windows | immer `npx.cmd`, nie bloßes `npx` |
| DB-Push | nur Pooler `:5432` mit `--db-url`; Passwort **in der URL** (wie `scripts/db.mjs` / `dev_apply.mjs` auf DEV — nicht nur `$env:SUPABASE_DB_PASSWORD` neben einer URL ohne Passwort) |
| Secrets | vor `secrets set`: PROD verlinken **oder** jedes Mal `--project-ref <PROD-REF>`. Ohne PROD-Link landen Secrets auf **DEV**. Danach `secrets list --project-ref <PROD-REF>` |
| Ein Versuch | Push bricht ab → **STOPP**, Stand prüfen (`db:status:prod` / Migrationen). **Kein** blinder Zweitversuch |
| Ref-Check | vor jedem PROD-Befehl: URL/Keys zeigen auf PROD-Ref, nicht DEV |
| Bundle nach Deploy | Nach **jedem** Frontend-Deploy (Schritt 15b und 18, gleich auf DEV `omlify-dev`): (1) aus der live `index.html` die `/assets/index-….js` direkt abrufen, `Content-Type` muss JavaScript sein, der Body darf nicht mit `<!doctype` beginnen. (2) `/assets/index-missing-probe.js` muss **404** sein, ohne `immutable` und ohne `text/html`. HTML, `200` oder `immutable` auf der Probe → Rollback auf den **vorigen** Deploy im Cloudflare-Dashboard. Kein neuer Build als erster Reflex. |

Quellen: [Generalprobe](berichte/release_2026-10_generalprobe.md) · [Freeze](berichte/release_2026-10_freeze_vorbereiten.md) · [Stripe-Live §3/§5](berichte/release_2026-10_stripe_live_vorbereitung.md) · [Pre-PROD](DEV_PROD_SAFETY_WORKFLOW.md)

---

## T–60 — Vorbereitung

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 0 | Freeze prüfen | J/C | `git fetch --tags`; `git rev-parse HEAD origin/Julius "release-2026-10-freeze^{}"` | alle drei derselbe Commit (NU-1 Zuklappen-Toggle) | einer weicht ab → kein Abend |
| 1 | Backup PROD | J | GitHub Action `backup-prod` bzw. üblicher PROD-Backup | grün / frisch | Backup fehlt → STOPP |
| 2 | Snapshot Zählwerte | J/C | SQL unter **Schritt 2 / 11 — Snapshot** (inkl. Sollwerte); Abweichung von Soll **vorher erklären**, bevor gepusht wird | notiert; Soll ok oder erklärt | unklare Abweichung → STOPP |
| 3 | Pre-PROD-Checkliste | J | [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) | abgehakt | Zweifel → STOPP |
| 4 | **T0-0 Extensions** | J | Supabase PROD → Database → Extensions: **`pg_cron` + `pg_net` aktiv** | beide installed | fehlen → vor Push aktivieren; bei Push-Fehler `2BP01`/extension: Dashboard, dann Stand prüfen, **nicht** blind neu pushen |
| 5 | **T0-0 Vault** | J | Vault-Secrets anlegen (Namen unten), Werte = **PROD**-Function-URLs + frische Secrets | 8 Namen vorhanden | DEV-URL im Vault → STOPP, korrigieren |
| 6 | Link PROD | J | `npx.cmd supabase link --project-ref <PROD-REF>` (Passwort nur im Terminal-Prompt) | linked PROD | falsche Ref → STOPP. **Ohne PROD-Link landen Secrets auf DEV.** |
| 7 | Edge-Secrets (ohne Stripe) | J | `npx.cmd supabase secrets set … --project-ref <PROD-REF>` (oder nach Schritt 6 ohne Flag, aber dann muss Link PROD sein) — siehe Tabelle unten; danach `npx.cmd supabase secrets list --project-ref <PROD-REF>` | Namen gelistet auf **PROD**; **kein** `EMAIL_REDIRECT_TO`, kein `DEMO_*` | Liste zeigt DEV / `EMAIL_REDIRECT_TO` gesetzt → STOPP |
| 8 | Cloudflare **vor Merge** | J | Worker **`yogaflow-dev`** (PROD←`main`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_BASE_DOMAIN=omlify.de`; Stripe-VITE **leer** | Namen stimmen | DEV-Keys auf PROD-Worker → STOPP |
| 9 | Stripe Dashboard vorbereiten | J | Live-Modus: Webhook-Ziele anlegen (noch ohne Schalter), Secrets notieren (lokal) | 2 Endpunkte bereit | — |

**Vault PROD** (`https://<PROD_REF>.supabase.co/functions/v1/…`):

`email_dispatch_url` + `email_dispatch_secret` · `ops_monitor_url` + `ops_monitor_secret` · `provider_jobs_url` + `provider_jobs_secret` · `legal_pdf_url` + `legal_pdf_secret`

**Edge-Secrets Release-Tag (Stripe noch leer):** `EMAIL_DISPATCH_SECRET`, `PROVIDER_JOBS_SECRET`, `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`, `LEGAL_PDF_SECRET`, `CALENDAR_ICS_SECRET`; optional `OPS_HEARTBEAT_URL`. `PAYMENTS_MODE` / `STRIPE_*` **leer** bis Phase 6. SMTP/APP_* behalten.

---

## Phase 5 — Schema · Functions · Frontend

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 10 | DB push | J | siehe Befehl unten (Passwort **in** `--db-url`, nur Terminal); PROD weiterhin verlinkt | applied bis `20261015193000` (NU-1 Teil 2; **92** fehlende vor Push) | Abbruch → **STOPP**, Status prüfen; **kein** zweiter Push ohne Diagnose |
| 11 | Post-Push prüfen | J/C | SQL-Blöcke unter **Schritt 11** (Flag/Allowlist/Cron/Bucket + letzte Migration + `studio_update_releases` + Rechte-Audit + Snapshot vs. Schritt 2 / Soll) | alles wie erwartet | Flag schon an / Allowlist nicht leer → Flag aus, Liste leeren, Ursache klären; Rechte ≠ Soll → STOPP |
| 12 | Functions deploy | J | alle Repo-Functions; **nicht** `reset-passwords`; `--project-ref <PROD-REF>` falls nicht verlinkt | deploy ok; Payment ohne Stripe-Secret → `CONFIG_ERROR` ok | — |
| 13 | ops-monitor einmal | J | Cron/Invoke | Mail nur an Julius | Spam/fremde Adresse → Secret prüfen |
| 13a | **Aktive Prüfungen** | J | SQL unter **Schritt 13a** (kein Mail-Probe) | Handaufrufe + `net._http_response` 200; Retention-Zählung alle 0 (sonst kein Cleanup); Pass-Reminder-Zählung 0 oder Julius ok; `job_run_details` ~10 min später ohne Fehler | siehe Abbruch in 13a |
| 14 | PR `Julius`→`main` | J | GitHub Merge Freeze-Stand | Merge grün | CI rot → kein Merge |
| 15 | Cloudflare-Build | J | Workers Builds PROD abwarten | `success`; `version.json` = Merge-SHA | Build rot → Rollback Frontend (§ Rückweg) |
| 15b | Bundle ist JavaScript, fehlendes Asset ist 404 | J/C | Studio-Subdomain (z. B. `yomita.omlify.de`): `index.html` lesen, die darin genannte `/assets/index-….js` **direkt** abrufen. Danach `/assets/index-missing-probe.js` | JS: `200`, `Content-Type` JavaScript, Body beginnt nicht mit `<!doctype`. Probe: `404`, `Cache-Control` ohne `immutable`, nicht `text/html` | HTML, `200` oder `immutable` auf der Probe → Cloudflare-Dashboard: Rollback auf den vorigen Deploy von `yogaflow-dev`. Nicht sofort neu bauen |
| 16 | Smoke Plattform aus | J | `yomita.omlify.de` Owner: **kein** Stripe-/Online-Abschnitt | Plattform aus sichtbar | Online sichtbar trotz Flag aus → Kill-Switch prüfen, STOPP |
| 16a | **Mail-Probe Rechtstexte** | J | `omlifytest`: Rechtstexte freigeben (falls nötig) → **Online-Buchung** → Bestätigung **mit AGB-PDF** kommt an. Vor-Ort hat noch keine Bestätigung. | Mail inkl. AGB-PDF angekommen | fehlt → **STOPP vor Phase 6** |

### Schritt 10 — Push-Befehl (Generalprobe / DEV-Muster)

Passwort steht **in der URL** (wie `scripts/db.mjs` Zeile `postgresql://postgres.${ref}:${encodeURIComponent(password)}@…`). `$env:SUPABASE_DB_PASSWORD` allein reicht bei `--db-url` ohne Passwort-Teil **nicht** — die CLI liest dann kein Passwort aus der Env in die URL.

```powershell
# nur Terminal — Passwort nie in Chat/Bericht/History-Datei
npx.cmd supabase db push --include-all --db-url "postgresql://postgres.<PROD-REF>:<PROD-DB-PASSWORT>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
```

Sonderzeichen im Passwort: URL-encoden (oder vorher in PowerShell `[uri]::EscapeDataString('<pass>')`). Bei Abbruch: **STOPP**, Stand prüfen — kein sofortiger Zweitversuch.

### Schritt 2 / 11 — Snapshot (Zählwerte + Soll aus Freeze/Generalprobe)

Vor Push (Schritt 2) und nach Push (Schritt 11) dieselben Kern-Abfragen; Werte notieren und vergleichen. **Abweichung vom Soll vor dem Push erklären** (oder STOPP).

**Soll (PROD-Stand Bestandsaufnahme / Freeze §4, vor Migrationen bzw. erwarteter A2-Backfill):**

| Metric | Soll |
|--------|------|
| `registrations` gesamt | **325** |
| A1 Alt-Stornos (`cancellation_timestamp IS NOT NULL`) | **8** |
| A2 open Tenant `892370b8…` Vergangenheit / kommend | **191** / **111** (nach A2-Migration; Freeze) |

```sql
-- Kernzählwerte
SELECT 'tenants' AS metric, count(*)::bigint AS n FROM public.tenants
UNION ALL SELECT 'users', count(*) FROM public.users
UNION ALL SELECT 'users_owner', count(*) FROM public.users WHERE role = 'owner'
UNION ALL SELECT 'users_admin', count(*) FROM public.users WHERE role = 'admin'
UNION ALL SELECT 'users_teacher', count(*) FROM public.users WHERE role = 'teacher'
UNION ALL SELECT 'users_user', count(*) FROM public.users WHERE role = 'user'
UNION ALL SELECT 'auth_users', count(*) FROM auth.users
UNION ALL SELECT 'courses', count(*) FROM public.courses
UNION ALL SELECT 'registrations', count(*) FROM public.registrations
UNION ALL SELECT 'registrations_registered', count(*) FROM public.registrations WHERE status = 'registered'
UNION ALL SELECT 'registrations_waitlist', count(*) FROM public.registrations WHERE status = 'waitlist'
UNION ALL SELECT 'messages', count(*) FROM public.messages
UNION ALL SELECT 'user_notifications', count(*) FROM public.user_notifications
ORDER BY 1;
-- registrations = 325 (vor Push erklären, wenn anders)

-- A1 (vor und nach Push; Spalte existiert auf PROD schon)
SELECT count(*) AS a1_legacy_cancel
FROM public.registrations
WHERE cancellation_timestamp IS NOT NULL;
-- Soll: 8

-- A2 open bei 892370b8… (nur NACH Push, Spalte coverage_status)
-- Vor Push: weglassen. Nach Push: Soll 191 Vergangenheit + 111 kommend.
SELECT
  count(*) FILTER (
    WHERE r.coverage_status = 'open'
      AND c.date < (timezone('Europe/Berlin', now()))::date
  ) AS past_open,
  count(*) FILTER (
    WHERE r.coverage_status = 'open'
      AND c.date >= (timezone('Europe/Berlin', now()))::date
  ) AS upcoming_open,
  count(*) AS regs_tenant
FROM public.registrations r
JOIN public.courses c ON c.id = r.course_id
WHERE r.tenant_id::text LIKE '892370b8%';
-- Soll: past_open = 191, upcoming_open = 111 (Freeze); regs_tenant ≈ 310 aktiv + Stornos
```

### Schritt 11 — Post-Push SQL

```sql
-- Plattform / Allowlist / Cron / Bucket
SELECT key, enabled FROM public.platform_flags WHERE key = 'online_payments';
-- erwartet: enabled = false

SELECT mode FROM public.online_payments_rollout;
-- erwartet: allowlist

SELECT count(*) AS allowlist_n FROM public.online_payments_studio_allowlist;
-- erwartet: 0

SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'yogaflow_%'
ORDER BY jobname;
-- erwartet: genau 10 Zeilen, alle active

SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'studio-legal';
-- erwartet: 1 Zeile, privat

-- letzte Migration
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 1;
-- erwartet: 20261015193000

-- studio_update_releases: PROD startet leer (kein Demo-Slug-Seed)
SELECT count(*) AS releases_n FROM public.studio_update_releases;
-- erwartet: 0

SELECT c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'studio_update_releases';
-- erwartet: true

SELECT policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'studio_update_releases';
-- erwartet: 0 Zeilen

-- Rechte-Audit (wie Bestandsaufnahme §3 / Generalprobe-Ziel): PUBLIC EXECUTE = 0; anon nur 3 RPCs
SELECT n.nspname AS schema, count(*) AS public_execute_secdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname IN ('public', 'yogaflow_private')
  AND has_function_privilege('public', p.oid, 'EXECUTE')
GROUP BY 1
ORDER BY 1;
-- erwartet: keine Zeilen (oder count 0)

SELECT n.nspname AS schema,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1, 2, 3;
-- erwartet genau 3:
--   confirm_pass_withdrawal_public
--   get_public_studio_legal
--   lookup_pass_withdrawal_public

SELECT n.nspname AS schema, count(*) AS anon_execute_secdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname = 'yogaflow_private'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
GROUP BY 1;
-- erwartet: keine Zeilen
```

Danach Snapshot-SQL von oben erneut (inkl. A2) → mit Schritt 2 / Soll vergleichen.

---

### Schritt 13a — Aktive Prüfungen (~30 min; Stripe-Live-Bericht §3 / §5 D)

Kein Mail-Probe hier → Schritt **16a**.

**1) Retention vorher zählen** (welche Zeilen `retention_cleanup` löschen würde):

```sql
SELECT
  (SELECT count(*) FROM public.ops_alerts
   WHERE resolved_at IS NOT NULL
     AND resolved_at < now() - interval '90 days') AS ops_alerts_del,
  (SELECT count(*) FROM public.email_deliveries
   WHERE created_at < now() - interval '12 months') AS email_deliveries_del,
  (SELECT count(*) FROM public.provider_events_raw
   WHERE received_at < now() - interval '13 months'
     AND (processed_at IS NOT NULL OR reviewed_at IS NOT NULL)) AS provider_events_raw_del,
  (SELECT count(*) FROM public.legal_acceptances
   WHERE tenant_id IS NULL
     AND accepted_at < now() - interval '3 years') AS legal_acceptances_del;
```

**Abbruch:** eine der Zählungen **> 0** → `invoke_retention_cleanup()` **nicht** auslösen; Julius entscheidet.

**2) Pass-Ablauf-Reminder vorher zählen** (Spalten wie `enqueue_pass_expiry_reminders`: `status`, `valid_until`, Berlin-Datum):

```sql
SELECT count(*) AS passes_expiring_within_7d
FROM public.passes
WHERE status = 'active'
  AND valid_until >= (timezone('Europe/Berlin', now()))::date
  AND valid_until <= (timezone('Europe/Berlin', now()))::date + 7;
```

**Abbruch:** count **> 0** → `enqueue_pass_expiry_reminders()` **nicht** auslösen, bis Julius entscheidet.

**3) Jobs von Hand** (Commands wie in `cron.job`; Retention / Reminder nur wenn Zählung 0 bzw. freigegeben):

```sql
SELECT yogaflow_private.invoke_email_dispatch();
SELECT yogaflow_private.expire_payment_holds();
SELECT yogaflow_private.expire_pass_payment_attempts();
SELECT yogaflow_private.invoke_provider_jobs();
SELECT yogaflow_private.invoke_legal_pdf_jobs();
SELECT yogaflow_private.process_ledger();
SELECT yogaflow_private.invoke_ops_monitor();
SELECT yogaflow_private.expire_passes();
-- nur wenn Pass-Zählung = 0 oder Julius ok:
SELECT yogaflow_private.enqueue_pass_expiry_reminders();
-- nur wenn alle Retention-Zählungen = 0 oder Julius ok:
SELECT yogaflow_private.invoke_retention_cleanup();
```

**4) Sofort danach — `net._http_response` (pg_net-Aufrufe der invoke_*-Jobs):**

```sql
SELECT id, status_code, left(content::text, 200) AS content_head, created
FROM net._http_response
ORDER BY id DESC
LIMIT 10;
-- erwartet: status_code = 200 (für die soeben ausgelösten Calls)
```

**5) `cron.job_run_details` — nur reguläre Cron-Läufe** (Hand-`SELECT`s erscheinen dort **nicht**). Ca. **10 Minuten später** prüfen:

```sql
SELECT j.jobname, d.status, d.return_message, d.start_time, d.end_time
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname LIKE 'yogaflow_%'
  AND d.start_time > now() - interval '2 hours'
ORDER BY d.start_time DESC;
-- erwartet: keine status = 'failed'; return_message ohne EXCEPTION
```

---

## Vor Phase 6

**Stripe Live: Integrationsauswahl bestätigen (Direct Charges).** Erst danach Webhooks und Live-Secrets.

## Phase 6 — Stripe live · nur omlifytest · dann Yomita

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 17 | Live-Webhooks | J | Stripe Live, URL `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook` | 2 Ziele aktiv (Liste unten) | falsche URL / Test-Modus → STOPP |
| 18 | Live-Secrets | J | Edge: `PAYMENTS_MODE=live`, `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_THIN` — jeweils `--project-ref <PROD-REF>`; Cloudflare: `VITE_PAYMENTS_MODE=live`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` → Rebuild; danach `secrets list --project-ref <PROD-REF>` | Secrets auf PROD; neuer Build; danach **dieselbe JS-Prüfung wie 15b** | Test-Key auf PROD → sofort entfernen, STOPP. JS ist HTML → Dashboard-Rollback auf den Deploy vor diesem Rebuild |
| 19 | Allowlist omlifytest | J | `SELECT public.set_online_payments_studio_allowed('omlifytest', true);` dann `SELECT public.set_platform_flag('online_payments', true);` | `list_online_payments_effective()` nur omlifytest | yomita schon sichtbar → Allowlist prüfen, Flag ggf. aus |
| 20 | Sichtbarkeit | J | omlifytest Owner: Stripe-Bereich da; **yomita: kein** Stripe-Bereich | getrennt | yomita sieht Stripe → STOPP vor Rauch |
| 21 | **Rauchtest Rechtliches** | J | `https://omlifytest.omlify.de/{impressum,agb,datenschutz}` und `https://yomita.omlify.de/…` (öffentlich) | Text lädt (kein „konnte nicht geladen“, kein Redirect `/auth`); Inhalt Studio-AGB bzw. Hinweis wenn noch nicht freigegeben | dauerhaft `/auth` oder Load-Fail nach Merge → Frontend/RPC prüfen, vor Live-Geld STOPP |
| 22 | Live-Rauch omlifytest | J | (a) Connect/Onboarding falls nötig · (b) Buchung **1 €** live · (c) **Erstattung** · (d) **Apple Pay** (Gerät) · (e) **Kurskarte kaufen und erstatten** | Zahlung + Erstattung in Stripe + `provider_events_raw` + Hauptbuch; Karte gekauft und erstattet | fehlgeschlagen → Flag aus und/oder Allowlist zurück (§ Rückweg), Webhooks pausieren |
| 23 | Webhook/Buch-Check | J/C | Events verarbeitet; Ledger-Zeilen passen | grün | stuck/failed Events → nicht Yomita freischalten |
| 24 | **Yomita freischalten** | J | `SELECT public.set_online_payments_studio_allowed('yomita', true);` | in `list_online_payments_effective`; Yomita richtet Stripe selbst ein | Rauch omlifytest nicht grün → **nicht** freischalten |

### Webhook-Ereignisse (Live)

URL beider Ziele: `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook` · Live-Modus · Nutzlast wie angegeben.

**Ziel 1 — Verbundene Konten / Snapshot** (`STRIPE_WEBHOOK_SECRET`):  
`account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`  
(Quelle: `adapter.ts` Payment/Refund/Dispute-Sets + Account-Zweige.)

**Ziel 2 — Ihr Konto / Thin** (`STRIPE_WEBHOOK_SECRET_THIN`):  
Vollständige Account-Thin-Liste (Stripe API Account event types; Handler akzeptiert alle `v2.core.account…` und `v2.core.account[…]` in `isV2CoreAccountEventType` — nicht `account_link` / `account_person`):

- `v2.core.account.created`
- `v2.core.account.updated`
- `v2.core.account.closed`
- `v2.core.account[configuration.customer].capability_status_updated`
- `v2.core.account[configuration.customer].updated`
- `v2.core.account[configuration.merchant].capability_status_updated`
- `v2.core.account[configuration.merchant].updated`
- `v2.core.account[configuration.recipient].capability_status_updated`
- `v2.core.account[configuration.recipient].updated`
- `v2.core.account[defaults].updated`
- `v2.core.account[future_requirements].updated`
- `v2.core.account[identity].updated`
- `v2.core.account[requirements].updated`

Auf DEV in `provider_events_raw` bisher angekommen: `v2.core.account[requirements].updated`, `v2.core.account[configuration.merchant].capability_status_updated` (Fixtures/Tests zusätzlich `v2.core.account.updated`).

---

## Rückweg

| Lage | Aktion | Wer |
|------|--------|-----|
| Nur Frontend kaputt | Cloudflare-Dashboard: Rollback auf den **vorigen** Deploy des Workers (`yogaflow-dev` auf PROD, `omlify-dev` auf DEV). Nicht zuerst einen neuen Commit bauen. Alternativ `main` auf guten Stand (`179bcfb` / #177) — siehe [ROLLBACK.md](ROLLBACK.md). Schema bleibt (Expand). | J |
| Online-Zahlungen stören | `SELECT public.set_platform_flag('online_payments', false);` und/oder Allowlist `omlifytest`/`yomita` → `false`; Stripe-Webhooks pausieren | J |
| Schema-Push mitten drin kaputt | **kein** Blind-Retry; Stand prüfen; Restore nur mit bewusstem Backup-Plan ([SCHEMA_ROLLBACK](SCHEMA_ROLLBACK_WORKFLOW.md)) | J |
| Frontend↔Schema | Alt-Frontend war gegen neues Schema **kompatibel** (Generalprobe §5); `main` mit #177 (Teilnehmerliste FK-Hint) ist Rückfallpunkt vor Geldkette-UI | — |

---

## Kurz: Reihenfolge nicht verdrehen

1. Extensions + Vault + **Link PROD** + Secrets (mit `--project-ref` / Kontrolle `secrets list`) + Cloudflare-Basis  
2. **Ein** Pooler-Push (Passwort in `--db-url`) → Post-Push-SQL → Functions → ops-monitor  
3. Aktive Prüfungen (Cron von Hand, `net._http_response`, Retention/Pass-Gates)  
4. Merge Frontend → Build → Plattform noch **aus** → Mail-Probe `omlifytest` über **Online-Buchung** (16a; Vor-Ort hat noch keine Bestätigung)  
5. **Stripe Live: Integrationsauswahl bestätigen (Direct Charges)**  
6. Live-Webhooks + Live-Secrets + Rebuild  
7. Nur **omlifytest** → Rechtliches + Live-Rauch → dann **Yomita**

---

## Abschluss (nach Phase 6 / Ende des Abends)

```powershell
# wieder DEV verlinken — Ref mufxhtctutfpzklwqnze
npx.cmd supabase link --project-ref mufxhtctutfpzklwqnze

# Passwort-Env entfernen, falls gesetzt
Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
```

Kurzbericht: [docs/berichte/release_2026-10_abend.md](berichte/release_2026-10_abend.md) (Ampel je Schritt, Abweichungen, GO).

---

## Runbook — Neuigkeiten freigeben (nicht Abend-Schritt)

Nach dem Release, bewusst und einzeln. Schreiben nur als `service_role` / SQL-Editor (postgres).

Tabelle: `public.studio_update_releases` (`update_id`, `enabled`).

**Freigeben** (idempotent):

```sql
INSERT INTO public.studio_update_releases (update_id, enabled)
VALUES ('2026-10-zahlungen-im-blick', true)
ON CONFLICT (update_id) DO UPDATE
  SET enabled = true, updated_at = now();
```

**Freigabe zurücknehmen:**

```sql
UPDATE public.studio_update_releases
SET enabled = false, updated_at = now()
WHERE update_id = '2026-10-zahlungen-im-blick';
```

**Liste der freigegebenen:**

```sql
SELECT update_id, updated_at
FROM public.studio_update_releases
WHERE enabled = true
ORDER BY update_id;
```

Aktuelle IDs im Code: `2026-10-zahlungen-im-blick`, `2026-10-kurskarten-verkaufen`, `2026-10-rechtstexte`, `2026-10-online-bezahlen`.  
PROD startet ohne Freigaben (Migration seedet nur bei Demo-Slugs auf DEV).
