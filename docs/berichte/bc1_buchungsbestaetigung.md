# BC-1 — Buchungsbestätigung Vor-Ort + AGB v3

Stand: 2026-10-17 · Branch `Julius` · Status: **angehalten** (STOPP vor Merge — PR/PROD)  
Migration DEV: `20261016121000_bc1_booking_confirmed` · Functions: `dispatch-emails` deployed DEV  
Klicktest 1–7 grün · DEV-DB: 7× `booking_confirmed` gesendet, keine Duplikate, keine Fehler

---

## Entscheidungen (Julius nach Teil 0)

1. AGB als **`agb.v3.md`** (v2 unverändert).
2. `booking_confirmed` für alle Wege zu `registered` außer Online (inkl. Kurskarte, Owner-Eintrag).
3. Soft-Cancel: neue Zeile → Unique auf `(registration_id)` WHERE `kind='booking_confirmed'`.

### Soft-Cancel / Unique (Begründung)

A1: Abmelden setzt `status=cancelled`. Partieller Unique `registrations_active_course_user_key` gilt nur für `registered|waitlist|pending_payment`. Erneute Buchung = **neue** `registrations.id`.  
Daher reicht `UNIQUE (registration_id) WHERE kind = 'booking_confirmed'`. Test: buchen → abmelden → neu buchen → zwei Outbox-Zeilen; doppelter Register-Versuch → weiterhin eine.

---

## Teil 0 (Kurz)

Siehe vorheriger Halt in diesem Bericht / Chat. Vor-Ort hatte nie eine Bestätigungsmail.

---

## Umsetzung

### A — `booking_confirmed`

| Baustein | Ort |
|----------|-----|
| Kind + Shape-Check + Unique | Migration `20261016121000` |
| `yogaflow_private.enqueue_booking_confirmed` | idempotent, skip bei `coverage=paid` |
| Trigger + Session-Schalter | RPCs setzen `yogaflow.enqueue_booking_confirmed=on`; Seeds ohne Schalter |
| Dispatcher | `buildBookingConfirmedEmail`, kein Beleg-Gate; AGB via `attachTermsPdfOrWait` |
| Zahlungszeilen | `18,00 € · Zahlung vor Ort` / `kostenlos` / `Mit Kurskarte · noch N Termine` |

### B — AGB v3

- `docs/legal/studio/agb.v3.md` = v2 + Story-B-Wortlaut (4.2, 5.3, 8.3, 8.5)
- `legal_document_versions.studio_terms_tpl` → `2026-10-16` (Banner L3)
- DEV-Demos **nicht** auto-freigegeben (accepted bleibt `2026-10-08`)

### C — Owner-Kasten

`StudioLegalHub.tsx` über der Vorschau: „Das erledigt Omlify automatisch für dich“ (Punkte bedingt: Online / Karten).

### D — Tests

| Test | Ergebnis |
|------|----------|
| `scripts/test/bc1_booking_confirmed.mjs` | OK |
| `scripts/test/rt1_studio_legal_render.mjs` | OK (v3-Sätze) |
| `check_studio_legal_template_hashes` | OK (6 Versionen) |
| Deno `dispatch-emails/handler_test` (BC-1) | OK |
| `npm run check:ci` | OK |

---

## Dateiliste

- `supabase/migrations/20261016121000_bc1_booking_confirmed.sql`
- `supabase/functions/dispatch-emails/handler.ts`, `index.ts`, `handler_test.ts`
- `docs/legal/studio/agb.v3.md`
- `scripts/generate_studio_legal_templates.mjs`, `src/generated/studioLegalTemplates.ts`
- `src/components/settings/StudioLegalHub.tsx`
- `scripts/test/bc1_booking_confirmed.mjs`, `scripts/test/rt1_studio_legal_render.mjs`
- `docs/berichte/bc1_buchungsbestaetigung.md`, `docs/STAND.md`

---

## Teil 1 — Kompatibilität / Reihenfolge (nur lesen, 2026-10-17)

### Ist neue `dispatch-emails` mit altem PROD-Schema kompatibel?

**Ja.** Ohne Migration `20261016121000`:

- Kein neuer Kind-Wert in der Outbox möglich (PROD-CHECK ohne `booking_confirmed`).
- Der neue Handler-Zweig ist tot, bis Zeilen existieren.
- Kontext nutzt nur schon vorhandene Spalten: `coverage_status`, `price_cents_at_booking`, `pass_id`, `pass_movements` (auf PROD belegt).
- Keine neuen Client-RPCs; `enqueue_booking_confirmed` ist `yogaflow_private` und wird erst mit der Migration angelegt.
- Bestehende Kinds (`payment_succeeded` usw.) unverändert.

Function-Deploy **vor** Migration ist daher für den Dispatcher ungefährlich.

### Wo wird AGB v3 gerendert / geseedet?

| Was | Wo |
|-----|-----|
| Volltext `agb.v3.md` | **Frontend-Bundle** (`src/generated/studioLegalTemplates.ts`, Generator) |
| Zeiger „aktuelle Vorlage“ `studio_terms_tpl` = `2026-10-16` + Hash | **Migration** → `legal_document_versions` (kein Auto-Accept) |
| Banner `new_template` | RPC `get_studio_legal_status` vergleicht Accept mit DB-Zeiger |
| Preview/Freigabe-Body | Bundle: `renderStudioLegalKind` → neueste Vorlage im Bundle |

PROD heute: `studio_terms_tpl` = `2026-10-08` (v2).

### Zwischen Migration und Merge (altes Frontend)?

**Banner ohne v3-Text.** Migration setzt DB auf `2026-10-16` → Status `new_template`, aber altes Bundle hat nur v2 und `STUDIO_LEGAL_TEMPLATE_VERSION=2026-10-08`. Preview fällt auf v2 zurück (`findStudioLegalTemplateRelease`); Freigabe würde die Banner-Lücke nicht schließen.

### Reihenfolge (abweichend von Function → Migration → Frontend)

**Begründung:** Function ist schema-kompatibel, Migration+altes Frontend sind es für AGB **nicht**.

1. **Function** `dispatch-emails` (PROD) — inert bis Outbox
2. **Merge** Julius → main → Cloudflare PROD-Frontend (v3 im Bundle)
3. **Migration** (genau 1) — Banner + Enqueue erst wenn Preview v3 kann
4. Prüfabfragen / Live-Rauch

Nicht: Migration vor Merge.

---

## Klicktest Julius (DEV, demoalpha)

1. Als Teilnehmer vor Ort buchen → Mail „Du bist dabei“ mit „Zahlung vor Ort“ + AGB-PDF (oder Link, falls PDF noch generiert).
2. Kostenlosen Termin buchen → „kostenlos“.
3. Warteliste → keine Mail; Platz frei machen → Nachrücken → Mail.
4. Owner: Banner neue AGB-Version → Prüfen → Kasten sichtbar, Texte 4.2/5.3/8.3/8.5 neu → freigeben.
5. **Kurskarte:** mit Karte buchen → Mail „Mit Kurskarte · noch N Termine“; `pass_units_low` nur wenn noch 1 Termin (separat).

---

## Deploy-Nachweis Frontend (Haltestelle 5)

| Nachweis | Beleg |
|----------|-------|
| Commit | `246c7f8` (HEAD; Feature-Commits `c35ee69`…`5cd469f`) |
| Check-Run **Workers Builds: omlify-dev** | `success` · ID `116955003424` · completed `2026-10-16T11:42:24Z` |
| `version.json` | `{"build":"246c7f8c0656498141211713ae340fe0262b84bb"}` |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-Cg2ImhmS.js` |
| Merkmal | `Das erledigt Omlify automatisch` / `legal-auto-help` bei Index ~1005826 |

---

## PROD — Befehle für Julius (Agent führt nichts aus)

Pre-PROD-Checkliste: [docs/DEV_PROD_SAFETY_WORKFLOW.md](../DEV_PROD_SAFETY_WORKFLOW.md).  
**1 Migration:** `20261016121000_bc1_booking_confirmed`.

### 1) Function (vor Merge, von Julius-Checkout ok)

```powershell
npx.cmd supabase functions deploy dispatch-emails --project-ref otnhxzomnjjthocovasu --use-api
```

Nur diese eine Function. Kein `npm run functions:prod` (deployt alle und verlangt `main`).

### 2) Merge Julius → main

PR mergen. Cloudflare PROD-Build abwarten. Live-Bundle: Merkmal `Das erledigt Omlify automatisch` / `legal-auto-help`.

### 3) Migration (nach Merge, von `main`)

```powershell
git checkout main
git pull origin main
$env:SUPABASE_DB_PASSWORD = '<PROD-DB-PASSWORT>'
npx.cmd supabase link --project-ref otnhxzomnjjthocovasu

# Trockenlauf — erwartet genau 1 ausstehende Migration:
npx.cmd supabase db push --dry-run --db-url "postgresql://postgres.otnhxzomnjjthocovasu:<PROD-DB-PASSWORT>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

# Echt:
npx.cmd supabase db push --db-url "postgresql://postgres.otnhxzomnjjthocovasu:<PROD-DB-PASSWORT>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
```

Dry-run muss **nur** `20261016121000_bc1_booking_confirmed` listen. Sonst STOPP.

Danach CLI wieder auf DEV linken (`npm run supabase:link` / DEV-Ref).

### 4) Prüfabfragen (PROD SQL)

```sql
-- Migration da
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20261016121000';

-- AGB-Zeiger v3, kein Auto-Accept erzwingen
SELECT document, version, content_hash
FROM public.legal_document_versions
WHERE document = 'studio_terms_tpl';
-- erwartet: version 2026-10-16, hash 156ee1c1…ce04f18

-- Kind + Unique
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.email_deliveries'::regclass
  AND contype = 'c' AND conname LIKE '%kind%';
-- enthält booking_confirmed

SELECT indexname FROM pg_indexes
WHERE indexname = 'email_deliveries_booking_confirmed_reg_unique';

-- Enqueue-Helfer nur private
SELECT
  has_function_privilege('anon', 'yogaflow_private.enqueue_booking_confirmed(uuid)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'yogaflow_private.enqueue_booking_confirmed(uuid)', 'EXECUTE') AS auth_exec;
-- erwartet: false / false

-- RPCs mit Session-Schalter
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('register_for_course','promote_from_waitlist','admin_register_user_for_course')
  AND position('yogaflow.enqueue_booking_confirmed' IN pg_get_functiondef(p.oid)) > 0;
```

Live: Pilot vor Ort buchen → eine `booking_confirmed`-Mail; Owner-Banner AGB v3 mit neuem Text.

---

## STOPP

STOPP vor Merge. PR erstellen/CI prüfen (gh-Auth war lokal offen). Agent führt keine PROD-Befehle aus.
