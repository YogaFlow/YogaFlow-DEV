# Datenbank-Workflow: DEV → PROD (Schritt für Schritt)

Diese Anleitung erklärt **genau**, wie du im **DEV-Projekt** Datenbank-Änderungen durchführst und sie danach sicher auf die **PROD-Datenbank** überträgst. Jeder Schritt ist mit **„Agent“** oder **„Du“** markiert – so siehst du, was ein Cursor-Agent übernehmen kann und was du manuell erledigst.

Für die konzeptionelle Übersicht (Ablauf, Rollback) siehe [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md).

---

## Abschnitt A: Einmalige Einrichtung (Supabase CLI & Verknüpfung)

Diese Schritte führst du **einmal pro Rechner** (bzw. pro Projekt-Klon) durch.

### Schritt 1: Supabase CLI installieren

- **Was ist die CLI?** Die Supabase Command Line Interface – ein Programm, mit dem du von deinem Rechner aus Befehle an Supabase-Projekte schicken kannst (z.B. Migrationen anwenden), ohne SQL im Dashboard einzufügen.
- **Installation:**  
  - Option A: `npm install -g supabase` (Node.js muss installiert sein).  
  - Option B: Installer von der [Supabase-Dokumentation](https://supabase.com/docs/guides/cli) (z.B. für Windows/macOS).
- **Wer:** Du (einmalig). **Agent:** Kann dir den genauen Befehl nennen (z.B. `npm install -g supabase`).

### Schritt 2: Bei Supabase anmelden

- Im **Projektordner** im Terminal ausführen: `supabase login`
- Es öffnet sich ein Browser; du meldest dich bei Supabase an und erlaubst den Zugriff. Danach ist die CLI mit deinem Supabase-Account verbunden.
- **Wer:** Du. **Agent:** Kann den Befehl vorschlagen.

### Schritt 3: Projekt mit DEV verknüpfen

- Befehl: `supabase link --project-ref <DEV-Projekt-Ref>`
- **Wo finde ich den Projekt-Ref?** Supabase Dashboard → dein **DEV-Projekt** auswählen → **Settings** → **General** → **Reference ID** (kurze Zeichenkette, z.B. `abcdefghijklmnop`).
- Beim ersten Link fragt die CLI nach dem **Datenbank-Passwort** (das Passwort, das bei der Erstellung des Supabase-Projekts vergeben wurde). Falls du es nicht mehr kennst: Supabase Dashboard → **Settings** → **Database** → Passwort zurücksetzen.
- **Wer:** Du (Ref eintragen, Passwort eingeben). **Agent:** Kann den Befehl mit Platzhalter vorschlagen, z.B. „Führe `supabase link --project-ref DEIN_DEV_REF` aus – ersetze DEIN_DEV_REF durch die Reference ID aus dem DEV-Dashboard.“

### Schritt 4 (optional): Für PROD umlinken – dokumentiert für später

- Um Migrationen auf **PROD** anzuwenden, musst du das Projekt **mit PROD verlinken**: `supabase link --project-ref <PROD-Projekt-Ref>` (PROD-Ref aus dem **PROD**-Supabase-Dashboard, **PROD**-Datenbank-Passwort eingeben).
- **Empfehlung:** Nach dem PROD-Push wieder auf **DEV** umlinken: `supabase link --project-ref <DEV-Projekt-Ref>`. So ist im Alltag immer DEV verlinkt und du triffst nie versehentlich PROD.
- **Wer:** Du. **Agent:** Kann die Befehle dokumentieren oder ausführen, wenn du den jeweiligen Ref bereitstellst.

### Wo bin ich gerade verlinkt?

- Die CLI speichert die Verknüpfung lokal (z.B. unter `.supabase/` im Projekt oder in deinem Benutzerverzeichnis). Welches Projekt aktuell verlinkt ist, siehst du z.B. nach einem `supabase db push` in der Ausgabe („Linked to project …“) oder mit `supabase projects list` und Abgleich der Projekt-ID.
- **Vor jedem `supabase db push`:** Kurz prüfen, ob du mit **DEV** (Alltag) bzw. **PROD** (nur bei bewusstem PROD-Release) verlinkt bist.

---

## Abschnitt B: Änderung in der DEV-Datenbank durchführen (Alltag)

Jeder Schritt mit **Agent** / **Du** und wo sinnvoll **Cursor-Prompt** (Beispiel, wie du den Agenten bitten kannst).

1. **Branch:** Auf **Julius** sein und aktuell halten.  
   - Befehl: `git checkout Julius` und `git pull origin Julius`  
   - **Agent** kann ausführen. **Cursor-Prompt:** „Wechsle auf Branch Julius und pull die neuesten Änderungen.“

2. **Neue Migration anlegen:**  
   - Neue Datei unter `supabase/migrations/` mit Namen `YYYYMMDDHHMMSS_kurzbeschreibung.sql` (z.B. `20260306120000_add_notes_to_courses.sql`).  
   - Inhalt: nur SQL (CREATE TABLE, ALTER TABLE, RLS-Policies usw.). Wo möglich **idempotent** (z.B. `IF NOT EXISTS`), damit die Migration mehrfach ausgeführt werden kann.  
   - **Agent** kann die Datei erstellen; **Du** beschreibst, was geändert werden soll (oder der Agent leitet es aus einer Anforderung ab).  
   - **Cursor-Prompt:** „Erstelle eine neue Supabase-Migration, die …“ (dann deine Beschreibung, z.B. „eine Spalte `notes` (text, nullable) zur Tabelle `courses` hinzufügt“).

3. **Migration auf DEV anwenden:**  
   - **Vorher prüfen:** Bin ich mit **DEV** verlinkt? (siehe Abschnitt A.)  
   - Befehl im Projektordner: `supabase db push` (oder `npm run db:push`, falls das Skript angelegt wurde).  
   - **Agent** kann den Befehl ausführen; **Du** musst sicherstellen, dass das Projekt mit **DEV** verlinkt ist.  
   - **Cursor-Prompt:** „Wende ausstehende Migrationen auf die Datenbank an.“ (Nur ausführen, wenn du bestätigt hast, dass DEV verlinkt ist.)

4. **App testen:**  
   - `npm run dev` starten, Browser öffnen, betroffene Features testen. Die App nutzt DEV, weil deine lokale `.env` die DEV-Supabase-URL und den DEV-Anon-Key enthält (siehe [ENVIRONMENTS.md](ENVIRONMENTS.md)).  
   - **Du** testest inhaltlich; **Agent** kann `npm run dev` starten.

5. **Committen & Pushen:**  
   - Migration (und ggf. zugehörigen App-Code) committen, z.B. `git add supabase/migrations/...` und `git commit -m "..."`, dann `git push origin Julius`.  
   - **Agent** kann ausführen. **Cursor-Prompt:** „Committe die neue Migration und pushe auf Julius.“

6. **Pull Request:**  
   - Auf GitHub: Pull Request von **Julius** → **main** erstellen, Beschreibung (welche Schema-Änderung, warum), Review durch den anderen, dann Merge.  
   - **Du** (oder du bittest den Agenten, einen PR-Text vorzuschlagen).

**Nach dem Merge:** Die PROD-Datenbank ist **noch unverändert**. Die Migration liegt im Repo und wurde nur in DEV ausgeführt. Den Übertrag auf PROD machst du bewusst in Abschnitt C.

---

## Abschnitt C: DEV-Änderung auf PROD überführen (bewusst, nach Merge)

- **Wann:** Erst **nach** Merge des PRs in **main**, und am besten zu einem ruhigen Zeitpunkt (wenig Nutzer auf der Live-Seite).
- **Checkliste vor PROD:**  
  - Im Supabase-Dashboard des **PROD**-Projekts prüfen, ob Backups aktiv sind (Settings → Backups).  
  - Lokal: `git checkout main` und `git pull origin main`, damit main aktuell ist.

**Schritt 1:** Mit **PROD** verlinken.  
- Befehl: `supabase link --project-ref <PROD-Projekt-Ref>`  
- **PROD-Projekt-Ref** aus dem **PROD**-Supabase-Dashboard (Settings → General → Reference ID). Beim Link das **PROD**-Datenbank-Passwort eingeben (nicht das von DEV!).  
- **Du** (bewusste Aktion). **Agent:** Kann den Befehl mit Platzhalter vorschlagen.

**Schritt 2:** Migrationen auf PROD anwenden.  
- Befehl: `supabase db push` (oder `npm run db:push`).  
- Die CLI wendet alle **noch nicht auf PROD ausgeführten** Migrationen in Reihenfolge der Dateinamen an.  
- **Agent** kann ausführen, **Du** hast vorher auf PROD umgelinkt. **Cursor-Prompt:** „Führe supabase db push aus.“ (Nur nach deiner Bestätigung, dass PROD verlinkt ist.)

**Schritt 3:** Live-Seite prüfen.  
- Im Browser die Live-Website öffnen (Login, betroffene Features testen). **Du.**

**Schritt 4 (Empfehlung):** Wieder mit **DEV** verlinken.  
- Befehl: `supabase link --project-ref <DEV-Projekt-Ref>`  
- So ist im Alltag wieder **DEV** verlinkt; der nächste `db push` trifft nicht versehentlich PROD. **Du** oder **Agent** (wenn du den DEV-Ref bereitstellst).

### Was passiert bei `supabase db push`?

Die CLI vergleicht die Migrations-Dateien im Ordner `supabase/migrations/` mit der Tabelle `supabase_migrations.schema_migrations` in der **verlinkten** Datenbank. Sie führt nur **noch nicht ausgeführte** Migrationen in Reihenfolge (nach Zeitstempel im Dateinamen) aus. Bereits ausgeführte Migrationen werden nicht erneut ausgeführt.

---

## Abschnitt D: Übersicht „Agent vs. Du“

| Schritt | Was passiert | Agent? | Du? |
|--------|----------------|--------|-----|
| Branch wechseln, pull | Julius aktuell halten | Ja | – |
| Migration-Datei anlegen | SQL in `supabase/migrations/` erstellen | Ja | Beschreibung geben (oder Agent leitet ab) |
| `supabase db push` (DEV) | Migrationen auf verlinkte DB anwenden | Ja | Sicherstellen: mit DEV verlinkt |
| App testen (Browser) | Features mit DEV-Daten prüfen | Kann `npm run dev` starten | Inhaltlich testen |
| Committen & Pushen | Migration (+ Code) auf Julius pushen | Ja | – |
| PR erstellen, Review, Merge | Auf GitHub PR von Julius → main | Kann PR-Text vorschlagen | PR erstellen/mergen |
| Mit PROD verlinken | `supabase link --project-ref <PROD-Ref>` | Kann Befehl vorschlagen | Ref/Passwort, bewusst ausführen |
| `supabase db push` (PROD) | Migrationen auf PROD anwenden | Ja | Vorher: PROD verlinkt bestätigen |
| Live-Seite prüfen | Browser-Check nach PROD-Push | – | Ja |
| Wieder mit DEV verlinken | `supabase link --project-ref <DEV-Ref>` | Ja (wenn DEV-Ref bekannt) | Oder Du |

**Hinweis:** Der Agent kann keine Supabase-Dashboard-Logins durchführen und keine Passwörter eingeben. Er kann alle Befehle im Repo ausführen (Dateien anlegen, Git, `supabase db push`, `npm run dev`), sofern du die Verknüpfung (DEV oder PROD) vorher gesetzt hast.

---

## Abschnitt E: Alternative ohne CLI (nur Dashboard)

Falls du die Supabase CLI nicht nutzen möchtest:

1. **Migration als SQL-Datei im Repo anlegen** (z.B. unter `supabase/migrations/...sql`). **Agent** oder **Du.**
2. **Auf DEV anwenden:** Im **Supabase Dashboard** des **DEV**-Projekts → **SQL Editor** → Inhalt der Migrations-Datei einfügen → Ausführen. **Du.**
3. **App testen** (lokal mit DEV, `.env` = DEV). **Du.**
4. **Migration + Code committen, PR, Merge** (wie in Abschnitt B). **Agent** / **Du.**
5. **Auf PROD anwenden:** Im **Supabase Dashboard** des **PROD**-Projekts → **SQL Editor** → **dieselbe** SQL-Datei (gleicher Inhalt, gleiche Reihenfolge) einfügen und ausführen. **Reihenfolge** beachten: Wenn mehrere neue Migrationen dazugekommen sind, nacheinander in der Reihenfolge der Dateinamen (Zeitstempel) ausführen. **Du.**

**Agent** kann die SQL-Dateien erstellen; das Einfügen und Ausführen im Browser machst **Du**.

---

## Abschnitt F: Häufige Fragen / Troubleshooting

**Wie prüfe ich, ob ich mit DEV oder PROD verlinkt bin?**  
- Nach `supabase link` speichert die CLI die Verknüpfung lokal. Beim nächsten `supabase db push` steht in der Ausgabe typischerweise, mit welchem Projekt die Verbindung besteht. Du kannst auch in der Supabase-Dokumentation nachsehen, wo die Link-Info gespeichert wird (z.B. Projektordner oder Benutzerverzeichnis). Sicherste Methode: Vor einem Push bewusst umlinken (DEV für Alltag, PROD nur für den geplanten PROD-Push).

**`supabase db push` meldet einen Fehler – was tun?**  
- Fehlermeldung lesen (oft: fehlende Reihenfolge, Konflikt in der Migration, z.B. Tabelle/Spalte existiert bereits). Die Migration zuerst in **DEV** anpassen oder korrigieren (z.B. idempotent machen mit `IF NOT EXISTS`), dann erneut `db push` in DEV. Erst wenn es in DEV sauber durchläuft, auf PROD anwenden.

**Ich habe versehentlich mit PROD verlinkt und noch nichts ausgeführt – reicht Umlinken auf DEV?**  
- Ja. Solange du **keinen** `supabase db push` (oder anderen schreibenden Befehl) ausgeführt hast, hat sich an PROD nichts geändert. Einfach wieder `supabase link --project-ref <DEV-Projekt-Ref>` ausführen, dann bist du zurück auf DEV.

**Kann ich `npm run db:push` nutzen?**  
- Wenn im Projekt ein npm-Skript `db:push` angelegt wurde (z.B. `"db:push": "supabase db push"` in `package.json`), kannst du oder der Agent `npm run db:push` ausführen. Voraussetzung: Supabase CLI ist installiert und das Projekt ist mit der gewünschten Umgebung (DEV oder PROD) verlinkt.
