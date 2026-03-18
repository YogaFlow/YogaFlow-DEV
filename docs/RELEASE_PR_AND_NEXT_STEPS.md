# Release zu PROD – PR-Text und nächste Schritte

**Stand:** Julius wurde mit allen Änderungen committet und nach GitHub gepusht. Nächste Schritte liegen bei dir.

---

## 1. Pull Request erstellen (GitHub)

Gehe zu: **https://github.com/YogaFlow/YogaFlow-DEV** (oder der aktuellen Repo-URL) und erstelle einen **Pull Request von `Julius` → `main`**.

**Titel (Vorschlag):**  
`Release: Auth / E-Mail-Verifizierung, Migrationen, Edge Functions`

**Beschreibung (zum Kopieren):**

```markdown
## Inhalt
- **Auth/Frontend:** LoginForm, RegisterForm, AuthPage, VerifyEmail (E-Mail-Verifizierung, Passwort-Reset-Flows)
- **Migrationen:** 
  - `20260317190400_auth_tokens_use_actual_columns.sql`
  - `20260318100000_ensure_public_user_for_verification.sql`
- **Edge Functions:** request-verification-email (neu), Anpassungen in send-email, send-verification-email, verify-email, request-password-reset, reset-password
- **Docs:** EMAIL_SYSTEM_DOCUMENTATION.md
- **Supabase:** config.toml ergänzt

## Nach dem Merge
- Netlify baut automatisch von `main` (Live-Code).
- PROD-Datenbank und PROD-Secrets müssen manuell angepasst werden (siehe [DEV_PROD_SAFETY_WORKFLOW.md](docs/DEV_PROD_SAFETY_WORKFLOW.md) und unten).
```

Nach Review: PR in `main` mergen.

---

## 2. Nach dem Merge: PROD-Datenbank (Phase 2)

**Nur mit expliziter Bestätigung ausführen.** Pre-PROD-Checkliste: [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md).

1. `git checkout main` und `git pull origin main`
2. Backup im **PROD**-Supabase-Dashboard prüfen
3. Mit PROD verlinken: `supabase link --project-ref <PROD-Projekt-Ref>` (PROD-Datenbank-Passwort eingeben)
4. Migrationen anwenden: `supabase db push`
5. Live-Seite testen (Login, E-Mail-Verifizierung, Passwort-Reset)
6. **Wieder mit DEV verlinken:** `supabase link --project-ref <DEV-Projekt-Ref>`

---

## 3. Secrets (Phase 3)

### Netlify (Production)
- **Site → Environment variables → Production:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` mit **PROD**-Werten setzen bzw. prüfen.

### Supabase PROD – Edge Functions
- Mit PROD verlinkt: Edge Functions deployen: `supabase functions deploy` (oder einzeln).
- Im **PROD**-Supabase-Dashboard: **Project Settings → Edge Functions → Secrets** setzen:
  - `INTERNAL_EMAIL_SECRET`
  - `APP_URL` (Live-URL)
  - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`, ggf. `SENDER_EMAIL`

DEV-Secrets in DEV unverändert lassen.

---

## Checkliste (zum Abhaken)

- [x] Änderungen auf Julius committet und gepusht
- [ ] PR Julius → main erstellt (Beschreibung oben nutzen)
- [ ] Review und Merge
- [ ] Netlify-Build von main erfolgreich; Live-Seite prüfen
- [ ] Pre-PROD-Checkliste durchgegangen
- [ ] Mit PROD verlinkt, `supabase db push` ausgeführt
- [ ] Live-Seite getestet
- [ ] Wieder mit DEV verlinkt
- [ ] Netlify Production: PROD-Variablen gesetzt/geprüft
- [ ] Supabase PROD: Edge Functions deployed, Secrets gesetzt
