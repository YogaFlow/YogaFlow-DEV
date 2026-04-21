# YogaFlow (YogaFlow-DEV)

React/Vite-App mit Supabase. **Repository:** [YogaFlow/YogaFlow-DEV](https://github.com/YogaFlow/YogaFlow-DEV) (Branch `Julius` = Entwicklung, Release per Pull Request nach `main`). **Cloudflare** muss genau dieses Repo nutzen – kein separates „YogaApp2“-Repository für Deployments.

Deployment: Cloudflare Workers (Git-Build, siehe `wrangler.toml`); `netlify.toml` kann für Legacy/Referenz bestehen bleiben.

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

**Multi-Tenant lokal:** Mandanten-Slug wird in Entwicklung/Preview üblicherweise per `?tenant=<slug>` gesetzt (ohne `hosts`-Datei); Details und Produktionsregeln in [docs/MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](docs/MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md) (US-MVP-E4-01, US-MVP-E4-08). In Production gilt nur Subdomain-Parsing, **kein** Query-Override.

## Build

- `npm run build` – Ausgabe in `dist/`. Cloudflare führt diesen Build aus und deployed per Wrangler (siehe `wrangler.toml`); `netlify.toml` beschreibt ggf. noch einen parallelen Netlify-Build.
