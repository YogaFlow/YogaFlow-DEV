# Asana-Checkliste: Neues Feature bis Live (Teil B)

Diese Checkliste entspricht dem **Teil B: Wiederkehrender Ablauf – Neues Feature bis Live** aus [VOLLSTÄNDIGER_WORKFLOW.md](VOLLSTÄNDIGER_WORKFLOW.md). Du kannst sie als Vorlage für dein Asana-Board nutzen: Pro Feature eine Aufgabe anlegen und die Punkte als Subtasks oder Checklisten-Items abhaken, damit kein wichtiger Schritt vergessen wird.

---

## Verwendung in Asana

- **Option A:** Eine Aufgabe „Feature: [Name]“ anlegen und alle Punkte als **Subtask-Liste** (Checkliste in der Aufgabe) einfügen.
- **Option B:** Die Abschnitte (B1–B6) als eigene Aufgaben anlegen und die jeweiligen Punkte als Subtasks darunter.
- **Option C:** Die gesamte Liste als **Checklist** in die Aufgabenbeschreibung kopieren; Asana erkennt `- [ ]` oft als Checkboxen.

**Hinweis:** Punkte mit „(nur wenn Migration)“ bzw. „(nur wenn Schema-Änderung)“ nur abhaken, wenn das Feature eine Datenbank-Änderung enthält.

---

## B1 – Ausgangslage

- [ ] Auf Branch **Julius** gewechselt: `git checkout Julius`
- [ ] Neuesten Stand geholt: `git pull origin Julius`
- [ ] Bestätigt: Ich arbeite nicht direkt auf **main**

---

## B2 – Feature in Cursor entwickeln

- [ ] Idee/Anforderung formuliert (was soll das Feature können?)
- [ ] Mit Cursor-Agent gearbeitet (Code/Änderungen vorgeschlagen, ich habe geprüft)
- [ ] Alle geänderten Dateien gespeichert
- [ ] Lokal getestet: `npm run dev` gestartet, App nutzt **DEV**-Datenbank
- [ ] Betroffene Funktionen im Browser durchgeklickt – alles funktioniert
- [ ] Entscheidung getroffen: Braucht das Feature eine **Schema-Änderung** (neue Tabelle/Spalte/RLS)?  
  - Wenn **ja** → B3 durcharbeiten.  
  - Wenn **nein** → direkt zu B4.

---

## B3 – Schema-Änderung / Migration (nur wenn nötig)

*Dieser Block nur abhaken, wenn das Feature Datenbank-Struktur-Änderungen braucht.*

- [ ] Neue Migrations-Datei in `supabase/migrations/` angelegt
- [ ] Dateiname im Format `YYYYMMDDHHMMSS_kurzbeschreibung.sql` (z. B. `20260305140000_add_workshop_table.sql`)
- [ ] Inhalt: nur Struktur (CREATE TABLE, ALTER TABLE, RLS usw.), keine Nutzerdaten ändern, wo möglich idempotent (`IF NOT EXISTS` etc.)
- [ ] Prüfung: Projekt ist mit **DEV** verlinkt (nicht PROD)
- [ ] Migration auf DEV angewendet: `npm run db:push` (oder `supabase db push`) ausgeführt
- [ ] App nach Migration erneut getestet: `npm run dev`, betroffene Funktionen im Browser geprüft – alles ok

---

## B4 – Änderungen ins Repo bringen

- [ ] Alle geänderten Dateien (Code + ggf. Migrations-Datei) zum Commit hinzugefügt (`git add …`)
- [ ] Commit mit aussagekräftiger Message erstellt (z. B. `git commit -m "Feature X: Kurzbeschreibung"`)
- [ ] Auf **Julius** gepusht: `git push origin Julius`
- [ ] Auf GitHub: **Pull Request** erstellt (von Julius → main)
- [ ] PR-Titel und Beschreibung ausgefüllt (was geändert, warum, ob Migration dabei)
- [ ] Review eingeholt (mind. 1 Approval)
- [ ] PR in **main** gemerged

---

## B5 – Nach dem Merge: Netlify und Code live

- [ ] Netlify-Build abgewartet (ca. 1–2 Min. nach Merge)
- [ ] **Falls keine Migration im Feature:** Live-Seite im Browser geprüft (Login, betroffene Features) – **damit ist der Ablauf fertig.**
- [ ] **Falls Migration mit im PR war:** Weiter zu B6 (Migration auf PROD anwenden).

---

## B6 – Migration auf PROD anwenden (nur wenn Migration mitgemerged)

*Nur ausführen, wenn mit dem letzten Merge eine oder mehrere Migrationen in main gelandet sind. Immer zu einem ruhigen Zeitpunkt.*

### Pre-PROD-Checkliste (vor dem ersten B6-Punkt abhaken)

- [ ] PR ist gemerged; lokal auf **main**: `git checkout main` und `git pull origin main`
- [ ] Im **PROD**-Supabase-Dashboard: **Settings → Backups** geprüft (Backups aktiv? Bei kritischen Änderungen Zeitpunkt notiert)
- [ ] Mit **PROD** verlinkt: `supabase link --project-ref <PROD-Projekt-Ref>` ausgeführt (PROD-Ref aus PROD-Dashboard, **PROD**-Datenbank-Passwort eingegeben)
- [ ] **Erst danach:** `supabase db push` ausgeführt (Agent nur nach deiner Bestätigung „PROD ist verlinkt“)
- [ ] Live-Seite im Browser geprüft (Login, betroffene Features)
- [ ] Wieder mit **DEV** verlinkt: `supabase link --project-ref <DEV-Projekt-Ref>` oder `npm run supabase:link` – damit der nächste `db push` nicht versehentlich PROD trifft

Vollständige Beschreibung und Sicherheitsprinzipien: [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md).

---

## Abschluss

- [ ] Alles live und getestet; kein wichtiger Schritt ausgelassen.
- [ ] Bei Schema-Release: Sichergestellt, dass wieder **DEV** verlinkt ist (für den nächsten Arbeitstag).

---

## Kurzreferenz

| Schritt | Kurz |
|--------|------|
| B1 | Julius aktuell: `git checkout Julius`, `git pull origin Julius` |
| B2 | Feature entwickeln, lokal mit DEV testen |
| B3 | (Nur bei Schema-Änderung) Migration anlegen, auf DEV anwenden, testen |
| B4 | Committen, pushen, PR erstellen, Review, Merge in main |
| B5 | Netlify-Build abwarten, Live-Seite prüfen; bei Migration → B6 |
| B6 | (Nur bei Migration) Pre-PROD-Checkliste, mit PROD verlinken, `db push`, Live prüfen, wieder DEV verlinken |

Vollständige Beschreibung: [VOLLSTÄNDIGER_WORKFLOW.md](VOLLSTÄNDIGER_WORKFLOW.md).
