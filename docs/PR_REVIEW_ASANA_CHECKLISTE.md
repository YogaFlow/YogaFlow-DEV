# PR-Review Asana-Checkliste: Julius → main

Diese Checkliste ist für den **Reviewer** beim Prüfen eines Pull Requests von **Julius** nach **main**. Du kannst sie als Vorlage in Asana nutzen: Pro PR eine Aufgabe anlegen und die Punkte als Subtasks oder Checklisten-Items abhaken.

**Wichtig:** Der Merge in `main` ändert **nicht** die PROD-Datenbank. Schema-Änderungen (Migrationen) werden erst später bewusst angewendet – siehe [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) und [WORKFLOW_CHEATSHEET.md](WORKFLOW_CHEATSHEET.md).

---

## Verwendung in Asana

- **Option A:** Pro PR eine Aufgabe „PR Review: [PR-Titel oder -Nummer]“ anlegen, alle Punkte als **Subtasks** oder als **Checkliste in der Aufgabe**.
- **Option B:** Die zwei Blöcke (Allgemeiner Review / Falls Migrationen) als zwei Abschnitte in derselben Checkliste; die „Falls Migrationen“-Punkte nur abhaken, wenn der PR Dateien unter `supabase/migrations/` enthält.
- **Option C:** Den Checklisten-Text (`- [ ] …`) in die Aufgabenbeschreibung kopieren; Asana erkennt oft Checkboxen.

Der „Nach dem Merge“-Reminder kann als letzte Unteraufgabe in derselben Aufgabe stehen oder als separater Folgetask (siehe [Asana-Struktur](#asana-struktur-konkret) unten).

---

## Checkliste (zum Kopieren / Abhaken)

### Block 1 – Allgemeiner Review (immer)

- [ ] PR-Beschreibung vorhanden und verständlich (was geändert, warum)
- [ ] Keine sensiblen Daten im PR: keine PROD-Supabase-URL, kein PROD-Anon-Key, kein PROD-Project-Ref in geänderten Dateien oder Commits
- [ ] Keine hart codierten PROD-Referenzen im Code; Umgebung nur über Env-Variablen (`VITE_SUPABASE_*`)
- [ ] Geänderte Dateien und Logik nachvollziehbar; keine offensichtlichen Fehler oder versehentlichen Änderungen
- [ ] (Optional) Build/App wurde vom Author auf DEV getestet (kann in der PR-Beschreibung stehen)

### Block 2 – Falls Migrationen im PR

*Nur abhaken, wenn im PR Dateien unter `supabase/migrations/` geändert oder neu hinzugefügt wurden.*

- [ ] Migrationsdateien enthalten **nur Schema-Änderungen** (CREATE TABLE, ALTER TABLE, RLS, Indizes, Trigger, Funktionen); **keine** DELETE/UPDATE/INSERT auf echte Nutzer- oder Produktivdaten
- [ ] Dateinamen im Format `YYYYMMDDHHMMSS_kurzbeschreibung.sql`; Zeitstempel logisch (nach bestehenden Migrationen)
- [ ] Wo möglich idempotent (z. B. `IF NOT EXISTS`, `DROP … IF EXISTS`)
- [ ] PR-Beschreibung nennt die Schema-Änderung (was / warum)

### Block 3 – Nach dem Merge (Erinnerung, optional)

- [ ] **Falls der PR Migrationen enthielt:** Die PROD-Datenbank wird **nicht** automatisch aktualisiert. Bei Bedarf die [Pre-PROD-Checkliste in DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md#pre-prod-checkliste-vor-jedem-prod-db-push) abarbeiten und `db push` auf PROD zu einem geplanten Zeitpunkt ausführen.

Die vollständige Pre-PROD-Checkliste wird hier nicht wiederholt – siehe [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md).

---

## Asana-Struktur (konkret)

Empfohlene Task- und Subtask-Texte zum Übernehmen in Asana:

### Haupttask (pro PR)

| Feld | Inhalt |
|------|--------|
| **Name** | `PR Review: Julius → main – [PR-# oder Kurztitel]` |
| **Beschreibung** | Link zum GitHub-PR; optional Copy-paste der Checklisten-Punkte aus dem Abschnitt „Checkliste“ oben. |

### Unteraufgaben / Checklisten-Items

**Allgemeiner Review (immer):**

1. PR-Beschreibung vorhanden und verständlich (was geändert, warum)
2. Keine sensiblen Daten im PR (keine PROD-URL, kein PROD-Key, kein PROD-Ref)
3. Keine hart codierten PROD-Referenzen; nur Env-Variablen (`VITE_SUPABASE_*`)
4. Geänderte Dateien und Logik nachvollziehbar; keine offensichtlichen Fehler
5. (Optional) Author hat auf DEV getestet (in PR-Beschreibung erwähnt)

**Falls Migrationen im PR (nur wenn `supabase/migrations/` betroffen):**

6. Migrationen nur Schema (kein DELETE/UPDATE/INSERT auf echte Daten)
7. Migrations-Dateinamen Format `YYYYMMDDHHMMSS_kurzbeschreibung.sql`, Zeitstempel logisch
8. Wo möglich idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS`)
9. PR-Beschreibung nennt Schema-Änderung (was/warum)

**Nach dem Merge (Erinnerung):**

10. Nach Merge: Falls Migrationen im PR – Pre-PROD-Checkliste geplant / durchgeführt (siehe [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md))

*Alternativ als separater Folgetask:* **Name:** `Nach Merge: PROD-Migration anwenden (falls Schema-Änderungen)` mit Verweis auf [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) in der Beschreibung.

---

## Verweise

| Thema | Dokument |
|--------|----------|
| Sicherheit DEV→PROD, Pre-PROD-Checkliste | [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) |
| Schema-Änderungen von DEV nach PROD | [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) |
| Workflow-Kurzüberblick | [WORKFLOW_CHEATSHEET.md](WORKFLOW_CHEATSHEET.md) |
| Asana-Checkliste Feature bis Live (Author) | [ASANA_CHECKLISTE_FEATURE_LIVE.md](ASANA_CHECKLISTE_FEATURE_LIVE.md) |
