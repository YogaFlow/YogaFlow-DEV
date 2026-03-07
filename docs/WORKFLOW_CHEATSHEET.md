# Workflow-Cheatsheet

Kurzüberblick für den Entwicklungs- und Release-Alltag.

## Tägliche Regeln

- **Entwicklung nur auf Branch `Julius`** – nie direkt auf `main` entwickeln.
- **Lokal nur DEV** – `.env` enthält nur DEV-Supabase-URL und DEV-Anon-Key; PROD-Keys nie lokal speichern.
- **Release nur über Pull Request** – Änderungen von `Julius` nach `main` mit mindestens einer Review; dann baut Netlify automatisch.
- **Rollback:** Bei Problemen nach einem Deployment die Anleitung in [ROLLBACK.md](ROLLBACK.md) nutzen; beide (Julius und Geschäftspartner) können den Rollback durchführen.

## Ablauf: Neues Feature live bringen

1. In Cursor auf Branch **Julius** arbeiten, mit **DEV**-Datenbank (lokale `.env`).
2. Änderungen committen und nach GitHub pushen (`Julius`).
3. Auf GitHub: **Pull Request** von `Julius` → `main` erstellen.
4. Review durch den anderen (mind. 1 Approval).
5. Merge in `main` → Netlify baut und deployed; Live-Seite nutzt **PROD**-Datenbank (Netlify Env-Variablen).

## Wichtige Links im Repo

| Thema | Datei |
|--------|--------|
| DEV vs. PROD, Env-Variablen | [docs/ENVIRONMENTS.md](ENVIRONMENTS.md) |
| Rollback durchführen | [docs/ROLLBACK.md](ROLLBACK.md) |
| GitHub-Regeln für main | [docs/GITHUB_BRANCH_PROTECTION.md](GITHUB_BRANCH_PROTECTION.md) |
| Schema-Änderungen (DEV → PROD) | [docs/SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) |
| Datenbank DEV→PROD (Schritt für Schritt) | [docs/DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md) |

## PROD-Keys

- Nur in **Netlify** (Environment variables für Production) und ggf. im Passwortmanager ablegen.
- **Niemals** im Repo oder in lokaler `.env` speichern.
