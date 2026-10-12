# Bericht — Release 2026-10 Generalprobe (PROD-Kopie)

Stand: 2026-10-12 · Branch `Julius` · Probe-Ref `ehtfsejppefmktwlhiki` · Status: **STOPP — GO-Bedingungen (Hotfix main + PDF)**

## Kurz

Generalprobe auf PROD-Kopie durch. **GO mit zwei Bedingungen vor Release** (unten Nachtrag): (1) PGRST201-Hotfix auf `main`, (2) PDF-Link ausgeblendet. Probe bleibt bis Julius löscht.

---

## Ampel je Schritt

| Schritt | Ampel | Kurzbeleg |
|---------|-------|-----------|
| Restore PROD→Probe | 🟢 | ~18 s; Ref-Check ≠ DEV/PROD |
| Grants-Align + `db push --include-all` | 🟢 | inkl. `20261004205900` → Ende `20261009161100` |
| Vault / Mail dry | 🟢 | 0 versendet; Auth-Mails 0 (Claude-Probe-Logs) |
| T0-2 → A → T0-3/4/5 | 🟢 | Cron manuell; kein `run_geldkette` |
| Durchlauf B | 🟢 11/12 | 1–3, 5, 7, 9–12 ✅ (4/6/8 Dashboard/User tippen) |
| Freeze-Ausnahmen 1–5 Frontend | 🟢 | A8/K1/Impressum/Hash; PDF-Link **wieder ausgeblendet** (keine Storage-Policy) |
| Schritt 8 Rest SQL | 🟢 | Plattform/Allowlist/Legal/Onboarding-Kontext — Details unten |
| Schritt 9 `main` vs Probe | 🟢→Hotfix | Login/Kurse/Buchen/Abmelden 🟢; Teilnehmerliste per FK-Hint (Branch `hotfix/pgrst201-registration-embeds`) |
| `check:ci` / Push / DEV-Build / Freeze-Tag | 🟢 | Tag `release-2026-10-freeze`; nach main→Julius **neu setzen** |

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
| UI-Link „PDF“ | gebaut, dann **ausgeblendet** (Owner-Download ohne Policy nicht möglich) |
| `createSignedUrl` Probe | scheitert (kein brauchbarer Owner-Download) |

→ OFFENE_PUNKTE: „AGB-PDF für Owner herunterladbar machen (signierter Link)“. Keine Storage-Policies vor Release.

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

## Schritt 9 — Frontend `main` gegen migrierte Probe (Rückweg)

| Pfad | Ampel | Beleg |
|------|-------|-------|
| Login User/Owner | 🟢 | Vite `main` @5174 + Probe |
| Kursliste | 🟢 | Kurse geladen |
| Buchen / Abmelden | 🟢 | UI ok; RPC `{ p_course_id }` ok |
| Teilnehmerliste (unhinted `06710c1`) | 🔴 | PGRST201 |
| Teilnehmerliste (Hotfix FK-Hint) | 🟢 | Probe: 3 Zeilen inkl. User-Name |

### Embed-Scan (main-Muster → Probe)

| Stelle | Embed | Probe |
|--------|-------|-------|
| `Participants.tsx` | `user:users(*)` | **PGRST201** |
| `Participants.tsx` Fix | `users!registrations_user_id_fkey` + `courses!registrations_course_id_fkey` | 🟢 |
| `MyCourses.tsx` | `teacher:users!courses_teacher_id_fkey` (schon) | 🟢 |
| `MyCourses` hypothetisch ohne Hint | `teacher:users(*)` | PGRST201 (courses→canceled_by) — **nicht im main-Code** |
| `Messages` | `user:user_id(...)` | 🟢 |
| Dashboard / MyRegistrations | `course:courses(*)` | 🟢 (eine FK) |
| `Users.tsx` | `courses(id,title,date)` | 🟢 |

### Kompatibilität altes PROD-Schema

Live-PROD (readonly): nur `registrations_user_id_fkey` + `registrations_course_id_fkey` (kein `cancelled_by` / `coverage_waived_by`). Hint-Namen existieren → Fix ist vorwärts- und rückwärtskompatibel. Unhinted funktioniert auf PROD heute noch; nach Migrationen nicht.

---

## Abweichungen / Lehren

1. **Probe ≠ Live-PROD bei Restore:** `users` Tabellen-UPDATE (Fix-Migration), Auth-Trigger fehlen, Storage-Policies fehlen — Align-Skripte + Trigger-Check in Probe-Runbook.
2. **Push nur über Pooler `--db-url`**, Passwort ausdrücklich; `npx.cmd` unter Windows; bei Abbruch **kein** zweiter Blind-Push.
3. **Mails:** dry/0 versendet — vor Vault-URL belegt.
4. **courses Tabellen-UPDATE** bleibt OFFENE_PUNKTE (nicht Push-Blocker).
5. **PDF:** Link ausgeblendet; später OFFENE_PUNKTE.

---

## Nachtrag — GO-Bedingungen vor Release

### 1 — Hotfix `main` (PGRST201)

| | |
|--|--|
| Branch | `hotfix/pgrst201-registration-embeds` (`b73b7d8`) von `origin/main` |
| Änderung | `src/pages/Participants.tsx` — FK-Hints |
| PR | https://github.com/YogaFlow/YogaFlow-DEV/compare/main...hotfix/pgrst201-registration-embeds?expand=1 |
| Nach Merge | PROD Teilnehmerliste prüfen → `main` in `Julius` mergen → **neuer Freeze-Hash** + Tag |

### 2 — PDF-Link

Owner-PDF-Links in `StudioLegalHub` entfernt; `openStudioLegalPdf` entfernt. OFFENE_PUNKTE aktualisiert.

---

## Endgültige Release-Abend-Reihenfolge

**Vor Phase 5:** Hotfix `main` gemergt, PROD Teilnehmerliste grün, `main`→`Julius`, Freeze-Tag neu.

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
| Rückweg `main` (nach Hotfix) | **GO** (Teilnehmerliste mit FK-Hint) |
| PDF Owner-Download | ausgeblendet — kein Blocker |
| Release-Abend gesamt | **GO** nach Merge Hotfix + Freeze-Tag neu; Allowlist-Reihenfolge; Probe danach löschen |

**Gesamt: GO mit Bedingungen** — Hotfix-PR mergen (Julius), dann Freeze neu; Probe stehen lassen.

---

## Deploy-Nachweis Freeze-Ausnahmen (nach Push)

| | |
|--|--|
| UI-Commit | `2ccbef9` `fix(ui): Generalprobe Freeze-Ausnahmen A8, K1, Legal-Hub` |
| Docs | `8199c04` Bericht · Nachweis-Commits bis Freeze-Tag |
| `npm run check:ci` | 🟢 vor UI-Push (`2ccbef9`) |
| Workers Builds: omlify-dev | 🟢 `success` für `8199c04` ([run](https://github.com/YogaFlow/YogaFlow-DEV/runs/114930454686)); Bundle enthält UI-Merkmal |
| CI Typen/Lint/Build | 🟢 `success` |
| Live-Merkmal | `Frühere Kurse` / `erledigt markieren` / `legal-current-pdf` in `https://demoalpha.omlify-dev.de/assets/index-BQQ1ojyf.js` (Index ~1510164 / ~991923) |
| Tag `release-2026-10-freeze` | force-update auf Julius HEAD inkl. UI `2ccbef9` (`git rev-parse release-2026-10-freeze`) |

## STOPP

Wartet auf Julius: Bericht lesen → Probe löschen → Release-Abend nach Phase 5/6.
