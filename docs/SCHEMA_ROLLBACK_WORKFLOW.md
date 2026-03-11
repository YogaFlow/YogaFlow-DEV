# Schema-Rollback-Workflow: Schema-Änderungen auf PROD zurücknehmen

Wenn eine bereits auf **PROD** angewendete Migration Probleme verursacht, könnt ihr die Schema-Änderung zurücknehmen. Supabase bietet kein automatisches „Undo“ – ihr habt zwei Wege: **Gegen-Migration** (empfohlen) oder **Backup-Wiederherstellung**. Diese Anleitung beschreibt den Ablauf Schritt für Schritt.

Für **Code-Rollback** (main zurücksetzen, Netlify-Neubau) siehe [ROLLBACK.md](ROLLBACK.md). Für den normalen Ablauf von Schema-Änderungen DEV → PROD siehe [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) und [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md).

---

## Wann ist ein Schema-Rollback nötig?

- Eine Migration wurde auf **PROD** ausgeführt, und danach treten Fehler auf (z.B. kaputte Constraints, falsche RLS-Policies, fehlende Spalten die der alte Code erwartet).
- Ihr wollt eine Schema-Änderung inhaltlich oder technisch rückgängig machen (z.B. Spalte/Tabelle wieder entfernen).

---

## Code-Rollback vs. Schema-Rollback

| Situation | Was tun? |
|-----------|----------|
| **Nur Code problematisch** (z.B. Bug in der App nach Merge) | [ROLLBACK.md](ROLLBACK.md) – main zurücksetzen, Netlify baut neu. Schema muss **nicht** zurück. |
| **Nur Schema problematisch** (Migration auf PROD verursacht DB-Fehler, App-Code ist ok) | Schema-Rollback (dieser Workflow). Code-Rollback nicht nötig. |
| **Code und Schema zusammen problematisch** (neuer Code + neue Migration, beides soll weg) | **Reihenfolge:** Zuerst **Code-Rollback** ([ROLLBACK.md](ROLLBACK.md)), damit die Live-App wieder zum alten Stand passt. Danach **Schema-Rollback** (Gegen-Migration oder Backup), damit die PROD-Datenbank wieder zum zurückgesetzten Code passt. |

---

## Weg A: Gegen-Migration (empfohlen)

Eine **neue** Migrations-Datei macht die unerwünschte Änderung rückgängig. Sie wird wie jede andere Migration zuerst auf **DEV** getestet, dann per PR in main gebracht und bewusst auf **PROD** angewendet. So bleibt die Migration-History im Repo dokumentiert.

### Schritt 1: Betroffene Migration identifizieren

1. Im Ordner `supabase/migrations/` die Migrations-Datei finden, deren Änderung zurückgenommen werden soll (z.B. `20260305140000_add_workshop_table.sql`).
2. Inhalt der Datei durchsehen: Was wurde hinzugefügt oder geändert (Tabellen, Spalten, Indizes, RLS-Policies, Trigger, Funktionen)?

### Schritt 2: Rollback-Migration anlegen

1. Auf Branch **Julius** sein und aktuell halten: `git checkout Julius`, `git pull origin Julius`.
2. Neue Datei unter `supabase/migrations/` anlegen.  
   **Dateiname:** Zeitstempel (YYYYMMDDHHMMSS) **nach** der zu revertierenden Migration + z.B. `rollback_` + Kurzbeschreibung:  
   `20260307120000_rollback_add_workshop_table.sql`
3. In der Datei **nur das Rückgängigmachen** der Änderung beschreiben, z.B.:
   - Tabelle entfernt: `DROP TABLE IF EXISTS workshops;`
   - Spalte entfernt: `ALTER TABLE courses DROP COLUMN IF EXISTS end_time;`
   - Index entfernt: `DROP INDEX IF EXISTS idx_name;`
   - RLS-Policy/Trigger/Funktion: entsprechende `DROP`-Befehle (ggf. in umgekehrter Reihenfolge wie erstellt).
4. **Idempotent** schreiben (`IF EXISTS` bei DROP), damit die Migration mehrfach ausgeführt werden kann, ohne Fehler zu werfen.

**Beispiel (Rückbau einer Tabelle):**
```sql
-- Rollback: remove workshops table (reverts 20260305140000_add_workshop_table.sql)
DROP TABLE IF EXISTS workshops;
```

### Schritt 3: Rollback-Migration auf DEV anwenden und testen

1. **DEV** ist verlinkt (siehe [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md) und [ENVIRONMENTS.md](ENVIRONMENTS.md)).
2. Migration auf DEV anwenden:
   - **Option A – Supabase CLI:** `supabase db push` (im Projektordner, DEV verlinkt).
   - **Option B – Supabase Dashboard (DEV):** SQL Editor → Inhalt der Rollback-Migrations-Datei einfügen → Ausführen.
3. **App testen:** `npm run dev` starten, betroffene Funktionen prüfen. Nur wenn alles funktioniert, weiter zu Schritt 4.

### Schritt 4: Rollback-Migration und ggf. Code ins Repo bringen

1. Rollback-Migrations-Datei (und ggf. zugehörige Code-Anpassungen) committen, auf Julius pushen.
2. **Pull Request** Julius → main erstellen (Beschreibung: welche Migration wird zurückgebaut, warum).
3. Review, dann **Merge in main**. Die PROD-Datenbank ist zu diesem Zeitpunkt noch unverändert.

### Schritt 5: Rollback-Migration auf PROD anwenden

1. **Backup prüfen:** Im PROD-Supabase-Dashboard prüfen, ob Backups aktiv sind (optional: Zeitpunkt notieren).
2. **Mit PROD verlinken:** `supabase link --project-ref <PROD-Projekt-Ref>` (PROD-Ref und Passwort aus dem PROD-Dashboard).
3. **Migration anwenden:** `supabase db push` (oder im PROD-Dashboard unter SQL Editor den **gleichen** Inhalt der Rollback-Migrations-Datei ausführen).
4. **Wieder mit DEV verlinken:** `supabase link --project-ref <DEV-Projekt-Ref>`, damit der nächste Push nicht versehentlich PROD trifft.
5. **Live-Seite prüfen:** Login und betroffene Features im Browser testen.

---

## Weg B: Backup-Wiederherstellung

Falls ihr die Migration nicht per Gegen-Migration zurückbauen wollt (z.B. sehr komplexe Änderung, einmaliger Notfall), kann die **PROD-Datenbank** auf einen Stand **vor** der problematischen Migration zurückgesetzt werden.

- **Vorgehen:** Im Supabase-Dashboard des **PROD**-Projekts (oder über Supabase-Support) ein Backup von **vor** der fehlerhaften Migration auswählen und wiederherstellen. Details siehe [Supabase-Dokumentation](https://supabase.com/docs/guides/platform/backups) zu Backups und Point-in-Time Recovery.
- **Risiko:** Alle **Datenänderungen nach dem Backup-Zeitpunkt** gehen verloren (Neuregistrierungen, Buchungen, Profil-Änderungen etc.). Nur in Abwägung nutzen.
- **Empfehlung:** Vor größeren Schema-Releases den Backup-Zeitpunkt notieren und klären, wer im Notfall die Wiederherstellung durchführt.

---

## Reihenfolge bei Code- und Schema-Rollback zusammen

Wenn sowohl Code als auch Schema zurück sollen:

1. **Zuerst Code-Rollback** ([ROLLBACK.md](ROLLBACK.md)): main auf letzten guten Commit zurücksetzen, Force Push, Netlify baut neu. Die Live-App läuft wieder mit dem alten Code.
2. **Danach Schema-Rollback:** Entweder Gegen-Migration (Weg A) auf PROD anwenden oder Backup-Wiederherstellung (Weg B). So passt die PROD-Datenbank wieder zum zurückgesetzten Code.

---

## Agent vs. Du

| Schritt | Agent? | Du? |
|--------|--------|-----|
| Rollback-Migrations-Datei anlegen | Kann SQL-Datei erstellen (wenn du beschreibst, was zurückgebaut wird) | Beschreibung geben oder prüfen |
| `supabase db push` (DEV/PROD) | Kann Befehl ausführen | Sicherstellen: mit DEV bzw. PROD verlinkt |
| Mit PROD/DEV verlinken | Kann Befehl vorschlagen | Ref/Passwort eingeben, bewusst ausführen |
| SQL im Dashboard ausführen | – | Du |
| Live-Seite / App testen | Kann `npm run dev` starten | Inhaltlich testen |

---

## Kurz-Checkliste (Weg A – Gegen-Migration)

- [ ] Betroffene Migration in `supabase/migrations/` identifiziert.
- [ ] Neue Rollback-Migrations-Datei angelegt (Zeitstempel nach der zu revertierenden Migration, z.B. `rollback_...`).
- [ ] Rollback-Migration **zuerst auf DEV** angewendet und getestet.
- [ ] App mit DEV-DB getestet, alles funktioniert.
- [ ] Rollback-Migration (+ ggf. Code) committet, PR nach main, Review, Merge.
- [ ] PROD-Backup geprüft / notiert (optional).
- [ ] Mit PROD verlinkt, Rollback-Migration auf **PROD** angewendet (CLI oder Dashboard).
- [ ] Wieder mit DEV verlinkt.
- [ ] Live-Seite nach Schema-Rollback geprüft.

---

## Verweise

- [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) – Normaler Ablauf: Migration von DEV nach PROD.
- [ROLLBACK.md](ROLLBACK.md) – Code-Rollback (main zurücksetzen).
- [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md) – Technische Schritte (CLI, Verlinkung, Agent vs. Du).
- [ENVIRONMENTS.md](ENVIRONMENTS.md) – DEV vs. PROD, lokale `.env`, Supabase-Verlinkung.
