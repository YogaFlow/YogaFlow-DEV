# Bericht — Release 2026-10 · Stripe live am Release-Abend (E4 neu)

Stand: 2026-10-12 · Branch `Julius` · **nur lesen + Doku** · Status: **angehalten (STOPP)**  
Vorgänger: [release_2026-10_freeze_vorbereiten.md](release_2026-10_freeze_vorbereiten.md) · [RELEASE_GELDKETTE_PLAN.md](../RELEASE_GELDKETTE_PLAN.md) §0.3/0.6/0.10  
Entscheidung Julius (E4 neu): **kein 24-h-Warten** — Release und Stripe live am selben Abend; Yomita erst nach bestandenem Live-Test in `omlifytest`.

Stripe-Dashboard (Julius, 12.10.): Plattformkonto live verifiziert, Connect eingerichtet, Branding gesetzt, Zahlungsmethoden für verbundene Konten gesetzt. **Noch keine** Live-Webhooks, keine Live-Secrets in Supabase/Cloudflare.

PROD-Ref (nur lesen): `otnhxzomnjjthocovasu` · URL `https://otnhxzomnjjthocovasu.supabase.co`  
PROD-Studios u. a.: `omlifytest`, `yomita`, `omstudio1`, … · Geldkette-Schema (`platform_flags` etc.) auf PROD **noch nicht** (kommt mit 85er-Push).

---

## Ampel

| § | Thema | Ampel | Kurz |
|---|--------|-------|------|
| 1 | Freigabe pro Studio | 🔴 **Haltestelle** | Plattform an → **alle** Studios sehen Stripe-UI; keine Allowlist |
| 2 | Live-Konfiguration | 🟡 | Liste klar; CF-Vars vor Merge; Domain automatisch; keine festen `pmc_…` |
| 3 | Aktive Prüfungen ~30 min | 🟢 | SQL/Klickwege für 10 Cron + Mail + ops + Webhook |
| 4 | Live-Rauchtest `omlifytest` | 🟢 | Ablauf + erwartete Ergebnisse |
| 5 | Release-Abend-Ablauf | 🟡 | hängt an Haltestelle §1 vor Freeze |

**Gesamt vor Freeze:** 🔴 wegen §1 — ohne Studio-Allowlist (oder bewusstes Risiko) Zieltiefe „Yomita sieht nichts“ nicht erreichbar.

---

## 1 — Freigabe pro Studio 🔴 Haltestelle

### 1.1 Wie wird heute gesteuert?

Zwei Schalter, **keine Allowlist**:

| Ebene | Speicherung | Wer setzt | Wirkung |
|-------|-------------|-----------|---------|
| **Plattform** | `public.platform_flags` · `key = 'online_payments'` · Spalte `enabled` | nur `service_role` via RPC `set_platform_flag(p_key, p_enabled)` — Migration `20260928203500` ~482–538; DEV-Helfer `scripts/dev/platform_flag.mjs` (nur DEV) | Global. UI und Server prüfen `yogaflow_private.platform_flag('online_payments')` |
| **Studio** | `public.tenant_payment_settings.online_payments_enabled` | nur **Owner** via `set_online_payments_enabled(boolean)` — u. a. `20261004200000` ~342–449 / RT-1 `20261005120000` ~1178+ | Online-Zahlung als Buchungsweg; setzt voraus: Plattform an, Provider ready, Steuer, Legal, AVV, (RT-1) Studio-Rechtstexte |

**UI-Sichtbarkeit „Online-Zahlung / Stripe“**

| Stelle | Datei:Zeile | Regel |
|--------|-------------|-------|
| Abschnitt Einstellungen › Zahlungen | `src/features/payments/OnlinePaymentSection.tsx:2–3, 63–70, 104` | Client-Config (`VITE_*`) muss `enabled` sein; danach: wenn `platform_enabled === false` → `return null` (unsichtbar) |
| Status-RPC | `get_payment_setup_status` liefert `platform_enabled` aus `platform_flag('online_payments')` — zuletzt u. a. `20261005120000` / ZW-1 | Owner+Admin dürfen Status lesen; Schalter nur Owner |
| Buchungsweg Online | `yogaflow_private.online_method_block_reason` — `20261004200000:121–125` | ohne Plattform → `PLATFORM_DISABLED`; ohne Studio-Schalter → `ONLINE_DISABLED` |
| Onboarding starten | `supabase/functions/payments-onboarding/handler.ts:144–145` | Plattform aus → `409 PLATFORM_DISABLED` |
| Einstellungen-Aufmerksamkeit | `src/lib/settingsOverview.ts:86–93` | bei `platformEnabled === true` erscheinen u. a. Steuer-/Anbieter-Hinweise auch ohne Online an |

**Nicht vorhanden:** Tenant-Allowlist, Feature-Flag pro Slug, Plattform-„Freischalten dieses Studios“.

### 1.2 Ziel: Plattform an, nur `omlifytest`, Yomita sieht nichts — geht das?

**Nein.** Sobald `platform_flags.online_payments = true` und Cloudflare `VITE_PAYMENTS_MODE=live` + `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` gesetzt sind:

- **Yomita** (Owner) sieht Einstellungen › Zahlungen › Abschnitt Online-Zahlung inkl. CTA zum Stripe-Verbinden (`OnlinePaymentSection`, Status `not_started`).
- Onboarding und Live-Konto-Anlage sind für jedes Studio erlaubt (nur Plattform-Gate, kein Studio-Gate).
- Aufmerksamkeitspunkte (Steuer/Anbieter für Online) können in den Einstellungen auftauchen.

Studio-Schalter `online_payments_enabled` steuert nur, ob Online **buchbar** ist — nicht, ob der Stripe-Bereich sichtbar ist.

### 1.3 Haltestelle — kleinstmöglicher Vorschlag (vor Freeze)

**Vorschlag A (empfohlen, klein, sauber):** Studio-Allowlist vor dem Freeze.

1. Migration: Tabelle z. B. `public.online_payments_studio_allowlist (tenant_id uuid PRIMARY KEY REFERENCES tenants)` — nur `service_role` schreibt; keine Client-Policies.
2. Helfer `yogaflow_private.online_payments_platform_visible(p_tenant uuid)` = `platform_flag('online_payments') AND EXISTS (allowlist für p_tenant)`.
3. Diesen Helfer in: `get_payment_setup_status.platform_enabled`, `online_method_block_reason`, `payments-onboarding` start (und ggf. refresh). UI bleibt unverändert (`platform_enabled === false` → unsichtbar).
4. Release-Abend: Allowlist nur `omlifytest`; nach Rauchtest `yomita` eintragen.

**Vorschlag B (Notfall, hässlich):** in denselben drei Stellen hart `slug IN ('omlifytest')` — muss vor allgemeinem Rollout wieder raus.

**Nicht ausreichend:** „Yomita einfach nicht sagen“ — widerspricht der Entscheidung.

**STOPP** bis Julius A/B/Risiko freigibt. Ohne Freigabe kein Freeze mit „Platform an + Live-Keys“.

### 1.4 Freischalten eines Studios (Runbook — heutiger Stand ohne Allowlist)

Nach Allowlist (A) zusätzlich Zeile 0.

```sql
-- 0) nur mit Allowlist (Vorschlag A), service_role / SQL-Editor PROD:
-- INSERT INTO public.online_payments_studio_allowlist (tenant_id)
-- SELECT id FROM public.tenants WHERE slug = 'omlifytest'
-- ON CONFLICT DO NOTHING;

-- 1) Plattform an (service_role — PostgREST oder SQL nach Deploy der Migration):
SELECT public.set_platform_flag('online_payments', true);

-- 2) Prüfen:
SELECT key, enabled FROM public.platform_flags;
SELECT t.slug, s.online_payments_enabled, s.allow_onsite_payment
FROM public.tenants t
LEFT JOIN public.tenant_payment_settings s ON s.tenant_id = t.id
WHERE t.slug IN ('omlifytest', 'yomita');
```

**Klickweg Studio (Owner, in der App):**

1. Einstellungen › Rechtliches: Impressum, AGB/Datenschutz freigeben, AVV bestätigen, Anbieterangaben.
2. Einstellungen › Zahlungen: Steuerstatus setzen → Stripe verbinden (Embedded Onboarding) → warten bis Status aktiv → Schalter **Online-Zahlung** an (Vor Ort nach Bedarf).
3. Optional: Online ausschalten bleibt Owner-Sache (`set_online_payments_enabled(false)`), solange Vor Ort an (`LAST_METHOD`).

**Yomita freischalten (nach Rauchtest):** Allowlist-Insert für `yomita` (A) bzw. sie sieht den Bereich automatisch, sobald Plattform an ist (heute) — dann gleicher Klickweg.

---

## 2 — Live-Konfiguration 🟡

### 2.1 Supabase-Secrets (nur Namen)

| Secret | Quelle Stripe-Dashboard (Live) | Unterschied zu Test |
|--------|--------------------------------|---------------------|
| `PAYMENTS_MODE` | — Wert `live` | DEV: `test` |
| `STRIPE_SECRET_KEY` | Developers → API keys → **Secret key** (Live) | Prefix `sk_live_`/`rk_live_` vs. `sk_test_`/`rk_test_` |
| `STRIPE_WEBHOOK_SECRET` | Webhooks → Ziel **Verbundene Konten** (Snapshot) → Signing secret | eigenes Live-`whsec_…`, nie DEV kopieren |
| `STRIPE_WEBHOOK_SECRET_THIN` | Webhooks → Ziel **Ihr Konto** / Thin (v2) → Signing secret | eigenes Live-`whsec_…` |
| `STRIPE_WEBHOOK_SECRET_2` | nur bei Rotation | optional leer lassen |
| `APP_BASE_DOMAIN` | — | PROD: `omlify.de` (DEV: `omlify-dev.de`) |
| `PAYMENTS_PROVIDER` | — | **nie** auf PROD setzen |

Zusätzlich (nicht Stripe, aber Release-Abend): `PROVIDER_JOBS_SECRET`, Vault `provider_jobs_*`, Mail/ops/legal wie Freeze-Bericht §3.

### 2.2 Cloudflare Worker `yogaflow-dev` (PROD ← `main`)

**Vor dem Merge setzen** (E4 neu — Build soll schon live sein):

| Variable | Wert-Art |
|----------|----------|
| `VITE_PAYMENTS_MODE` | `live` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (Publishable key Live) |
| `VITE_APP_BASE_DOMAIN` | `omlify.de` (bereits) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | PROD (bereits) |

**Beleg: bei ausgeschalteter Freigabe nichts Stripe-UI**

- `paymentsClientConfig()` (`src/lib/paymentsClientConfig.ts:65–86`) braucht Mode+Key → ohne Vars: Bezahlen aus.
- **Mit** Live-Vars, aber `platform_enabled = false`: `OnlinePaymentSection` → `return null` (Zeilen 63–70, 104). Kein Onboarding-CTA.
- Server: `online_method_block_reason` → `PLATFORM_DISABLED`; Onboarding → 409.
- Sidebar „Zahlungen“ bleibt (Vor-Ort/offen/Hauptbuch) — **kein** Stripe-Connect-UI.
- Hinweis: Bundle kann trotzdem Stripe.js + `pk_live_…` enthalten, wenn Vars gesetzt sind — das ist Quelltext im JS, keine sichtbare Stripe-Oberfläche.

### 2.3 Webhooks live

**URL (beide Ziele gleich):**  
`https://otnhxzomnjjthocovasu.supabase.co/functions/v1/payments-webhook`

| Ziel | Stripe-UI | Secret | Ereignisse (aus Code + Plan 0.6) |
|------|-----------|--------|-----------------------------------|
| **Verbundene Konten** · Snapshot | Connect / Connected accounts | `STRIPE_WEBHOOK_SECRET` | `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` — Adapter `PAYMENT_EVENT_TYPES` / `REFUND_*` / `DISPUTE_*` in `_shared/payments/stripe/adapter.ts:92–108` plus Account-Zweige |
| **Ihr Konto** · Thin | Platform account | `STRIPE_WEBHOOK_SECRET_THIN` | `v2.core.account.created`, `v2.core.account.updated`, `v2.core.account.closed` und `v2.core.account[…].updated` (`isV2CoreAccountEventType`, Zeilen 114–119). **Exakte Liste vom DEV-Testziel im Dashboard abschreiben** (Julius) |

### 2.4 Connect

| Thema | Stand im Code |
|-------|----------------|
| Kontotyp | Accounts **v2** (`v2.core.accounts.create`), `dashboard: "full"`, Fees/Losses Collector Stripe, Capability `card_payments` — `CONNECTED_ACCOUNT_PARAMS` `adapter.ts:43–61`. Entspricht **voller Dashboard-Zugang** (eher Standard als Express-Light). |
| Onboarding | Embedded **Account Session** (`accountSessions` + `account_onboarding`) — `onboarding.ts:25–28`. **Keine** klassischen Account-Link-`return_url`/`refresh_url`. |
| Branding | Plattform-Dashboard (Julius bereits gesetzt). |
| Checkout-`return_url` | Serverseitig: `https://{slug}.omlify.de/my-registrations?payment=return` bzw. `…/my-passes?payment=return` — `payments-checkout/handler.ts:211–224` (`APP_BASE_DOMAIN=omlify.de`). |

### 2.5 Apple Pay / Google Pay — Payment Method Domains

Domain: `{slug}.{APP_BASE_DOMAIN}` → `omlifytest.omlify.de`, später `yomita.omlify.de`.

**Automatisch im Code:**

- Onboarding-`refresh` bei aktivem Konto → `registerPaymentDomain` (`payments-onboarding/handler.ts:255–269`)
- Checkout-`prepare` best-effort (`payments-checkout/handler.ts:175–192`)
- Online-Schalter an triggert `refresh` (K1)

**Nicht** nur „beim Verbinden“ einmal — bei aktiv + refresh/prepare. Scheitert best-effort (Checkout läuft trotzdem).

**Runbook-Fallback:** Stripe Dashboard am Connected Account → Payment method domains → Domain anlegen; oder PROD-Analog zu `scripts/dev/register_payment_domain.mjs` (Skript ist DEV-gebunden — von Hand/Dashboard reicht).

### 2.6 Feste Test-IDs im Code?

| Suche | Ergebnis |
|-------|----------|
| `pmc_` / `payment_method_configuration` | **0 Treffer** im Repo |
| Preise/Produkte Stripe | keine — Beträge aus Kurs/`pass_products` |
| Webhook-Endpunkt-IDs / feste `acct_…` | nur Fixtures/Tests (`acct_fixture_…`), nicht Produktion |

**Keine Haltestelle** wegen fester Live/Test-IDs. Mode wird über Secrets/`PAYMENTS_MODE` und Key-Prefix erzwungen (`CONFIG_ERROR` / `KEY_MODE_MISMATCH`).

### 2.7 Zahlungsmethoden vs. Code

Julius Live „Default“ für verbundene Konten: Karten, Apple Pay, Google Pay an; Rest inkl. **Link** aus.

Code erwartet genau das:

- `paymentMethodTypes: ['card']`, Wallets `applePay`/`googlePay` `auto`, **`link: 'never'`** — `src/features/payments/stripePaymentWallets.ts:7–39`
- `paymentMethodOrder: ['apple_pay', 'google_pay', 'card']`
- PaymentIntent: `payment_method_types: ['card']` — `adapter.ts:365–369`

**Link wird nirgends vorausgesetzt.** Dashboard-Link-aus passt.

---

## 3 — Aktive Prüfungen (~30 min) 🟢

Voraussetzung: Migrationen + Vault + Secrets + Functions auf PROD; Cron-Jobs existieren (`cron.job` wie `20261009160000`).

Ausführung: Supabase SQL Editor als Rolle mit Rechten auf die Funktionen (typisch **postgres** / Dashboard), **nicht** als App-User.

### 3.1 Zehn Cron-Jobs einmal von Hand

| # | Job | Von Hand auslösen | Danach prüfen |
|---|-----|-------------------|---------------|
| 1 | `yogaflow_expire_payment_holds` | `SELECT yogaflow_private.expire_payment_holds();` | kein Fehler; optional Zähler |
| 2 | `yogaflow_expire_pass_payment_attempts` | `SELECT yogaflow_private.expire_pass_payment_attempts();` | ok |
| 3 | `yogaflow_dispatch_emails` | `SELECT yogaflow_private.invoke_email_dispatch();` | ohne Vault: no-op/Log; mit Vault: Outbox bewegt sich |
| 4 | `yogaflow_process_provider_jobs` | `SELECT yogaflow_private.invoke_provider_jobs();` | ohne Vault: no-op; mit: Jobs `done`/leer |
| 5 | `yogaflow_process_legal_pdf` | `SELECT yogaflow_private.invoke_legal_pdf_jobs();` | wie Vault |
| 6 | `yogaflow_process_ledger` | `SELECT yogaflow_private.process_ledger();` bzw. `SELECT public.process_ledger(500);` | `failed = 0` (oder erwartete Warte ohne Steuer) |
| 7 | `yogaflow_ops_monitor` | `SELECT yogaflow_private.invoke_ops_monitor();` | siehe 3.3 |
| 8 | `yogaflow_expire_passes` | `SELECT public.expire_passes(500);` | Integer-Rückgabe, kein Fehler |
| 9 | `yogaflow_pass_expiry_reminders` | `SELECT public.enqueue_pass_expiry_reminders();` | Events/Outbox; ohne fällige Karten oft 0 |
| 10 | `yogaflow_retention_cleanup` | `SELECT yogaflow_private.invoke_retention_cleanup();` bzw. `SELECT public.retention_cleanup();` | kein Fehler |

Gemeinsame Prüfung:

```sql
SELECT jobid, jobname, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobname LIKE 'yogaflow_%'
ORDER BY start_time DESC
LIMIT 30;
```

Erwartung: frische Läufe, `status` ohne unerwartete `failed` (no-op ohne Vault zählt als ok, wenn Command ohne Exception).

### 3.2 Mail

| Prüfpunkt | Klickweg |
|-----------|----------|
| Bestätigung mit AGB-PDF | Neue Registrierung / Onboarding in `omlifytest` → Mail kommt an, PDF-Anhang/Link |
| Passwort-Mail | Passwort vergessen auf `omlifytest.omlify.de` → Mail an |

Zusätzlich nach `invoke_email_dispatch`: Outbox/`email_deliveries` für das Test-Studio (nur eigene Zeilen).

### 3.3 ops-monitor

1. `SELECT yogaflow_private.invoke_ops_monitor();`
2. Kein unerwarteter Alarm an `OPS_ALERT_EMAIL`.
3. Wenn `OPS_HEARTBEAT_URL` gesetzt: Heartbeat-Dienst zeigt Ping; sonst optional (STAND: auf DEV oft nicht gesetzt).

### 3.4 Webhook-Zustellung live

Nach erster Live-Zahlung / Konto-Update:

1. Stripe Dashboard → Webhooks → Ereignis **zugestellt** (2xx).
2. SQL: `SELECT event_type, processing_error, created_at FROM provider_events_raw ORDER BY created_at DESC LIMIT 20;` — neue Zeilen, `processing_error` null (oder bekannter transient).
3. Nach `process_ledger` / Cron: Hauptbuch-Zeilen für die Testzahlung in `omlifytest`.

---

## 4 — Live-Rauchtest `omlifytest` 🟢

Studio: `https://omlifytest.omlify.de` · echte Karte · kleine Beträge.

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| 0 | Voraussetzungen: Plattform (+ Allowlist), Secrets live, Webhooks, CF-Vars, Vault | Einstellungen › Zahlungen zeigt Online-Abschnitt nur in `omlifytest` (nach §1-Fix) |
| 1 | Owner: Steuer, Legal, AVV, Studio-Texte → Stripe verbinden → Status aktiv | `get_payment_setup_status`: `onboarding` aktiv; Domain `omlifytest.omlify.de` registriert |
| 2 | Online-Zahlung an | Schalter grün; Buchung bietet Online |
| 3 | Einzeltermin **1,00 €**, Teilnehmerin zahlt mit echter Karte | PI succeeded; Anmeldung bezahlt; Beleg; Mail; Teilnehmerliste Zahlstatus bezahlt |
| 4 | Owner: Zahlungen › Hauptbuch | Buchung sichtbar (nach Ledger-Lauf) |
| 5 | Volle Erstattung über Omlify | Stripe Refund; Webhook; Beleg-Storno; Mail; Status erstattet |
| 6 | Kurskarte online (kleinster Preis) kaufen | wie Kurs: Beleg + Mail + Karte aktiv |
| 7 | Karte erstatten / Widerruf laut Produktregeln | Webhook + Beleg/Mail |
| 8 | iPhone Safari: Checkout Apple Pay sichtbar? | Wallet-Zeile (Domain + Stripe-Dashboard-Methoden); Gerät/Karte vorausgesetzt — wenn unsichtbar: Domain + Dashboard prüfen |

Abbruchkriterium: jeder Schritt ohne erwartetes Ergebnis → Live für Yomita **nicht** freigeben; Plattform ggf. wieder aus (`set_platform_flag(..., false)` — Studio-Zeilen bleiben stehen, UI weg).

---

## 5 — Durchgehender Release-Abend-Ablauf (Phase 5 + 6 + Yomita)

Reihenfolge zum Tippen/Klicken. **Voraussetzung:** Haltestelle §1 entschieden (Allowlist gebaut oder bewusstes Risiko akzeptiert). Freeze-/Schema-Schritte aus Freeze-Bericht bleiben vorgeschaltet (Extensions, 85er-Push, Functions, Vault Mail/ops/legal).

### A — Vor Merge (Cloudflare + Stripe Dashboard)

1. Cloudflare `yogaflow-dev`: `VITE_PAYMENTS_MODE=live`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` setzen (Build nach Merge ist dann live).
2. Stripe Live: zwei Webhook-Endpunkte auf `…/functions/v1/payments-webhook` anlegen; Ereignisliste §2.3; Signing Secrets notieren (nicht committen).
3. Branding/Zahlungsmethoden Connected Accounts bereits ok (Julius).

### B — Nach Schema/Functions auf PROD (Phase 5 Rest)

4. Supabase Secrets: `PAYMENTS_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_THIN`, `APP_BASE_DOMAIN=omlify.de` (+ Jobs/Mail wie Freeze §3).
5. Functions-Deploy inkl. `payments-webhook`, `payments-onboarding`, `payments-checkout`, `payments-jobs` (Reihenfolge Freeze-Bericht).
6. Vault `provider_jobs_url/secret` setzen (zuletzt).
7. Prüfen: `platform_flags.online_payments = false` (noch aus); `tenant_payment_settings` leer bzw. ohne Online.

### C — Merge Frontend → Build

8. PR Julius → main mergen; Cloudflare-Build `yogaflow-dev` abwarten.
9. Kurzcheck: auf einem Studio **ohne** Plattform-an → Einstellungen › Zahlungen **ohne** Online-Zahlung-Abschnitt.

### D — Aktive Prüfungen (§3) ~30 min

10. Alle 10 Cron-Jobs von Hand (§3.1) + `cron.job_run_details`.
11. Mail-Rauch (Bestätigung/PDF, Passwort).
12. `invoke_ops_monitor` — kein Fehlalarm.
13. (Webhooks erst nach Schritt 16–18 voll prüfbar.)

### E — Stripe live nur `omlifytest` (Phase 6 / E4)

14. Allowlist: nur `omlifytest` (falls A gebaut) **oder** STOPP wenn ohne Fix.
15. `SELECT public.set_platform_flag('online_payments', true);`
16. Rauchtest §4 Schritte 1–8 in `omlifytest`.
17. Webhook-Zustellung + `provider_events_raw` + Hauptbuch (§3.4).

### F — Yomita freischalten

18. Erst wenn §4 grün: Allowlist `yomita` **oder** (ohne Allowlist) Yomita den Klickweg mitteilen — sie richtet Stripe selbst ein.
19. Optional kleine Live-Zahlung bei Yomita; sonst Beobachtung.

### G — Rückzug bei Problemen

20. Sofort: `set_platform_flag('online_payments', false)` → Stripe-UI weg für alle; Secrets können stehen bleiben.
21. Webhooks im Dashboard pausieren/deaktivieren bei Störfeuer.
22. Code-Rollback nur nach [docs/ROLLBACK.md](../ROLLBACK.md) — Schema bleibt Expand.

---

## Quellen (Belege)

- UI-Gate: `OnlinePaymentSection.tsx:2–3, 63–70, 104`
- Client-Config: `paymentsClientConfig.ts`
- Plattform/Studio: Migration `20260928203500`, ZW-1 `20261004200000`, RT-1 `20261005120000`
- Webhook-Events: `adapter.ts:92–119`; Plan `RELEASE_GELDKETTE_PLAN.md` §0.6
- Connect v2: `CONNECTED_ACCOUNT_PARAMS`; Onboarding Session: `onboarding.ts`
- Domains: `payments-onboarding/handler.ts:255–269`, `payments-checkout/handler.ts:175–192`
- Wallets/Link: `stripePaymentWallets.ts`
- Cron-Commands: `20261009160000_release_2026_10_cron.sql`
- PROD-Tenants / fehlendes `platform_flags`: MCP `user-supabase-prod-readonly` 12.10.2026
- DEV: `platform_flags.online_payments = true`; `demoalpha` Online an; `yomita` ohne `tenant_payment_settings`

---

## STOPP

Wartet auf Julius:

1. **Haltestelle §1** — Allowlist (A), Hardcode (B), oder akzeptiertes Risiko?
2. Danach: Freeze + Release-Abend nach Ablauf §5.
3. Kein Code/Migration in diesem Auftrag; Commit nur dieser Doku + `STAND.md`.
