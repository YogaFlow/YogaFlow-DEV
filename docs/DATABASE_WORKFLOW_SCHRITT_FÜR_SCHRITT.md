# Datenbank-Workflow: DEV → PROD (Schritt für Schritt)

Diese Anleitung erklärt **genau**, wie du im **DEV-Projekt** Datenbank-Änderungen durchführst und sie danach sicher auf die **PROD-Datenbank** überträgst. Jeder Schritt ist mit **„Agent“** oder **„Du“** markiert – so siehst du, was ein Agent übernehmen kann und was du selbst erledigst.

Für die konzeptionelle Übersicht (Ablauf, Rollback) siehe [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md).

> **Wichtige Änderung seit September 2026:** Früher stand hier, man solle das Projekt mit `supabase link` mal auf DEV und mal auf PROD umstellen. **Dieser Weg ist abgeschafft.** Er hing an unsichtbarem lokalem Zustand in `supabase/.temp/` – ein vergessenes Umlinken reichte, um eine Migration auf der falschen Datenbank zu fahren. Heute steht das Ziel im Kommando.

---

## Abschnitt A: Einmalige Einrichtung

Diese Schritte führst du **einmal pro Rechner** durch.

### Schritt 1: Supabase CLI installieren

- **Was ist die CLI?** Ein Programm, mit dem du von deinem Rechner aus Befehle an Supabase-Projekte schickst – etwa Migrationen anwenden, ohne SQL im Dashboard einzufügen.
- **Installation:** `npm install -g supabase`, oder der Installer aus der [Supabase-Dokumentation](https://supabase.com/docs/guides/cli).
- **Wer:** Du (einmalig).

### Schritt 2: `.env.deploy` anlegen

Hier stehen die Ziele für alle Datenbank-Kommandos.

1. `.env.deploy.example` als `.env.deploy` kopieren.
2. Ausfüllen – die Werte stehen im Passwortmanager:

```
DEV_REF=            Supabase → DEV → Settings → General → Reference ID
DEV_DB_HOST=        Supabase → DEV → Connect → Session pooler
DEV_DB_PASSWORD=    Datenbank-Passwort DEV

PROD_REF=           dasselbe im PROD-Projekt
PROD_DB_HOST=
PROD_DB_PASSWORD=
```

Den **Pooler-Host** liest du aus der Verbindungszeichenfolge: Es ist der Teil vor `.pooler.supabase.com`, zum Beispiel `aws-1-eu-central-1`.

3. `.env.deploy` steht in `.gitignore` und darf **niemals** committet werden. Die CI bricht ab, falls es doch passiert.

- **Wer:** Du. **Agent:** kann die Datei anlegen, aber keine Passwörter beschaffen.

### Es gibt kein „Verlinken“ mehr

`supabase login` und `supabase link` brauchst du für Migrationen **nicht**. Jedes Kommando trägt sein Ziel im Namen.

---

## Abschnitt B: Änderung in der DEV-Datenbank (Alltag)

1. **Branch:** Auf **Julius** sein und aktuell halten.
   `git checkout Julius` und `git pull origin Julius` — **Agent** kann ausführen.

2. **Neue Migration anlegen:**
   - Datei unter `supabase/migrations/` mit Namen `YYYYMMDDHHMMSS_kurzbeschreibung.sql`.
   - Inhalt: nur SQL (CREATE TABLE, ALTER TABLE, RLS-Policies). Wo möglich **idempotent** (`IF NOT EXISTS`).
   - **Keine** DELETE/UPDATE/INSERT auf echte Nutzerdaten – Migrationen ändern Struktur, nicht Inhalte.
   - **Agent** erstellt die Datei; **Du** beschreibst, was geändert werden soll.

3. **Vorher lesen, was passieren wird:**
   `npm run db:status:dev` — zeigt, welche Migrationen schon auf DEV laufen. Ändert nichts.

4. **Migration anwenden:**
   `npm run db:push:dev` — **Agent** kann ausführen, ohne Rückfrage. Das Ziel steht im Kommando, ein Griff daneben ist nicht möglich.

5. **App testen:**
   `npm run dev`, dann `http://<slug>.localhost:5173`. Oder auf `https://<slug>.omlify-dev.de` nach einem Push auf `Julius`.
   Testdaten zurücksetzen: `npm run seed:dev` (siehe [RELEASE_ABNAHME.md](RELEASE_ABNAHME.md)).

6. **Committen und pushen:** auf `Julius`. Löst automatisch den DEV-Deploy aus.

7. **Pull Request** von `Julius` nach `main`. Die CI prüft Typen, Lint und Build; vorher lässt sich nicht mergen.

**Nach dem Merge ist die PROD-Datenbank noch unverändert.** Die Migration liegt im Repo und lief nur auf DEV. Der Übertrag ist Abschnitt C.

---

## Abschnitt C: Auf PROD überführen (bewusst, nach dem Merge)

**Wann:** erst **nach** dem Merge in `main`, und zu einem ruhigen Zeitpunkt.

### Vorbereitung

- [ ] `git checkout main` und `git pull origin main`
- [ ] Abnahme auf DEV durchgeklickt ([RELEASE_ABNAHME.md](RELEASE_ABNAHME.md))
- [ ] Letzte Sicherung vorhanden: Cloudflare → R2 → `omlify-backups` → `prod/` ([BACKUP_RESTORE.md](BACKUP_RESTORE.md))

### Schritt 1: Lesen, was ansteht

`npm run db:status:prod`

Zeigt die noch nicht angewendeten Migrationen. **Ändert nichts** und verlangt deshalb keine Bestätigung. Lies die Liste und vergleiche sie mit dem, was du erwartest.

### Schritt 2: Anwenden

`npm run db:push:prod`

Das Skript bricht ab, wenn der aktuelle Branch nicht `main` ist, und verlangt danach die getippte Eingabe **`PROD`**. Erst dann läuft es.

- **Agent** kann das Kommando starten, aber die Bestätigung tippst **du**.

### Schritt 3: Live-Seite prüfen

`https://omlify.de` öffnen, anmelden, betroffene Features testen. Zusätzlich ein echtes Studio, etwa `https://yomita.omlify.de`.

**Ein Zurücklinken gibt es nicht mehr.** Die Kommandos tragen ihr Ziel im Namen; der nächste `db:push:dev` trifft DEV, egal was vorher lief.

### Was passiert bei einem Push?

Die CLI vergleicht die Dateien in `supabase/migrations/` mit der Tabelle `supabase_migrations.schema_migrations` der Zieldatenbank und führt nur die **noch nicht ausgeführten** aus, in Reihenfolge der Zeitstempel im Dateinamen. Bereits gelaufene Migrationen werden nicht wiederholt.

---

## Abschnitt D: Übersicht „Agent vs. Du“

| Schritt | Kommando | Agent? | Du? |
|---------|----------|--------|-----|
| Branch wechseln, pull | `git checkout Julius`, `git pull` | Ja | – |
| Migration anlegen | Datei in `supabase/migrations/` | Ja | Beschreibung geben |
| DEV-Stand lesen | `npm run db:status:dev` | Ja | – |
| Auf DEV anwenden | `npm run db:push:dev` | Ja | – |
| Testdaten zurücksetzen | `npm run seed:dev` | Ja | – |
| App testen | Browser | – | Ja |
| Committen, pushen | `git push origin Julius` | Ja | – |
| Pull Request, Merge | GitHub | Kann Text vorschlagen | PR anlegen und mergen |
| PROD-Stand lesen | `npm run db:status:prod` | Ja | – |
| **Auf PROD anwenden** | `npm run db:push:prod` | Kann starten | **Bestätigung tippen** |
| Live-Seite prüfen | Browser | – | Ja |

**Hinweis:** Der Agent kann keine Dashboard-Logins durchführen und keine Passwörter beschaffen. Alle Kommandos im Repo kann er ausführen – die einzige Stelle, an der er nicht allein weiterkommt, ist die getippte PROD-Bestätigung. Das ist Absicht.

### Edge Functions und Secrets

Dieselbe Systematik:

| | DEV | PROD |
|---|---|---|
| Funktionen deployen | `npm run functions:dev` | `npm run functions:prod` |
| Secrets einspielen | `npm run secrets:dev` | `npm run secrets:prod` |

Die `:prod`-Varianten verlangen dieselbe Bestätigung. Werte stehen in `supabase/.env.dev` bzw. `supabase/.env.prod` (beide nicht im Repo, Vorlage: `supabase/.env.example`).

> **Vor jedem `secrets:prod` prüfen:** `EMAIL_REDIRECT_TO` darf in `supabase/.env.prod` **nicht** stehen. Sonst landen alle Kundenmails im Testpostfach.

---

## Abschnitt E: Alternative ohne CLI (nur Dashboard)

Falls die CLI einmal nicht läuft:

1. **Migration als SQL-Datei im Repo anlegen.** **Agent** oder **Du.**
2. **Auf DEV anwenden:** Supabase Dashboard → **DEV-Projekt** → SQL Editor → Inhalt einfügen → ausführen. **Du.**
3. **App testen.** **Du.**
4. **Committen, PR, Merge** wie in Abschnitt B.
5. **Auf PROD anwenden:** Dashboard → **PROD-Projekt** → SQL Editor → **dieselbe** Datei. Bei mehreren Migrationen die Reihenfolge der Zeitstempel einhalten. **Du.**

**Achtung:** Bei diesem Weg trägt die CLI die Migration **nicht** in `supabase_migrations.schema_migrations` ein. Ein späterer `db:push:prod` würde sie erneut ausführen. Deshalb Migrationen möglichst idempotent schreiben (`IF NOT EXISTS`) – oder den Eintrag von Hand nachtragen.

---

## Abschnitt F: Häufige Fragen

**Wie weiß ich, welche Datenbank ich treffe?**
Es steht im Kommando: `:dev` oder `:prod`. Es gibt keinen versteckten Zustand mehr, der das beeinflusst.

**Ein Push meldet einen Fehler – was tun?**
Fehlermeldung lesen (häufig: Tabelle oder Spalte existiert bereits). Die Migration in **DEV** korrigieren, idempotent machen, erneut `db:push:dev`. Erst wenn es dort sauber durchläuft, auf PROD.

**Ich habe `db:push:prod` versehentlich gestartet.**
Solange du die Bestätigung nicht getippt hast, ist nichts passiert. Das Skript bricht ohne Eingabe ab. Und wenn du nicht auf `main` bist, kommt es gar nicht erst zur Abfrage.

**Ein Agent hat gegen die falsche Datenbank gearbeitet – wie kann das sein?**
Kann es nicht, solange die npm-Skripte benutzt werden. Möglich wäre es nur, wenn jemand `supabase db push` von Hand mit eigener Verbindungszeichenfolge ausführt. Genau deshalb wurden die alten, mehrdeutigen Skripte entfernt.

**Wo sehe ich, was auf PROD schon gelaufen ist?**
`npm run db:status:prod`, oder im PROD-Dashboard im SQL Editor:
`SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;`
