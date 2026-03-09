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
| **Sicherheit DEV→PROD (Checkliste, Ablauf)** | [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) |
| DEV vs. PROD, Env-Variablen | [ENVIRONMENTS.md](ENVIRONMENTS.md) |
| Rollback durchführen (Code) | [ROLLBACK.md](ROLLBACK.md) |
| Schema-Rollback (Gegen-Migration, Backup) | [SCHEMA_ROLLBACK_WORKFLOW.md](SCHEMA_ROLLBACK_WORKFLOW.md) |
| GitHub-Regeln für main | [GITHUB_BRANCH_PROTECTION.md](GITHUB_BRANCH_PROTECTION.md) |
| Schema-Änderungen (DEV → PROD) | [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) |
| Datenbank DEV→PROD (Schritt für Schritt) | [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md) |
| Vollständiger Workflow (Einrichtung bis Live) | [VOLLSTÄNDIGER_WORKFLOW.md](VOLLSTÄNDIGER_WORKFLOW.md) |
| Migration Bolt → Netlify (bis Live-Stellung) | [BOLT_ZU_NETLIFY_WORKFLOW.md](BOLT_ZU_NETLIFY_WORKFLOW.md) |
| Asana-Checkliste Feature bis Live | [ASANA_CHECKLISTE_FEATURE_LIVE.md](ASANA_CHECKLISTE_FEATURE_LIVE.md) |

## PROD-Keys

- Nur in **Netlify** (Environment variables für Production) und ggf. im Passwortmanager ablegen.
- **Niemals** im Repo oder in lokaler `.env` speichern.
