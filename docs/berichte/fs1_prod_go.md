# FS-1 — GO PROD (vorbereitet)

Stand: 2026-10-17 · Branch `Julius` · HEAD `6fb937e` · **STOPP vor Merge**

## 0 — Kosten-Text (vor Merge)

| | |
|---|---|
| Commit | `6fb937e` |
| Text | Endfassung mit „ab 1,5 % + 0,25 €“, ohne Firmenkarten-Satz; nur `FEES_BODY_TEXT` |
| `check:ci` | grün |
| Live DEV | `https://demoepsilon.omlify-dev.de/assets/index-BEUpc0w5.js` · Merkmal `ab 1,5 %` |
| Asset-404 | `/assets/index-missing-probe.js` → **404** |

## 1 — PR Julius → main

`gh` ist lokal nicht eingeloggt. Compare-Link (PR dort anlegen):

**https://github.com/YogaFlow/YogaFlow-DEV/compare/main...Julius?expand=1**

Vorschlag Titel: `FS-1 Feinschliff (Gebühren, Widerruf, Webhook-Retry, Datenschutz-Freigabe)`

Scope (12 Commits auf Julius seit `main` `177c93b`): Gebührenhinweise, Kosten-Text, ops-monitor 15 s, Widerruf-UI, Webhook-Retry, Datenschutz VERSION_MISMATCH-Fix, Docs.

**CI:** lokal `npm run check:ci` grün auf `6fb937e`. GitHub-Checks nach PR-Anlage prüfen.

### STOPP vor dem Merge

Weiter erst nach deinem Merge auf GitHub. Cursor führt keinen Merge und keine PROD-Befehle aus.

---

## 2 — PROD-Befehle (PowerShell, zum Kopieren)

**Kein** `supabase link` auf PROD, **kein** `git checkout main`. Passwort nur per `Read-Host`.

### Wichtig vor a): Dry-Run-Erwartung

Auftrag: genau `20261017120000` und `20261017130000`.  
Auf PROD (Stand STAND) fehlt voraussichtlich noch **`20261016121000` (BC-1)** — die Datei liegt bereits auf `main`. Dry-Run zeigt dann **drei** Versionen → laut Auftrag **STOPP** und entscheiden: BC-1 mitpushen (dann Reihenfolge/BC-1-Bericht beachten) oder BC-1 vorher separat.

### a) Migrationen

```powershell
$pw = [uri]::EscapeDataString((Read-Host "PROD DB Passwort"))
$url = "postgresql://postgres.otnhxzomnjjthocovasu:$pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
npx.cmd supabase db push --dry-run --db-url $url
# Erwartung laut Auftrag: nur
#   20261017120000_fs1_ops_monitor_timeout
#   20261017130000_fs1_webhook_tenant_retry
# Wenn zusätzlich 20261016121000 (BC-1) erscheint → STOPP, nicht stumm mitpushen.
npx.cmd supabase db push --db-url $url
Remove-Variable pw, url
```

### b) Edge Function

```powershell
npx.cmd supabase functions deploy payments-webhook --project-ref otnhxzomnjjthocovasu --use-api
```

### c) Merge → Cloudflare

1. PR mergen (Compare-Link oben).
2. Check-Run **Workers Builds: yogaflow-dev** (bzw. PROD-Worker) auf `success` warten.
3. `https://yomita.omlify.de/version.json` → `commit` / Hash = Merge-Commit auf `main`.

### Warum Migration → Function → Merge

| Schritt | Warum zuerst |
|---------|----------------|
| **Migration** | `record_provider_event` liefert `attempts` + Tenant-Nachlösen; `invoke_ops_monitor` Timeout 15 s. Ohne Migration: neuer Webhook sieht `attempts` nicht → Default 0 → `TENANT_NOT_RESOLVED` **endlos** 500 (nie finalisieren). |
| **Function** | Retry-Logik braucht die RPC-Felder. Kurz nach Migration, vor Frontend-Traffic mit neuem Bundle. |
| **Merge** | Frontend (Gebühren, Widerruf, Freigabe-Version, Kosten-Text). Unabhängig von DB-Timeout; Datenschutz-Fix für Tanja kommt erst mit Bundle. |

**Minuten dazwischen:** Migration ohne Function = alter Webhook, neues SQL (harmlos: `attempts` ungenutzt). Function ohne Migration = **gefährlich** (endlose Retries) — deshalb nie Function vor Migration. Merge verzögert nur Frontend; Tanja wartet auf Bundle, Webhook/ops-monitor sind schon hart.

---

## 3 — Prüfabfragen (nur lesend, nach Push)

### Letzte Migration

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 5;
-- erwartet: oberste version = 20261017130000
```

### ops-monitor Timeout + Rechte

```sql
SELECT
  position('timeout_milliseconds := 15000' IN pg_get_functiondef(
    'yogaflow_private.invoke_ops_monitor()'::regprocedure
  )) > 0 AS has_timeout_15s,
  has_function_privilege('anon', 'yogaflow_private.invoke_ops_monitor()', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'yogaflow_private.invoke_ops_monitor()', 'EXECUTE') AS auth_exec,
  has_function_privilege('public', 'yogaflow_private.invoke_ops_monitor()', 'EXECUTE') AS public_exec;
-- erwartet: has_timeout_15s true, anon/auth/public false
```

### Webhook-Wiederholung (Funktion + Rechte)

```sql
SELECT
  position('attempts' IN pg_get_functiondef(
    'yogaflow_private.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)'::regprocedure
  )) > 0 AS def_has_attempts,
  position('tenant_id IS NULL' IN pg_get_functiondef(
    'yogaflow_private.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)'::regprocedure
  )) > 0 AS def_tenant_resolve,
  has_function_privilege('anon', 'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)', 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', 'public.record_provider_event(public.payment_provider,text,text,text,boolean,jsonb)', 'EXECUTE') AS service_exec;
-- erwartet: attempts+tenant true; anon/auth false; service true
-- (keine neuen Spalten — attempts gab es schon; nur Rückgabe + Nachlösen)
```

### ops-monitor ohne Timeout in net._http_response

```sql
SELECT
  count(*) FILTER (WHERE timed_out) AS timed_out_n,
  count(*) FILTER (WHERE NOT coalesce(timed_out, false) AND status_code = 200) AS ok_200_n
FROM net._http_response
WHERE created > now() - interval '45 minutes';
-- nach Cron/Smoke: timed_out_n = 0 erwartet (ops-monitor läuft alle 15 min)
```

Optional gezielt (wenn Request-URL in einer View sichtbar; `_http_response` hat oft keine URL-Spalte):

```sql
SELECT id, status_code, timed_out, error_msg, created
FROM net._http_response
ORDER BY id DESC
LIMIT 15;
```

---

## STOPP

1. PR anlegen/prüfen (Compare-Link), **nicht mergen** bis du willst.  
2. Dry-Run: wenn ≠ genau die zwei FS-1-Versionen → **STOPP** (BC-1 klären).  
3. Dann a → b → c wie oben. Cursor führt nichts auf PROD aus.
