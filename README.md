# YogaApp2

React/Vite-App mit Supabase. Deployment über Netlify; Entwicklung auf Branch `Julius`, Release über Pull Request in `main`. Repo: **YogaFlow-DEV**.

## Dokumentation

**Übersicht aller Anleitungen:** [docs/README.md](docs/README.md)

- **[Workflow-Cheatsheet](docs/WORKFLOW_CHEATSHEET.md)** – Kurzüberblick für den Alltag: Branch, DEV/PROD, PR, Rollback.
- **[Vollständiger Workflow](docs/VOLLSTÄNDIGER_WORKFLOW.md)** – Von der Einrichtung bis zum Live-Deploy (Teil A–C).
- **[Umgebungen (DEV / PROD)](docs/ENVIRONMENTS.md)** – Wo welche Supabase-Env-Variablen setzen; Regeln, damit die Live-Datenbank geschützt bleibt.
- **[Sicherheit DEV→PROD](docs/DEV_PROD_SAFETY_WORKFLOW.md)** – Pre-PROD-Checkliste und Sicherheitsprinzipien.
- **[Schema-Release-Workflow](docs/SCHEMA_RELEASE_WORKFLOW.md)** – Datenbank-Änderungen (Migrationen) zuerst auf DEV testen, dann sicher auf PROD anwenden.
- **[Datenbank-Workflow (DEV→PROD, Schritt für Schritt)](docs/DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md)** – Technische Schritte mit Supabase CLI; was ein Cursor-Agent übernehmen kann.
- **[Rollback-Anleitung](docs/ROLLBACK.md)** – Code: Zurück zur letzten funktionierenden Version.
- **[Schema-Rollback](docs/SCHEMA_ROLLBACK_WORKFLOW.md)** – Schema-Änderungen auf PROD zurücknehmen (Gegen-Migration oder Backup).
- **[GitHub Branch Protection](docs/GITHUB_BRANCH_PROTECTION.md)** – Einrichtung der Regeln für `main` (PR + Review erforderlich).
- **[Asana-Checkliste Feature bis Live](docs/ASANA_CHECKLISTE_FEATURE_LIVE.md)** – Abhakbare Vorlage für den Feature-Release.

## Lokale Entwicklung

1. `.env.example` als `.env` kopieren und mit den **DEV**-Supabase-Werten füllen (siehe [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)).
2. `npm install` und `npm run dev` – die App nutzt dann die DEV-Datenbank.

## Build

- `npm run build` – Ausgabe in `dist/`. Netlify nutzt diese Einstellung (siehe `netlify.toml`).
