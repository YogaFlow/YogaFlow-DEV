# Bericht — Release 2026-10 · Stripe live + Freigabe pro Studio + Onboarding-Zustimmungen

Stand: 2026-10-12 · Branch `Julius` · Status: **angehalten (STOPP — Klicktest)**  
Vorgänger: [release_2026-10_freeze_vorbereiten.md](release_2026-10_freeze_vorbereiten.md)

Entscheidung Julius: **Option A Allowlist** mit Modi `allowlist` | `all` + RT-2-Fix Registrierung — beides vor Freeze gebaut.

---

## Ampel

| § | Thema | Ampel |
|---|--------|-------|
| 1 | Freigabe pro Studio (Allowlist + Modi) | 🟢 Migration `20261009161000`, Tests grün |
| 1b | RT-2 Zustimmungen bei Registrierung | 🟢 Migration `20261009161100`, Tests grün |
| 2 | Live-Konfiguration | 🟡 unverändert (siehe frühere Abschnitte) |
| 3 | Aktive Prüfungen ~30 min | 🟢 |
| 4 | Live-Rauchtest `omlifytest` | 🟢 Ablauf |
| 5 | Release-Abend-Ablauf | 🟢 mit Allowlist-Runbook |

**Gesamt vor Freeze:** 🟢 fachlich für Freigabe/Zustimmung; Freeze/85er getrennt.

---

## 1 — Freigabe Online-Zahlung pro Studio 🟢

### Modell (gebaut)

Wirksam freigeschaltet =

- `platform_flags.online_payments` an **und**
- (`online_payments_rollout.mode = 'all'` **oder** Studio in `online_payments_studio_allowlist`)

| Objekt | Zweck |
|--------|--------|
| `public.online_payments_rollout` | eine Zeile, `mode` ∈ {`allowlist`,`all`}, Default `allowlist` |
| `public.online_payments_studio_allowlist` | `tenant_id` PK |
| `yogaflow_private.online_payments_platform_visible(tenant)` | wirksame Sichtbarkeit |
| `online_payments_effective` | visible ∧ Owner-Schalter `online_payments_enabled` |

Schreiben nur `service_role` (kein GRANT für anon/authenticated). Lesen des wirksamen Ergebnisses über `get_payment_setup_status.platform_enabled`.

### Gates (serverseitig)

| Pfad | Verhalten wenn nicht sichtbar |
|------|-------------------------------|
| `online_method_block_reason` | `PLATFORM_DISABLED` (vor Studio-Schalter / STUDIO_LEGAL_…) |
| `set_online_payments_enabled(true)` | `PLATFORM_DISABLED` |
| `get_payment_setup_status` / `get_owner_payment_context` | `platform_enabled: false` → UI Online-Abschnitt aus |
| `online_payments_effective` → prepare/checkout | Online nicht buchbar, kein PI |

**Erstattung:** bestehende Online-Zahlungen bleiben erstattbar (Kursabsage / `request_refund`), auch wenn Studio von der Allowlist genommen wird — sonst steckt Geld. Neue Connect-/Checkout-Objekte entstehen nicht.

### Seed

- **DEV:** alle bestehenden Studios auf Allowlist (Kennzeichen Demo-Slug `demoalpha`/`demobeta`/`e2eapp`).
- **PROD:** Liste leer, Modus `allowlist` (kein Demo-Slug).

Migration nach Cron `20261009160000` (DEV hatte Cron schon; fachlich unabhängig).

### Runbook-SQL (PROD / service_role)

```sql
-- Studio freischalten
SELECT public.set_online_payments_studio_allowed('omlifytest', true);
SELECT public.set_online_payments_studio_allowed('yomita', true);

-- Freischaltung zurücknehmen
SELECT public.set_online_payments_studio_allowed('omlifytest', false);

-- Modus
SELECT public.set_online_payments_rollout('all');
SELECT public.set_online_payments_rollout('allowlist');

-- Plattform-Kill-Switch
SELECT public.set_platform_flag('online_payments', true);
SELECT public.set_platform_flag('online_payments', false);

-- Welche Studios sind wirksam freigeschaltet?
SELECT public.list_online_payments_effective();
```

### Tests

`scripts/test/online_payments_allowlist.mjs` — allowlist A an/B aus, Owner kann Modus/Liste nicht schreiben, mode `all` inkl. neuem Studio, Plattform aus → niemand. In `run_geldkette.mjs`.

---

## 1b — RT-2 Zustimmungen bei Registrierung 🟢

### Ursache

| Schritt | Datei | Verlust |
|---------|-------|---------|
| Häkchen AGB+Datenschutz + AVV | `OnboardingWizard.tsx` | nur UI-Gate |
| `begin` ohne Legal-Parameter | bisher nur `p_name`/`p_slug` | keine Speicherung |
| `sessionStorage yogaflow_pending_legal_bundle` | Apex-Origin | Login auf `{slug}.omlify-dev.de` → Flag weg |
| Banner | `ContractUpdateBanner.tsx` | schreibt nur wenn Flag da |

### Fix

1. `begin_tenant_onboarding(p_name, p_slug, p_legal_accepted)` — `true` Pflicht; setzt `tenants.onboarding_legal_accepted_at = now()`.
2. `handle_new_user`: bei Owner-Onboarding (frisches Studio) → `record_onboarding_legal_acceptances` für **terms, privacy, avv** mit `accepted_at = onboarding_legal_accepted_at`. Fehlt Zustimmung oder Insert scheitert → Sign-up bricht ab.
3. Edge `onboarding-public` + Client übergeben `p_legal_accepted: true`; kein Pending-Flag mehr.

### PROD

Ja: ohne diesen Fix würden neue Studios über denselben Apex→Subdomain-Weg ohne `legal_acceptances` entstehen. Mit Fix im Release: **nein**.

### Test

`scripts/test/onboarding_legal_acceptances.mjs` — 3 Zeilen, aktuelle Versionen/Hashes, `accepted_at` = Häkchen-Zeit, Status accepted.

---

## 2–4 — Live-Konfig / Prüfungen / Rauchtest

Unverändert inhaltlich (Secrets, Webhooks, Cron von Hand, Rauchtest `omlifytest`). Siehe frühere Version dieses Berichts bzw. [RELEASE_GELDKETTE_PLAN.md](../RELEASE_GELDKETTE_PLAN.md) §0.3/0.6.

**Hinweis Erstattung:** Allowlist blockiert keine Refunds bestehender Zahlungen.

---

## 5 — Release-Abend-Ablauf (aktualisiert)

Modus bleibt **`allowlist`**. Reihenfolge:

### A — Vor Merge

1. Cloudflare `yogaflow-dev`: `VITE_PAYMENTS_MODE=live`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…`.
2. Stripe Live-Webhooks (beide Ziele) + Secrets notieren.
3. Branding/Zahlungsmethoden Connected Accounts ok.

### B — Schema/Functions PROD

4. 85er+Push inkl. `20261009161000` / `20261009161100` (DEV: 204 Migrationen; PROD lag bei ~114 → Differenz prüfen vor Freeze).
5. Secrets live + Functions + Vault.
6. Prüfen: `platform_flags.online_payments = false`; `online_payments_rollout.mode = allowlist`; Allowlist **leer**.

### C — Merge Frontend

7. PR mergen; Build abwarten.
8. Beliebiges Studio (z. B. yomita): kein Online-Zahlung-Abschnitt (Plattform aus).

### D — Aktive Prüfungen (~30 min)

9. 10 Cron-Jobs von Hand; Mail; ops-monitor.

### E — Nur omlifytest

10. `SELECT public.set_online_payments_studio_allowed('omlifytest', true);`
11. `SELECT public.set_platform_flag('online_payments', true);`
12. Kurz: yomita → **kein** Stripe-Bereich; omlifytest → Stripe-Bereich da.
13. Rauchtest §4 in `omlifytest`.
14. Webhooks + `provider_events_raw` + Hauptbuch.

### F — Yomita

15. Nach grünem Rauchtest: `SELECT public.set_online_payments_studio_allowed('yomita', true);`
16. Yomita richtet Stripe selbst ein (Klickweg).

### G — Rückzug

17. `set_platform_flag('online_payments', false)` und/oder Studio von Allowlist nehmen.
18. Webhooks pausieren bei Störfeuer.

---

## Migrationen (Stand DEV 12.10.)

| | |
|--|--|
| DEV applied | **204** (bis `20261009161100`) |
| Neu in diesem Auftrag | `20261009161000_online_payments_studio_allowlist`, `20261009161100_onboarding_legal_acceptances` |
| PROD zuletzt (Freeze-Bericht) | `20260928213000` (~114) → Push mit `--include-all` |

---

## DoD / Nachweis

- `npm run check:ci` grün
- `npm run dev:apply` grün (beide Migrationen)
- Tests: `online_payments_allowlist`, `onboarding_legal_acceptances`, `security_signup_role` grün
- `npm run functions:dev` (inkl. `onboarding-public`)
- DEV: platform an, mode allowlist, Allowlist = alle 8 Studios

---

## Klicktest Julius (DEV) — STOPP

Studio-Zugänge: `supabase/.env.dev`.

### A1 — Allowlist

1. SQL: `SELECT public.set_online_payments_studio_allowed('demoalpha', false);` (Plattform bleibt an, Modus allowlist).
2. Als Owner demoalpha: Einstellungen › Zahlungen → **kein** Abschnitt Online-Zahlung / Stripe; Kursdetail → Online nicht wählbar (nur vor Ort / Karte).
3. SQL: `SELECT public.set_online_payments_studio_allowed('demoalpha', true);` → Stripe-Bereich wieder da wie vorher.

### A2 — Modus `all`

1. SQL: `SELECT public.set_online_payments_rollout('all');`
2. Neues Studio über Onboarding anlegen (kurze URL) → als Owner: Stripe-Bereich **sofort** sichtbar (Plattform an vorausgesetzt).
3. SQL: `SELECT public.set_online_payments_rollout('allowlist');` zurück.

### B1 — Zustimmungen

1. Neues Studio registrieren (Häkchen AGB+Datenschutz + AVV).
2. Nach E-Mail-Bestätigung Login auf Subdomain → **kein** Banner „AGB (v2) · AVV (v2)“.
3. Einstellungen › Rechtliches: drei Zustimmungen (AGB, Datenschutz, AVV) mit Datum.

---

## STOPP

Wartet auf Julius’ Klicktest A1 / A2 / B1. Danach Freeze.
