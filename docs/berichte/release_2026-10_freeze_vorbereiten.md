# Bericht — Release 2026-10 Freeze-Vorbereitung (Cron, Bucket, Handgriffe)

Stand: 2026-10-09 · Branch `Julius` · Status: **angehalten (STOPP)**  
Vorgänger: [release_2026-10_bestandsaufnahme.md](release_2026-10_bestandsaufnahme.md)

---

## Ampel

| § | Thema | Ampel |
|---|--------|-------|
| 0 | Doku-Commit Phase 1 | 🟢 `23306e0` gepusht |
| 1 | Cron reproduzierbar | 🟢 Migration + DEV no-op belegt; Extension-Handgriff T0-1a |
| 2 | Bucket studio-legal | 🟢 Migration; keine weiteren Hand-Buckets |
| 3 | Functions + Secrets | 🟡 Handgriff-Liste fertig; `PAYMENTS_MODE` kennt kein `off` |
| 4 | A1/A2 + 85er-Probe | 🟡 Datenwirkung klar; Probelauf lokal **Haltestelle** (kein Docker) |
| 5 | Altes Frontend | 🟢 kein 🔴; Fenster ~10 min unkritisch |

---

## 0 — Bericht committen 🟢

- Commit `23306e0` `docs(release): Bestandsaufnahme 2026-10 Phase 1`
- Dateien: `docs/berichte/release_2026-10_bestandsaufnahme.md`, `docs/STAND.md`
- `git push origin Julius` ok

---

## 1 — Cron 🟢

### Wo entsteht jeder Job?

| Job | Schedule | Command | Quelle |
|-----|----------|---------|--------|
| `yogaflow_expire_passes` | `5 * * * *` | `expire_passes()` | Migration `20260928010000_a6_3_reverse_and_expire.sql:1437` (+ `CREATE EXTENSION pg_cron` Z.26) |
| `yogaflow_process_ledger` | `*/5 * * * *` | `process_ledger()` | `20260928020000_a7_1_ledger.sql:675` |
| `yogaflow_expire_payment_holds` | `* * * * *` | `expire_payment_holds()` | `20260929140001_s2_1b_a_pending_payment_schema.sql:986` |
| `yogaflow_dispatch_emails` | `* * * * *` | `invoke_email_dispatch()` | `20260929160000_s2_1b_b2_dispatch_emails.sql:75` (+ `pg_net` Z.15) |
| `yogaflow_process_provider_jobs` | `* * * * *` | `invoke_provider_jobs()` | `20261001100000_stripe_2_2a_4a_provider_jobs.sql:1477` |
| `yogaflow_ops_monitor` | `*/15 * * * *` | `invoke_ops_monitor()` | `20261004130000_b2_ops_monitor.sql:382` |
| `yogaflow_expire_pass_payment_attempts` | `* * * * *` | `expire_pass_payment_attempts()` | `20261004272000_k1_pass_online_checkout.sql:1078` |
| `yogaflow_pass_expiry_reminders` | `15 6 * * *` | `enqueue_pass_expiry_reminders()` | `20261004274000_k1_pass_online_receipts_ops_emails.sql:821` |
| `yogaflow_process_legal_pdf` | `* * * * *` | `invoke_legal_pdf_jobs()` | `20261005130000_rt1_terms_document_id.sql:558` |
| `yogaflow_retention_cleanup` | `15 3 * * *` | `invoke_retention_cleanup()` | `20261008200000_rt2_omlify_terms_privacy_retention.sql:252` |

Kein Handgriff auf DEV nötig — alles aus Migrationen.

### invoke_* — URL/Schlüssel

| Funktion | Vault-Namen | Verhalten ohne Vault |
|----------|-------------|----------------------|
| `invoke_email_dispatch` | `email_dispatch_url`, `email_dispatch_secret` | `RETURN` (no-op) |
| `invoke_ops_monitor` | `ops_monitor_url`, `ops_monitor_secret` | LOG + `RETURN` |
| `invoke_provider_jobs` | `provider_jobs_url`, `provider_jobs_secret` | LOG + `RETURN` (auch wenn Jobs fällig) |
| `invoke_legal_pdf_jobs` | `legal_pdf_url`, `legal_pdf_secret` | LOG + `RETURN` |
| `invoke_retention_cleanup` | — (direkt `retention_cleanup()`) | n/a |

Keine hart verdrahtete DEV-URL in SQL. URLs liegen nur im Vault (Namen oben). Edge-Secrets parallel: `EMAIL_DISPATCH_SECRET`, `OPS_MONITOR_SECRET`, `PROVIDER_JOBS_SECRET`, `LEGAL_PDF_SECRET` (Bearer = Vault-Secret-Wert).

DEV Vault-Namen (MCP): `email_dispatch_url/secret`, `legal_pdf_url/secret`, `ops_monitor_url/secret`, `provider_jobs_url/secret`.

### Neue Migration

`20261009160000_release_2026_10_cron.sql` (zuletzt im Push)

- Prüft `pg_cron` + `pg_net` vorhanden (sonst klare EXCEPTION → T0-1a)
- **Kein** `CREATE EXTENSION` — auf DEV löst `CREATE EXTENSION IF NOT EXISTS pg_cron` bei schon installierter Extension **2BP01** aus (dependent privileges)
- unschedule + schedule für alle 10 Jobs, Selbstcheck count=10
- DEV nach Apply: 10 Jobs, Namen/Zeitpläne/Commands unverändert (Beleg MCP)

### Extension-Handgriff (T0-1a)

PROD: `pg_cron` und `pg_net` = available, nicht installiert; `supabase_vault` installiert.  
A6-3 / B2 rufen `CREATE EXTENSION` beim 85er-Push auf. Wenn das auf PROD scheitert: **Dashboard → Database → Extensions → pg_cron + pg_net aktivieren**, dann Push fortsetzen. Release-Cron-Migration legt Extensions bewusst nicht an.

---

## 2 — Bucket studio-legal 🟢

Neue Migration: `20261009150000_release_2026_10_studio_legal_bucket.sql`

- `INSERT … ON CONFLICT DO UPDATE` — privat, 5 MB, `application/pdf`
- **Keine** `storage.objects`-Policies auf DEV (Zugriff nur Edge `legal-pdf` / service_role)
- Weitere Buckets: nur `studio-branding` (bereits auf PROD seit Release 2026-09, Policies in `20260915090020`). Kein weiterer Hand-Bucket.

DEV Apply: Bucket unverändert privat.

---

## 3 — Edge Functions + Secrets (Handgriff, kein Deploy) 🟡

### Functions am Release-Tag

| Function | verify_jwt | Secrets (Namen) | Vor Stripe live? | Fehlt Stripe-Secret |
|----------|------------|-----------------|------------------|---------------------|
| request-password-reset | default true* | SMTP, APP_*, INTERNAL via send-email | ja | n/a |
| request-verification-email | default true* | wie Mail | ja | n/a |
| send-verification-email | default true* | wie Mail | ja | n/a |
| reset-password | default true* | — | ja | n/a |
| verify-email | default true* | — | ja | n/a |
| send-email | **false** | `INTERNAL_EMAIL_SECRET`, `SMTP_*`, `SENDER_EMAIL` | ja | n/a |
| delete-user | **false** | service | ja | n/a |
| update-user | **false** | service | ja | n/a |
| onboarding-public | **false** | — | ja | n/a |
| service-ping | **false** | — | ja | n/a |
| set-participant-password | **false** | service | ja | n/a |
| dispatch-emails | **false** | `EMAIL_DISPATCH_SECRET`, `INTERNAL_EMAIL_SECRET` | ja | kein Stripe |
| legal-pdf | **false** | `LEGAL_PDF_SECRET` | ja | kein Stripe |
| calendar-ics | **false** | `CALENDAR_ICS_SECRET` | ja | kein Stripe |
| ops-monitor | **false** | `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`, optional `OPS_HEARTBEAT_URL`, `INTERNAL_EMAIL_SECRET` | ja | kein Stripe |
| payments-webhook | **false** | `PAYMENTS_MODE`, `STRIPE_WEBHOOK_SECRET`[+_2/_THIN] | deploy ok, unbenutzt | 500 `CONFIG_ERROR` |
| payments-onboarding | **false** | `PAYMENTS_MODE`, `STRIPE_SECRET_KEY`, `APP_BASE_DOMAIN` | deploy ok, UI aus | 500 `CONFIG_ERROR` |
| payments-checkout | **false** | wie onboarding | deploy ok, Schalter aus | 500 `CONFIG_ERROR` |
| payments-jobs | **false** | `PROVIDER_JOBS_SECRET`, bei Job-Ausführung Provider → Stripe | deploy ok; Cron no-op ohne Vault | Auth-Fail / CONFIG bei Provider |

\*nicht in `config.toml` → Gateway-Default `verify_jwt=true`.

**Nicht deployen:** DEV-Altbestand `reset-passwords` (nicht im Repo).

### `PAYMENTS_MODE`

Code (`_shared/payments/config.ts`): nur `test` \| `live`. **Kein `off`.**  
Empfehlung Release-Tag: `PAYMENTS_MODE` **nicht setzen** (oder leer) → Payment-Functions `CONFIG_ERROR`; Plattform-Flag `online_payments` bleibt aus. Alternativ `test` + Test-Keys nur wenn bewusst Testmodus auf PROD (nicht empfohlen vor Phase 6).

Mail-/PDF-/ops-Strecke braucht kein Stripe → 🟢 getrennt.

### Secrets PROD (Namen) — Wert-Quelle

| Secret | Release-Tag | Quelle |
|--------|-------------|--------|
| SMTP_*, SENDER_EMAIL, APP_URL, APP_BASE_DOMAIN, INTERNAL_EMAIL_SECRET | behalten/prüfen | bestehend PROD |
| EMAIL_DISPATCH_SECRET | setzen | neu erzeugen (wie DEV-Skript), = Vault `email_dispatch_secret` |
| PROVIDER_JOBS_SECRET | setzen | neu, = Vault `provider_jobs_secret` |
| OPS_MONITOR_SECRET | setzen | neu, = Vault `ops_monitor_secret` |
| OPS_ALERT_EMAIL | setzen | **E6: nur Julius** (z. B. support@omlify.de) |
| OPS_HEARTBEAT_URL | optional | Heartbeat-Dienst |
| LEGAL_PDF_SECRET | setzen | neu, = Vault `legal_pdf_secret` |
| CALENDAR_ICS_SECRET | setzen | neu |
| PAYMENTS_MODE | **leer lassen** | — |
| STRIPE_* | **leer** bis Phase 6 | Live später |
| EMAIL_REDIRECT_TO | **nicht setzen** | — |
| DEMO_* | **nicht** | nur DEV |

### Vault PROD (Namen, Handgriff)

Anlegen (Werte = Function-URL + Secret, **PROD-URL**, nicht DEV):

- `email_dispatch_url` → `https://<PROD_REF>.supabase.co/functions/v1/dispatch-emails`
- `email_dispatch_secret`
- `ops_monitor_url` / `ops_monitor_secret`
- `provider_jobs_url` / `provider_jobs_secret`
- `legal_pdf_url` / `legal_pdf_secret`

### Cloudflare / Mail

- Worker PROD `yogaflow-dev`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_BASE_DOMAIN=omlify.de`
- `VITE_STRIPE_PUBLISHABLE_KEY` / `VITE_PAYMENTS_MODE`: leer bis Phase 6
- Mail-Absender: `SENDER_EMAIL` auf PROD prüfen (Inhalt nicht ausgelesen)

---

## 4 — A1/A2 und 85 Migrationen 🟡

### A1 — 8 Alt-Stornos

PROD: 5× `registered` + 3× `waitlist` mit gesetztem `cancellation_timestamp`.

Nach A1 (`20260926141501`):

- `status → cancelled`, `cancel_reason → legacy_closed`, `waitlist_position → NULL`
- Timestamp unverändert

**Sicht Testkundin:** Diese Zeilen waren schon „weg“ (UI filtert `cancellation_timestamp IS NULL`). Kein neuer offener Platz, keine Mail. Einzige mögliche Differenz: Owner-Historie/Exporte, die stornierte Zeilen mit Grund `legacy_closed` zeigen — unkritisch.

### A2 — 325 → open

| Tenant-Präfix | Vergangenheit → open | Kommend → open |
|---------------|----------------------|----------------|
| `892370b8` | 191 | 111 |
| `5110be00` | 7 | 2 |
| `1ffd7778` | 6 | 0 |

(Aktiv ohne cancel_ts; plus stornierte Altzeilen werden ebenfalls befüllt → Gesamt 325.)

**A8 danach nutzbar:** Seite „Offene Zahlungen“ → „Alte Kurse abhaken“ / „Ältere Kurse auf einmal als erledigt markieren“ (`PreOmlifyWaiveSection`).  
DEV-Beleg Screenshot (lokal, nicht im Commit): `docs/screenshots/a8/owner-offen-liste-desktop-1280.png` („Alte Kurse abhaken“), Status „vor Omlify erledigt“ in `docs/screenshots/a8/kasse-vor-omlify-erledigt-mobil-360.png`.

### Reihenfolge / Abhängigkeiten

- 21 Migrationen mit Zeitstempel **vor** letzter PROD-Version `20260928213000` → `--include-all` nötig
- Keine Evidenz, dass eine ältere fehlende Migration eine **neuere nur-auf-PROD**-Migration braucht; Hotfixes `20260926160500` / `20260928213000` sind orthogonal (Signup-Rolle, Teacher-Guard). A5-Guard + Hotfix-Guard koexistieren auf DEV
- Lineare Abhängigkeit A1→…→RT-2 ist die vorgesehene Push-Reihenfolge

### Probelauf Schema+85

**Haltestelle:** `supabase db dump` verlangt Docker Desktop — hier nicht verfügbar (Exit: docker pipe fehlt).  
Vollständiger Apply der 85 auf PROD-Schemakopie → in **Phase 3 Generalprobe** (E3 Wegwerf-Projekt) oder lokal mit Docker.

Cron-Migration einsortiert: **`20261009160000` zuletzt** (nach Bucket `…150000`).

---

## 5 — Altes Frontend gegen neues Schema 🟢

| Thema | Ampel | Begründung |
|-------|-------|------------|
| `register_for_course` nur `p_course_id` | 🟢 | Defaults `p_use_pass=false`, `p_method=null` |
| `unregister_from_course` nur `p_course_id` | 🟢 | Soft-Cancel; optional `p_user_id` |
| `admin_register_user_for_course` (`p_user_id`,`p_course_id`) | 🟢 | Zusatzargs mit Defaults auf DEV |
| `admin_unregister_user_from_course` | 🟢 | Signatur kompatibel |
| Filter `cancellation_timestamp IS NULL` | 🟢 | A1 konsistent |
| Neue Spalten coverage_* | 🟢 | Alt liest sie nicht |
| Neue Seiten/RPCs | 🟢 | Alt ruft sie nicht |
| Kein 🔴 | — | Kein Kompatibilitäts-Alias nötig; Fenster Migration→Merge (~10 min) betrifft nur Buchungs-RPCs mit Defaults |

---

## Handgriff-Liste Release-Tag (Reihenfolge)

1. **T0-0** Backup PROD + Snapshot Zählwerte (Bestandsaufnahme §5)
2. **T0-1a** Dashboard: `pg_cron` + `pg_net` aktivieren (falls A6-3/B2 beim Push 2BP01/`extension`-Fehler zeigt — sonst A6-3/B2 installieren lassen)
3. **T0-1b** Migrationen: `db push --include-all` (Julius tippt) — endet mit `20261009160000_release_2026_10_cron`
4. Prüfen: 10 `yogaflow_*`-Jobs; Bucket `studio-legal` privat; `platform_flags.online_payments` aus
5. **Vault** (Namen §3): acht Einträge URL+Secret mit **PROD**-Function-URLs
6. **Edge Secrets** setzen (§3 Tabelle); kein `EMAIL_REDIRECT_TO`; Stripe leer; `PAYMENTS_MODE` leer
7. **Functions deploy** (alle Repo-Functions; nicht `reset-passwords`)
8. ops-monitor einmal auslösen — Mail nur an Julius; optional Heartbeat
9. Cloudflare `yogaflow-dev`: VITE Supabase/Domain; Stripe-VITE leer
10. Merge Frontend → Build-Check + Bundle-Merkmal
11. Smoke omlifytest; Yomita ansehen; A8 mit Testkundin (E5)

Phase 6 separat: Live-Stripe Secrets, Webhooks, `PAYMENTS_MODE=live`, VITE Stripe.

---

## Neue Migrationen (Dateinamen)

1. `supabase/migrations/20261009150000_release_2026_10_studio_legal_bucket.sql`
2. `supabase/migrations/20261009160000_release_2026_10_cron.sql`

---

## Haltestellen

1. **Probelauf 85 auf PROD-Schema** — Docker fehlt lokal; nachholen in Phase 3 (E3) oder mit Docker Desktop.
2. **E5 / E8** — weiterhin offen (Pilot „offen“, Hotfix Sitzung/Version).
3. Extension-Install auf PROD beim echten Push beobachten (T0-1a Fallback).

---

## Deploy-Nachweis (nach Push)

| | |
|--|--|
| HEAD | `da5a9bf` |
| Workers Builds: omlify-dev | `success` |
| Typen, Lint und Build | `success` |
| Live-Bundle-Merkmal | nicht nötig (nur SQL/Doku, keine UI-Änderung) |

## STOPP

Wartet auf Julius: Entscheidungen E1–E9 (Phase 2), Docker/Probe für 85er-Lauf (Haltestelle), T0-1a bei Extension-Fehler.
