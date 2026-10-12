# Bericht — Release 2026-10 Generalprobe (PROD-Kopie)

Stand: 2026-10-12 · Branch `Julius` · Probe-Ref `ehtfsejppefmktwlhiki` · Status: **STOPP — Probe noch nicht löschen**

## Kurz

Generalprobe auf PROD-Kopie durch: Schema-Push inkl. Freeze-Ausnahme Grants, T0/A/T0-3–5, Durchlauf B 11/12 grün, Schritt 8 Allowlist/Legal SQL grün, Schritt 9 Rückweg `main`→Probe mit bekannter Teilnehmerlisten-Lücke (PGRST201). Freeze-Ausnahmen 1–5 nur Frontend. **GO** für Release-Abend mit Julius-Frontend nach Merge; Probe bleibt bis Julius löscht.

---

## Ampel je Schritt

| Schritt | Ampel | Kurzbeleg |
|---------|-------|-----------|
| Restore PROD→Probe | 🟢 | ~18 s; Ref-Check ≠ DEV/PROD |
| Grants-Align + `db push --include-all` | 🟢 | inkl. `20261004205900` → Ende `20261009161100` |
| Vault / Mail dry | 🟢 | 0 versendet; Auth-Mails 0 (Claude-Probe-Logs) |
| T0-2 → A → T0-3/4/5 | 🟢 | Cron manuell; kein `run_geldkette` |
| Durchlauf B | 🟢 11/12 | 1–3, 5, 7, 9–12 ✅ (4/6/8 Dashboard/User tippen) |
| Freeze-Ausnahmen 1–5 Frontend | 🟢 | A8-Text belegt; K1 nur Monate empfohlen; Impressum-Refetch; Hash nur Tooltip/sr-only; PDF-Link UI |
| Schritt 8 Rest SQL | 🟢 | Plattform/Allowlist/Legal/Onboarding-Kontext — Details unten |
| Schritt 9 `main` vs Probe | 🟡 | Login/Kurse/Buchen/Abmelden 🟢; Teilnehmerliste 🔴 PGRST201 |
| `check:ci` / Push / DEV-Build / Freeze-Tag | 🟢 | nach diesem Bericht nachziehen |

---

## Laufzeiten (Probe)

| Aktion | Dauer / Hinweis |
|--------|-----------------|
| Restore (`data_probe` + roles/schema) | **~18 s** |
| `db push --include-all` über Pooler `:5432` | Minutenband (89er+ Align); **ein** Lauf — bei Abbruch nicht blind wiederholen |
| Edge Functions deploy (Probe) | nach Secrets; kein Stripe/SMTP |
| Durchlauf B | manuell Julius; Mails 0 |

---

## Freeze-Ausnahmen (Frontend, keine Migration)

### 1 — A8-Text

Copy übernommen: Titel „Frühere Kurse als erledigt markieren“, Text inkl. „kein Geld … niemand benachrichtigt“.

**Beleg zuvor:** `waive_coverage_internal` / A8-Pfad setzt nur Coverage-erledigt — keine Zahlungsbuchung, keine Outbox-Mails, keine `user_notifications`. Text fachlich korrekt.

### 2 — Kurskarte Gültigkeit

Nur **„Monate ab Kauf (empfohlen)“** (K3 / Entscheidung 15, 12 Monate). Option „Jahre bis Jahresende“ ohne Zusatz.

### 3 — Impressum Refetch

`LegalProfileSection` ruft nach Speichern `onSaved` → Hub lädt Status/Vorschau neu.

### 4 — Prüfsumme Owner

`content_hash` nicht sichtbar; gekürzt nur `sr-only` + `title` Tooltip (`Avv`/`Terms`).

### 5 — AGB-PDF

| Prüfung | Ergebnis |
|---------|----------|
| Objekte in Bucket `studio-legal` / `has_pdf` | 🟢 vorhanden auf Probe |
| Storage-Policies `studio-legal` SELECT | 🔴 Probe **0** Policies auf `storage.objects`; Live-PROD nur `studio_branding_*` |
| UI-Link „PDF“ aktuelle Fassung | gebaut (`openStudioLegalPdf` + Hub) |
| Trivial nutzbar? | **Nein** — Client-`createSignedUrl` braucht SELECT-Policy; weder Probe noch PROD hat `studio-legal`-Policies |

→ Befund im Bericht; Download über Client-Signed-URL nicht freigeben bis Policy/Edge-Weg geklärt. Keine Migration in dieser Ausnahme.

---

## Schritt 8 — Rest SQL (Ref `ehtfsejppefmktwlhiki`)

Vorher: `online_payments=false`, Modus `allowlist`, Allowlist leer, Yomita/omlifytest je 0 `provider_accounts`.

| Prüfung | Ergebnis |
|---------|----------|
| Plattform kurz an → Yomita `platform_visible=false`, Block `PLATFORM_DISABLED`, `list_online_payments_effective.studios=[]`, 0 Provider-Konten → wieder aus | 🟢 |
| Onboarding-Kontext Yomita Owner | `get_owner_payment_context` → `platform_enabled: false` |
| Edge `payments-onboarding` start | 🟡 `500 CONFIG_ERROR` (Probe ohne Stripe-Keys — Freeze-Empfehlung). Handler würde bei konfiguriertem Provider zuerst `PLATFORM_DISABLED` liefern |
| Neues Studio (`onboarding-public` begin + signUp) | 🟢 genau 3 Zeilen `avv,privacy,terms`; Status-RPCs `accepted:true` → kein Banner |
| Runbook §5 `omlifytest` freischalten / Liste / zurück | 🟢 sichtbar nur omlifytest bei Flag+Allowlist; Yomita weiter `PLATFORM_DISABLED`; am Ende Flag aus, Allowlist 0 |

### Restore-Nebenbefund Auth-Trigger

Nach Restore fehlten auf der Probe `on_auth_user_created` / `on_auth_user_app_metadata` (Live-PROD hat beide). Für Legal-Test nachgezogen (PROD-Parität). **PROD-Abend: kein Restore → kein Risiko.** Künftige Proben: Auth-Trigger nach Restore prüfen.

Teststudio `prb5iqkdm` wieder entfernt.

---

## Schritt 9 — Frontend `main` (`06710c1`) gegen migrierte Probe

| Pfad | Ampel | Beleg |
|------|-------|-------|
| Login User/Owner | 🟢 | Vite `main` @5174 + Probe-Anon |
| Kursliste | 🟢 | Kurse geladen (u. a. Test Kurs, Yoga …) |
| Buchen / Abmelden | 🟢 | UI „Anmeldung/Abmeldung erfolgreich“; RPC nur `{ p_course_id }` ok |
| Teilnehmerliste | 🔴 | UI „0 Teilnehmer“; Ursache: `user:users(*)` → **PGRST201** (FKs `user_id` / `cancelled_by` / `coverage_waived_by`). Mit FK-Hint ok |

**Fazit Rückweg:** Altes `main`-Frontend überlebt Schema für Login/Kurse/Buchung. Staff-Teilnehmerliste braucht Julius-Frontend (Embed-Hints). Erwartbare Durchlauf-A-/Rückweg-Lücke — kein NO-GO für Merge Julius→main am Abend, solange Frontend mitmerged.

---

## Abweichungen / Lehren

1. **Probe ≠ Live-PROD bei Restore:** `users` Tabellen-UPDATE (Fix-Migration), Auth-Trigger fehlen, Storage-Policies fehlen — Align-Skripte + Trigger-Check in Probe-Runbook.
2. **Push nur über Pooler `--db-url`**, Passwort ausdrücklich; `npx.cmd` unter Windows; bei Abbruch **kein** zweiter Blind-Push.
3. **Mails:** dry/0 versendet — vor Vault-URL belegt.
4. **courses Tabellen-UPDATE** bleibt OFFENE_PUNKTE (nicht Push-Blocker).
5. **PDF Client-Download** braucht Storage-Policy oder Edge — nicht Teil Freeze-Frontend.

---

## Endgültige Release-Abend-Reihenfolge

Befehle so tippen (PROD nur mit Julius-Bestätigung). Ref-Check immer vorher.

### Phase 5 — Schema / Functions / Frontend

```powershell
# 0) Branch/Tag
cd E:\Business\YogaFlow\Code\YogaApp2-main
git fetch origin
git log -1 --oneline origin/Julius
# Freeze-Tag muss auf dem Hash liegen, den du pushst (nach Generalprobe-Fixes)

# 1) Pre-PROD-Checkliste: docs/DEV_PROD_SAFETY_WORKFLOW.md
# 2) Dashboard PROD: pg_cron + pg_net aktiv (falls nicht)

# 3) Link + Push — Passwort ausdrücklich, Pooler 5432, EINGE Versuch
$env:SUPABASE_DB_PASSWORD = '<PROD-DB-PASSWORT>'
# Windows: npx.cmd
npx.cmd supabase link --project-ref <PROD-REF>
npx.cmd supabase db push --include-all --db-url "postgresql://postgres.<PROD-REF>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
# Bei Abbruch: STOPP, Stand prüfen — kein sofortiger Zweitversuch ohne Diagnose

# 4) Prüfen
# platform_flags.online_payments = false
# online_payments_rollout.mode = allowlist, Allowlist leer
# 10 yogaflow_* Cron-Jobs

# 5) Secrets live + Functions deploy (nicht reset-passwords)
# 6) PR Julius → main mergen; Cloudflare-Build PROD abwarten
```

### Phase 6 — aktiv + Allowlist (Runbook §5)

```sql
-- Nur omlifytest zuerst
SELECT public.set_online_payments_studio_allowed('omlifytest', true);
SELECT public.set_platform_flag('online_payments', true);

-- Prüfen: yomita nicht sichtbar; omlifytest sichtbar
SELECT public.list_online_payments_effective();
```

Dann: Rauchtest omlifytest (Stripe live klein), Webhooks/`provider_events_raw`/Hauptbuch.

```sql
-- Nach grünem Rauch: Yomita
SELECT public.set_online_payments_studio_allowed('yomita', true);
```

Rückzug:

```sql
SELECT public.set_platform_flag('online_payments', false);
-- und/oder
SELECT public.set_online_payments_studio_allowed('omlifytest', false);
SELECT public.set_online_payments_studio_allowed('yomita', false);
```

---

## GO / NO-GO

| Frage | Urteil |
|-------|--------|
| Schema-Push + Align auf Probe | **GO** |
| Kernflüsse B (ohne getippte 4/6/8) | **GO** |
| Allowlist / Legal-Onboarding | **GO** |
| Rückweg altes main für Staff-Teilnehmer | **NO-GO allein** — mit Julius-Frontend **GO** |
| PDF Client-Download | **NO-GO** (Policy fehlt) — nicht Release-Blocker für Online-Zahlungen |
| Release-Abend gesamt | **GO** mit Julius-Frontend-Merge, Allowlist-Reihenfolge, Probe danach löschen |

**Gesamt: GO** — Probe stehen lassen bis Julius löscht.

---

## Deploy-Nachweis Freeze-Ausnahmen (nach Push)

| | |
|--|--|
| Commit | _(nach Push eintragen)_ |
| Workers Builds: omlify-dev | _(success)_ |
| Live-Merkmal | String `Frühere Kurse als erledigt markieren` in `https://demoalpha.omlify-dev.de/assets/index-*.js` |
| Tag `release-2026-10-freeze` | neuer Hash |

## STOPP

Wartet auf Julius: Bericht lesen → Probe löschen → Release-Abend nach Phase 5/6.
