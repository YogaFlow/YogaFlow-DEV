# Schema-Release-Workflow: Datenbank-Änderungen von DEV nach PROD

Diese Anleitung beschreibt, wie ihr Schema-Änderungen (neue Tabellen, Spalten, Rechte usw.) zuerst in der DEV-Datenbank testet und danach sicher in der PROD-Datenbank anwendet. So bleibt die Live-Datenbank geschützt.

---

## Übersicht

- **Wo leben Schema-Änderungen?** Als SQL-Dateien im Repo unter `supabase/migrations/` (z.B. `20260106143743_add_course_end_time.sql`).
- **Ablauf:** Neue Migration anlegen → zuerst auf **DEV** anwenden und testen → Code + Migration per PR in **main** → Migration bewusst auf **PROD** anwenden.
- **Wichtig:** Cloudflare deployed nur die App. Die Datenbank-Struktur (Schema) wird **nicht** automatisch mit dem Deploy geändert. Ihr wendet Migrationen manuell (oder per Script) auf DEV und PROD an.
- Für die **technische Schritt-für-Schritt-Umsetzung** (inkl. Supabase CLI und was ein Cursor-Agent übernehmen kann) siehe [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md).

---

## Schritt 1: Neue Migration anlegen (lokal auf Julius)

1. Auf Branch **Julius** wechseln und aktuell halten: `git pull origin Julius`.
2. Neue Migrations-Datei im Ordner `supabase/migrations/` anlegen.  
   **Dateiname:** Zeitstempel (YYYYMMDDHHMMSS) + kurzer Name, z.B.  
   `20260305140000_add_workshop_table.sql`
3. In der Datei nur die **Struktur-Änderung** beschreiben (CREATE TABLE, ALTER TABLE, CREATE INDEX, RLS-Policies usw.).  
   **Tipp:** Wo möglich „idempotent“ schreiben (z.B. `IF NOT EXISTS`), damit die Migration mehrfach ausgeführt werden kann, ohne Fehler zu werfen.

   **Beispiel (nur Struktur, keine echten Daten):**
   ```sql
   -- Add workshops table
   CREATE TABLE IF NOT EXISTS workshops (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     title text NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   ```
4. Datei speichern und **noch nicht** committen (erst nach Schritt 2 prüfen).

---

## Schritt 2: Migration auf DEV anwenden und testen

1. **DEV-Datenbank verwenden:** Lokale `.env` enthält DEV-Supabase-URL und DEV-Key (siehe [ENVIRONMENTS.md](ENVIRONMENTS.md)).
2. Migration auf das **DEV-Supabase-Projekt** anwenden:
   - **Option A – Supabase CLI:** Mit DEV-Projekt verknüpfen und `supabase db push` ausführen (oder Migration manuell ausführen).
   - **Option B – Supabase Dashboard (DEV):** Im DEV-Projekt unter **SQL Editor** den Inhalt der neuen Migrations-Datei einfügen und ausführen.
3. **App testen:** `npm run dev` starten, alle betroffenen Funktionen in der App prüfen (z.B. neue Tabelle nutzen, neue Spalte anzeigen). Nur wenn alles funktioniert, weiter zu Schritt 3.
4. Bei Fehlern: Migration in der Datei anpassen oder rückgängig machen (z.B. im DEV-Dashboard die ausgeführten Befehle manuell zurücksetzen), dann Schritt 2 wiederholen.

---

## Schritt 3: Migration und Code ins Repo bringen

1. Neue Migrations-Datei (und ggf. zugehörigen App-Code) auf **Julius** committen.
2. Nach GitHub pushen: `git push origin Julius`.
3. **Pull Request** von Julius → main erstellen (inkl. Beschreibung: welche Schema-Änderung, warum).
4. Review durch den anderen, dann **Merge in main**.  
   Damit ist die Migration (und der Code) im Hauptbranch und dokumentiert. **Die PROD-Datenbank ist zu diesem Zeitpunkt noch unverändert.**

---

## Schritt 4: Migration auf PROD anwenden (bewusst und geplant)

**Erst nach dem Merge**, und am besten zu einem ruhigen Zeitpunkt:

1. **Backup prüfen:** Im Supabase-Dashboard des **PROD**-Projekts prüfen, ob Backups aktiv sind (Supabase bietet automatische Backups). Bei kritischen Änderungen: vorher manuell exportieren oder Backup-Zeitpunkt notieren.
2. **Gleiche Migration wie auf DEV ausführen:**
   - **Option A – Supabase CLI:** Mit **PROD**-Projekt verknüpfen (andere Projekt-URL/Keys als DEV!) und dieselbe Migration ausführen (z.B. `supabase db push` oder die entsprechende Migration manuell anwenden).
   - **Option B – Supabase Dashboard (PROD):** Im **PROD**-Projekt unter **SQL Editor** den **exakt gleichen** SQL-Inhalt der Migrations-Datei aus dem Repo einfügen und ausführen. **Reihenfolge beachten:** Falls mehrere neue Migrationen seit dem letzten PROD-Update dazugekommen sind, in derselben Reihenfolge wie die Dateinamen (Zeitstempel) ausführen.
3. **Kurz prüfen:** Live-Seite im Browser testen (Login, betroffene Features). Bei Problemen siehe „Schema-Rollback“ unten.

---

## Schritt 5: Reihenfolge bei mehreren Migrationen

- Im Ordner `supabase/migrations/` sind die Dateien nach Zeitstempel sortiert. Diese **Reihenfolge** muss eingehalten werden – zuerst die älteste noch nicht auf PROD angewendete Migration, dann die nächste.
- Wenn ihr mit der CLI arbeitet, führt sie in der Regel nur noch nicht ausgeführte Migrationen aus. Bei manueller Ausführung im PROD-Dashboard: Migration für Migration in der richtigen Reihenfolge ausführen und notieren, welche schon auf PROD gelaufen sind.

---

## Schema-Rollback (wenn etwas auf PROD schiefgeht)

- **Code-Rollback:** Siehe [ROLLBACK.md](ROLLBACK.md) – main zurücksetzen, Cloudflare baut neu.
- **Schema-Rollback:** Detaillierter Ablauf (Gegen-Migration vs. Backup-Wiederherstellung, Schritt für Schritt): [SCHEMA_ROLLBACK_WORKFLOW.md](SCHEMA_ROLLBACK_WORKFLOW.md).

---

## Kurz-Checkliste

- [ ] Neue Migrations-Datei in `supabase/migrations/` angelegt (Zeitstempel + Name).
- [ ] Migration **zuerst auf DEV** angewendet und getestet.
- [ ] App mit DEV-DB getestet, alles funktioniert.
- [ ] Migration (+ Code) auf Julius committet, PR nach main, Review, Merge.
- [ ] PROD-Backup geprüft / notiert.
- [ ] **Gleiche** Migration in der richtigen Reihenfolge auf **PROD** angewendet (CLI oder Dashboard).
- [ ] Live-Seite nach PROD-Migration kurz getestet.
