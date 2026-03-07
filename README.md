# YogaApp2

React/Vite-App mit Supabase. Deployment über Netlify; Entwicklung auf Branch `Julius`, Release über Pull Request in `main`.

## Dokumentation

- **[Umgebungen (DEV / PROD)](docs/ENVIRONMENTS.md)** – Wo welche Supabase-Env-Variablen setzen; Regeln, damit die Live-Datenbank geschützt bleibt.
- **[Rollback-Anleitung](docs/ROLLBACK.md)** – Schritt-für-Schritt: Zurück zur letzten funktionierenden Version, wenn nach einem Deployment Fehler auftreten.
- **[GitHub Branch Protection](docs/GITHUB_BRANCH_PROTECTION.md)** – Einrichtung der Regeln für `main` (PR + Review erforderlich).
- **[Workflow-Cheatsheet](docs/WORKFLOW_CHEATSHEET.md)** – Kurzüberblick für den Alltag: Branch, DEV/PROD, PR, Rollback.
- **[Schema-Release-Workflow](docs/SCHEMA_RELEASE_WORKFLOW.md)** – Datenbank-Änderungen (Migrationen) zuerst auf DEV testen, dann sicher auf PROD anwenden.
- **[Datenbank-Workflow (DEV→PROD, Schritt für Schritt)](docs/DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md)** – Technische Schritte mit Supabase CLI; was ein Cursor-Agent übernehmen kann.

## Lokale Entwicklung

1. `.env.example` als `.env` kopieren und mit den **DEV**-Supabase-Werten füllen (siehe [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)).
2. `npm install` und `npm run dev` – die App nutzt dann die DEV-Datenbank.

## Build

- `npm run build` – Ausgabe in `dist/`. Netlify nutzt diese Einstellung (siehe `netlify.toml`).
