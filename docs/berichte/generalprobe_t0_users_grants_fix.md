# Bericht — Generalprobe T0 NO-GO: users-Grants (Freeze-Ausnahme)

Stand: 2026-10-12 · Branch `Julius` · Status: **angehalten (STOPP nach Fix + Push)**

## Kurz

`db push --include-all` auf der PROD-Kopie brach in `20261004210000_zw1_n1_online_pay_hint.sql` ab:  
`has_column_privilege('authenticated','public.users','online_pay_hint_seen_at','UPDATE') = true`.

**Ursache:** Restore aus Backup-`schema.sql` auf ein frisches Supabase-Projekt lässt **Tabellen-UPDATE** für `authenticated`/`anon` auf `public.users` stehen. Live-PROD ist seit `20260911134500` korrekt (kein Tabellen-UPDATE). Die Probe ist deshalb **nicht** grant-identisch mit Live-PROD.

**Fix:** neue Migration `20261004205900_align_users_grants_prod.sql` (vor ZW1-N1), idempotent, auf DEV no-op.

---

## 1 — Rechte-Diff und Herkunft

### Befund Live-PROD (readonly MCP)

| Objekt | anon/authenticated | Live-PROD |
|--------|--------------------|-----------|
| `public.users` Tabellen-UPDATE | nein | 🟢 `has_table_privilege(..., UPDATE)=false` |
| `public.users` Spalten-UPDATE | nur Allowlist | first_name, last_name, email, phone, street, house_number, postal_code, city, role |
| `public.users` übrige Spalten UPDATE | nein | id, tenant_id, auth_user_id, email_verified*, timestamps, … |
| `public.courses` Tabellen-UPDATE | ja | `GRANT ALL` (Dump + Live) |
| `public.registrations` Tabellen-UPDATE | ja (vor A1) | Live noch ALL; A1 revokes Schreibrechte |
| `public.tenants` | SELECT (+ MAINTAIN) | wie Dump |
| Plattform `admin_emails` / `system_settings` | kein Client | nur service_role |

\* `email_verified` / `tenant_id` ohne Spalten-UPDATE → Client kann sie auf Live-PROD nicht setzen (Stufe 0).

### Probe nach Restore (vor Fix)

| | Live-PROD | Probe nach `schema.sql` |
|--|-----------|-------------------------|
| `users` Tabellen-UPDATE authenticated | false | **true** (Default Privileges) |
| Neue Spalte `online_pay_hint_seen_at` UPDATE | wäre false | **true** → ZW1-N1 STOPP |

### Herkunft

1. **Sollstand DEV/PROD-Live:** Migration `20260911134500_users_restrict_client_column_updates.sql` — `REVOKE UPDATE` + `GRANT UPDATE (Allowlist)`.
2. **Backup-Dump** exportiert nur die **positiven** Grants ohne `UPDATE` auf Tabellenebene (`GRANT SELECT,INSERT,…` + Spalten-`GRANT UPDATE(…)`), **kein** `REVOKE UPDATE`.
3. Frisches Supabase-Projekt hat `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated` (auch im Dump am Ende). Beim `CREATE TABLE` greifen die Defaults → Tabellen-UPDATE landet auf `users`. Die späteren `GRANT`s entfernen UPDATE nicht.
4. Deshalb: Live-PROD ≠ Probe-nach-Restore, obwohl beide denselben Dump nutzen.

DEV war während der Analyse pausiert (MCP-Timeout) — Sollstand aus `20260911134500` + PROD-Live-Spaltenliste.

### Weitere PROD-vs-Soll-Abweichungen (Tabellen, nicht Push-Blocker für ZW1)

| Tabelle | PROD-Live / Dump | Nach Geldkette-Soll (DEV) | Anmerkung |
|---------|------------------|---------------------------|-----------|
| `registrations` | GRANT ALL | A1: kein Client-INSERT/UPDATE/DELETE | A1 in den 89, hat auf der Probe schon gegriffen |
| `courses` | GRANT ALL | unverändert ALL (keine Lockdown-Migration) | `REVOKE UPDATE (archived_at)` wirkungslos bei Tabellen-UPDATE; UX-5 prüft das am Ende **nicht** |
| `auth_tokens`, `messages`, `email_templates`, … | GRANT ALL | historisch | RLS begrenzt; nicht ZW1-relevant |

Funktions-EXECUTE: Live-PROD ohne Geldkette-RPCs; Diff zu DEV ist der gesamte Release-Stand (nicht Ursache dieses Abbruchs).

---

## 2 — Sicherheitsbewertung Live-PROD (`users`) — Ampel

**Was ein eingeloggter Nutzer heute ändern kann**

| Schicht | Wirkung |
|---------|---------|
| Grants | UPDATE nur Allowlist-Spalten (Profil + `role`); kein Tabellen-UPDATE |
| RLS `users_update_own_profile` | eigene Zeile (`id = get_my_member_id()`) |
| RLS `managers_update_tenant_users` | Manager andere im Tenant (nicht sich selbst) |
| Trigger `check_role_escalation` / `prevent_role_escalation` | Rollen-Eskalation begrenzen |
| Trigger `users_identity_guard` | **fehlt auf PROD** (kommt mit 4.3 `20260927145006`) |
| DELETE | Tabellen-DELETE noch für authenticated (Policy `managers_delete_tenant_users`); 4.3 revoked DELETE |

| Risiko | Ampel | Begründung |
|--------|-------|------------|
| `tenant_id` / `email_verified` selbst setzen | 🟢 | Spalten ohne UPDATE-Grant seit `20260911134500` |
| Beliebige Spalten (z. B. Hint/Archiv) clientseitig | 🟢 Live / 🔴 nach Blind-Restore | Live ok; Probe-Restore ohne Fix öffnet Tabellen-UPDATE |
| `role` clientseitig | 🟡 | Grant + Trigger; bekannt seit Stufe 0 |
| `auth_user_id` / Anonymisierung | 🟡 | Grant-seitig gesperrt; Guard erst mit 4.3 |

**Gesamt Live-PROD heute:** 🟢 für das ursprüngliche Stufe-0-Loch; 🟡 bis 4.3 (Identity-Guard, DELETE-REVOKE).  
**Probe ohne Fix:** 🔴 für Client-UPDATE auf allen neuen `users`-Spalten.

---

## 3 — Privilege-Prüfungen in den ausstehenden Migrationen

Ausstehend vor Fix: **89** (115 auf PROD, 204 im Repo). Davon mit `has_*_privilege`: **54**.

### Push-kritisch bei abweichenden Grants (RAISE auf Spalten-/Tabellenrechten)

| Migration | Prüfung | PROD-Kopie ohne Fix |
|-----------|---------|---------------------|
| `20260926144500` A1 soft-cancel | registrations: kein Client-UPDATE/INSERT/… | 🟢 setzt REVOKE selbst, war ok |
| `20260927093608` A2 waived | `coverage_status` kein Client-UPDATE | 🟢 nach A1 |
| `20261004210000` **ZW1-N1** | `users.online_pay_hint_seen_at` kein UPDATE | 🔴 **Abbruch** |
| `20261004220000` ZW1-N4 | `users.last_booking_pay_method` kein UPDATE | 🔴 würde als Nächstes |
| `20261004230000` UX-5 archived_at | REVOKE Spalte users/courses; **kein** finaler Privilege-RAISE | 🟡 users ok nach Fix; courses Tabellen-UPDATE bleibt, Spalten-REVOKE wirkungslos |

### Übrige `has_*_privilege` (meist EXECUTE auf neu angelegte RPCs / Tabellen-Neuanlage)

Muster: `REVOKE ALL … FROM PUBLIC, anon, authenticated` + gezielte `GRANT` + Selbstcheck „anon ohne EXECUTE / authenticated mit EXECUTE“. Bauen auf dem **Migrationskörper** auf, nicht auf Restore-Defaults von `users`. Beispiele: A5 passes, A6, A7, S1–S3, B1/B2, K1, RT-1/RT-2, Allowlist, Onboarding-Legal.

Volle Dateiliste der 54: siehe `rg has_(column|table|function)_privilege supabase/migrations/20260926*.sql` … `20261009*.sql` (alle pending).

---

## 4 — Fix

Neue Datei (nicht editierte Alt-Migrationen):

`supabase/migrations/20261004205900_align_users_grants_prod.sql`

- `REVOKE UPDATE ON public.users FROM anon, authenticated`
- `GRANT UPDATE (Allowlist)` wie `20260911134500`
- Selbstprüfung identisch (anon kein UPDATE; kein Tabellen-UPDATE; Spalten exakt Allowlist)
- DEV: no-op

---

## 5 — CI / Push / Freeze-Tag

Nach Commit in diesem Lauf:

| | |
|--|--|
| `npm run check:ci` | (Ergebnis unten / im Lauf) |
| Push | `origin/Julius` |
| Freeze-Hash | neuer HEAD nach Commit |
| Tag | `release-2026-10-freeze` nachgezogen (force-move auf neuen HEAD) |

---

## Probe neu — Befehle für Julius

1. Altes Probe-Projekt im Dashboard löschen (oder neues anlegen).
2. Neues Projekt `omlify-probe` (eu-west-1), DB-Passwort notieren.
3. Backup entschlüsseln/entpacken wie zuvor → `data_probe.sql` (ohne interne storage-COPY-Blöcke).
4. Session-Pooler-URI Port 5432, Ref-Check ≠ PROD/`otnhxzomnjjthocovasu` ≠ DEV/`mufxhtctutfpzklwqnze`.
5. Restore:

```powershell
$ref = "<NEUE-PROBE-REF>"
$uri = "postgresql://postgres.$ref@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
# $env:PGPASSWORD = '…'  # nur lokal
if ($ref -in @('otnhxzomnjjthocovasu','mufxhtctutfpzklwqnze')) { throw 'STOPP' }

& "C:\Program Files\PostgreSQL\17\bin\psql.exe" `
  --single-transaction --variable ON_ERROR_STOP=1 `
  --file "$env:USERPROFILE\Downloads\wiederherstellung\roles.sql" `
  --file "$env:USERPROFILE\Downloads\wiederherstellung\schema.sql" `
  --command "SET session_replication_role = replica" `
  --file "$env:USERPROFILE\Downloads\wiederherstellung\data_probe.sql" `
  --dbname $uri
```

6. DB-Passwort im Dashboard **zurücksetzen** (Passwort stand ggf. im Chat).
7. `schema_migrations` aus PROD seeden (115 Versionen bis `20260928213000`) — Skript `Downloads\wiederherstellung\seed_schema_migrations.sql` erneut anwenden, **danach** ist die neue `20261004205900` noch nicht in der Seed-Liste (korrekt, sie soll gepusht werden).
8. Extensions: `pg_cron` + `pg_net` im Probe-Dashboard.
9. Push über `--db-url` (nicht `db:push:prod`):

```powershell
cd E:\Business\YogaFlow\Code\YogaApp2-main
$env:SUPABASE_DB_PASSWORD = '…'   # neues Probe-Passwort
npx supabase db push --include-all --db-url "postgresql://postgres.$ref@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
```

10. Erwartung: Push durch inkl. `20261004205900` vor `20261004210000`, Ende `20261009161100`.
11. Nach Probe: entschlüsselte Dateien / `wiederherstellung` / `.gpg` löschen; Probe-Projekt löschen.

---

## STOPP

Wartet auf Julius: Probe neu (Befehle oben), Push-Output. Agent prüft danach per SQL Snapshot/Jobs/`platform_flags`.
