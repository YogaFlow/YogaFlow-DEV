# BC-1 — Buchungsbestätigung Vor-Ort + AGB v3

Stand: 2026-10-16 · Branch `Julius` · Status: **angehalten** (Haltestelle 5 — Klicktest Julius)  
Migration DEV: `20261016121000_bc1_booking_confirmed` · Functions: `dispatch-emails` deployed DEV

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

## PROD — Migrationen / Schritte

**1 Migration** für PROD: `20261016121000_bc1_booking_confirmed`  
(additiv, kein Backfill)

Nach Merge Julius → main:

1. Cloudflare-Build Frontend abwarten
2. Julius: Pre-PROD-Checkliste → `db push` PROD (diese 1 Migration)
3. Edge Function **`dispatch-emails`** auf PROD deployen (`functions:prod` nur mit Bestätigung)
4. Live prüfen (Pilot-Studio / Pilot)

---

## Klicktest Julius (DEV, demoalpha)

1. Als Teilnehmer vor Ort buchen → Mail „Du bist dabei“ mit „Zahlung vor Ort“ + AGB-PDF (oder Link, falls PDF noch generiert).
2. Kostenlosen Termin buchen → „kostenlos“.
3. Warteliste → keine Mail; Platz frei machen → Nachrücken → Mail.
4. Owner: Banner neue AGB-Version → Prüfen → Kasten sichtbar, Texte 4.2/5.3/8.3/8.5 neu → freigeben.
5. **Kurskarte:** mit Karte buchen → Mail „Mit Kurskarte · noch N Termine“; `pass_units_low` nur wenn noch 1 Termin (separat).

---

## STOPP

Haltestelle 5 — Klicktest fällig. Deploy-Nachweis Frontend folgt nach Push (Check-Run `Workers Builds: omlify-dev` + Bundle-Merkmal).
