# Dokumentation

Übersicht der Anleitungen und Workflows für die YogaFlow-App.

## Einstieg

- **Alltag / Kurzüberblick:** [WORKFLOW_CHEATSHEET.md](WORKFLOW_CHEATSHEET.md) – tägliche Regeln, Ablauf „Feature bis Live“, Linktabelle zu allen Themen.
- **Ausführliche Anleitung:** [VOLLSTÄNDIGER_WORKFLOW.md](VOLLSTÄNDIGER_WORKFLOW.md) – von der Einrichtung bis zum Live-Deploy (Teil A: Einrichtung, Teil B: Feature bis Live, Teil C: Wenn etwas schiefgeht).

## Live-Hosting

- **Aktuell:** Nur **Cloudflare** (Git-Build + Wrangler, siehe `wrangler.toml` im Repo-Root). PROD-`VITE_*`-Variablen ausschließlich in den Cloudflare-Build-Einstellungen.

## Archiv: Bolt → Netlify (historisch)

- [BOLT_ZU_NETLIFY_WORKFLOW.md](BOLT_ZU_NETLIFY_WORKFLOW.md) – früherer Schritt-für-Schritt-Workflow; Netlify ist im Betrieb **deaktiviert**, dient nur noch als Nachschlagewerk.

## Weitere Themen

Alle weiteren Dokumente (Sicherheit DEV→PROD, Schema-Release, Rollback, Umgebungen, GitHub) findest du in der **Linktabelle** im [WORKFLOW_CHEATSHEET.md](WORKFLOW_CHEATSHEET.md).
