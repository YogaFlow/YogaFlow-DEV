# Release 2026-10 — Abend-Checkliste

**Freeze:** `release-2026-10-freeze` = `origin/Julius` (NU-1 Teil 2 Freigabe + Zuklappen) · Branch `Julius` · PROD-Migrationen fehlend **92** · Release-Reihenfolge unverändert  
Der Hash steht nicht in dieser Datei: er ist der Commit, auf den der Tag zeigt. Ein zweiter Doku-Commit nur für den Hash würde das Bundle wieder ändern.
**Wer:** **J** = Julius tippt/klickt · **C** = Cursor (nur nach Freigabe, nie PROD-Passwort im Chat)  
**Passwort / Secrets / Keys:** nur Terminal oder Dashboard — **nie in Chat/Bericht**.

### Lehren aus der Probe (nicht verhandeln)

| Regel | Detail |
|-------|--------|
| Windows | immer `npx.cmd`, nie bloßes `npx` |
| DB-Push | nur Pooler `:5432` mit `--db-url` und Passwort **ausdrücklich** in der Shell (`$env:SUPABASE_DB_PASSWORD`) |
| Ein Versuch | Push bricht ab → **STOPP**, Stand prüfen (`db:status:prod` / Migrationen). **Kein** blinder Zweitversuch |
| Ref-Check | vor jedem PROD-Befehl: URL/Keys zeigen auf PROD-Ref, nicht DEV |
| Bundle nach Deploy | Nach **jedem** Frontend-Deploy (Schritt 15b und 18, gleich auf DEV `omlify-dev`): (1) aus der live `index.html` die `/assets/index-….js` direkt abrufen, `Content-Type` muss JavaScript sein, der Body darf nicht mit `<!doctype` beginnen. (2) `/assets/index-missing-probe.js` muss **404** sein, ohne `immutable` und ohne `text/html`. HTML, `200` oder `immutable` auf der Probe → Rollback auf den **vorigen** Deploy im Cloudflare-Dashboard. Kein neuer Build als erster Reflex. |

Quellen: [Generalprobe](berichte/release_2026-10_generalprobe.md) · [Freeze](berichte/release_2026-10_freeze_vorbereiten.md) · [Stripe-Live §5](berichte/release_2026-10_stripe_live_vorbereitung.md) · [Pre-PROD](DEV_PROD_SAFETY_WORKFLOW.md)

---

## T–60 — Vorbereitung

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 0 | Freeze prüfen | J/C | `git fetch --tags`; `git rev-parse HEAD origin/Julius release-2026-10-freeze` | alle drei derselbe Commit (NU-1 Teil 2 Freigabe + Zuklappen) | einer weicht ab → kein Abend |
| 1 | Backup PROD | J | GitHub Action `backup-prod` bzw. üblicher PROD-Backup | grün / frisch | Backup fehlt → STOPP |
| 2 | Snapshot Zählwerte | J/C | SQL wie Bestandsaufnahme §5 (Buchungen, Kurse, …) | notiert zum Vergleich | — |
| 3 | Pre-PROD-Checkliste | J | [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) | abgehakt | Zweifel → STOPP |
| 4 | **T0-0 Extensions** | J | Supabase PROD → Database → Extensions: **`pg_cron` + `pg_net` aktiv** | beide installed | fehlen → vor Push aktivieren; bei Push-Fehler `2BP01`/extension: Dashboard, dann Stand prüfen, **nicht** blind neu pushen |
| 5 | **T0-0 Vault** | J | Vault-Secrets anlegen (Namen unten), Werte = **PROD**-Function-URLs + frische Secrets | 8 Namen vorhanden | DEV-URL im Vault → STOPP, korrigieren |
| 6 | Edge-Secrets (ohne Stripe) | J | `npx.cmd supabase secrets set …` (PROD verlinkt) — siehe Tabelle unten | Namen gelistet; **kein** `EMAIL_REDIRECT_TO`, kein `DEMO_*` | `EMAIL_REDIRECT_TO` gesetzt → entfernen, STOPP |
| 7 | Cloudflare **vor Merge** | J | Worker **`yogaflow-dev`** (PROD←`main`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_BASE_DOMAIN=omlify.de`; Stripe-VITE **leer** | Namen stimmen | DEV-Keys auf PROD-Worker → STOPP |
| 8 | Stripe Dashboard vorbereiten | J | Live-Modus: Webhook-Ziele anlegen (noch ohne Schalter), Secrets notieren (lokal) | 2 Endpunkte bereit | — |

**Vault PROD** (`https://<PROD_REF>.supabase.co/functions/v1/…`):

`email_dispatch_url` + `email_dispatch_secret` · `ops_monitor_url` + `ops_monitor_secret` · `provider_jobs_url` + `provider_jobs_secret` · `legal_pdf_url` + `legal_pdf_secret`

**Edge-Secrets Release-Tag (Stripe noch leer):** `EMAIL_DISPATCH_SECRET`, `PROVIDER_JOBS_SECRET`, `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`, `LEGAL_PDF_SECRET`, `CALENDAR_ICS_SECRET`; optional `OPS_HEARTBEAT_URL`. `PAYMENTS_MODE` / `STRIPE_*` **leer** bis Phase 6. SMTP/APP_* behalten.

---

## Phase 5 — Schema · Functions · Frontend

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 9 | Link PROD | J | `$env:SUPABASE_DB_PASSWORD='…'` (nur Terminal); `npx.cmd supabase link --project-ref <PROD-REF>` | linked PROD | falsche Ref → STOPP |
| 10 | DB push | J | `npx.cmd supabase db push --include-all --db-url "postgresql://postgres.<PROD-REF>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"` | applied bis `20261015193000` (NU-1 Teil 2; **92** fehlende vor Push) | Abbruch → **STOPP**, Status prüfen; **kein** zweiter Push ohne Diagnose |
| 11 | Post-Push prüfen | J/C | SQL: `online_payments` **false**; `online_payments_rollout.mode = allowlist`; Allowlist **leer**; 10× `yogaflow_*` in `cron.job`; Bucket `studio-legal` | alles wie erwartet | Flag schon an / Allowlist nicht leer → Flag aus, Liste leeren, Ursache klären |
| 12 | Functions deploy | J | alle Repo-Functions; **nicht** `reset-passwords` | deploy ok; Payment ohne Stripe-Secret → `CONFIG_ERROR` ok | — |
| 13 | ops-monitor einmal | J | Cron/Invoke | Mail nur an Julius | Spam/fremde Adresse → Secret prüfen |
| 14 | PR `Julius`→`main` | J | GitHub Merge Freeze-Stand | Merge grün | CI rot → kein Merge |
| 15 | Cloudflare-Build | J | Workers Builds PROD abwarten | `success`; `version.json` = Merge-SHA | Build rot → Rollback Frontend (§ Rückweg) |
| 15b | Bundle ist JavaScript, fehlendes Asset ist 404 | J/C | Studio-Subdomain (z. B. `yomita.omlify.de`): `index.html` lesen, die darin genannte `/assets/index-….js` **direkt** abrufen. Danach `/assets/index-missing-probe.js` | JS: `200`, `Content-Type` JavaScript, Body beginnt nicht mit `<!doctype`. Probe: `404`, `Cache-Control` ohne `immutable`, nicht `text/html` | HTML, `200` oder `immutable` auf der Probe → Cloudflare-Dashboard: Rollback auf den vorigen Deploy von `yogaflow-dev`. Nicht sofort neu bauen |
| 16 | Smoke Plattform aus | J | `yomita.omlify.de` Owner: **kein** Stripe-/Online-Abschnitt | Plattform aus sichtbar | Online sichtbar trotz Flag aus → Kill-Switch prüfen, STOPP |

---

## Phase 6 — Stripe live · nur omlifytest · dann Yomita

| # | Schritt | Wer | Befehl / Klick | Erwartung | Abbruch |
|---|---------|-----|----------------|-----------|---------|
| 17 | Live-Webhooks | J | Stripe Live, URL `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook` | 2 Ziele aktiv (Liste unten) | falsche URL / Test-Modus → STOPP |
| 18 | Live-Secrets | J | Edge: `PAYMENTS_MODE=live`, `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_THIN`; Cloudflare: `VITE_PAYMENTS_MODE=live`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` → Rebuild | Secrets gesetzt; neuer Build; danach **dieselbe JS-Prüfung wie 15b** | Test-Key auf PROD → sofort entfernen, STOPP. JS ist HTML → Dashboard-Rollback auf den Deploy vor diesem Rebuild |
| 19 | Allowlist omlifytest | J | `SELECT public.set_online_payments_studio_allowed('omlifytest', true);` dann `SELECT public.set_platform_flag('online_payments', true);` | `list_online_payments_effective()` nur omlifytest | yomita schon sichtbar → Allowlist prüfen, Flag ggf. aus |
| 20 | Sichtbarkeit | J | omlifytest Owner: Stripe-Bereich da; **yomita: kein** Stripe-Bereich | getrennt | yomita sieht Stripe → STOPP vor Rauch |
| 21 | **Rauchtest Rechtliches** | J | `https://omlifytest.omlify.de/{impressum,agb,datenschutz}` und `https://yomita.omlify.de/…` (öffentlich) | Text lädt (kein „konnte nicht geladen“, kein Redirect `/auth`); Inhalt Studio-AGB bzw. Hinweis wenn noch nicht freigegeben | dauerhaft `/auth` oder Load-Fail nach Merge → Frontend/RPC prüfen, vor Live-Geld STOPP |
| 22 | Live-Rauch omlifytest | J | (a) Connect/Onboarding falls nötig · (b) Buchung **1 €** live · (c) **Erstattung** · (d) **Apple Pay** (Gerät) · (e) **Kurskarte** kaufen/einlösen | Zahlung + Erstattung in Stripe + `provider_events_raw` + Hauptbuch; Karte nutzbar | fehlgeschlagen → Flag aus und/oder Allowlist zurück (§ Rückweg), Webhooks pausieren |
| 23 | Webhook/Buch-Check | J/C | Events verarbeitet; Ledger-Zeilen passen | grün | stuck/failed Events → nicht Yomita freischalten |
| 24 | **Yomita freischalten** | J | `SELECT public.set_online_payments_studio_allowed('yomita', true);` | in `list_online_payments_effective`; Yomita richtet Stripe selbst ein | Rauch omlifytest nicht grün → **nicht** freischalten |

### Webhook-Ereignisse (Live)

**Ziel 1 — Verbundene Konten / Snapshot** (`STRIPE_WEBHOOK_SECRET`):  
`account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`

**Ziel 2 — Ihr Konto / Thin** (`STRIPE_WEBHOOK_SECRET_THIN`):  
`v2.core.account.created`, `v2.core.account.updated`, `v2.core.account.closed` (+ weitere `v2.core.account[…].updated` wie am DEV-Ziel — vor dem Abend vom DEV-Dashboard abschreiben)

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

1. Extensions + Vault + Secrets (ohne Stripe) + Cloudflare-Basis  
2. **Ein** Pooler-Push → prüfen → Functions  
3. Merge Frontend → Build → Plattform noch **aus**  
4. Live-Webhooks + Live-Secrets + Rebuild  
5. Nur **omlifytest** → Rechtliches + Live-Rauch → dann **Yomita**

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
