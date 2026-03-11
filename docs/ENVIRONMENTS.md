# Umgebungen: DEV und PROD

Diese App nutzt zwei getrennte Umgebungen, damit die **Live-Datenbank (PROD)** bei der Entwicklung nie gefährdet wird.

## Was ist DEV, was ist PROD?

| Umgebung | Zweck | Datenbank |
|----------|--------|-----------|
| **DEV** | Entwicklung und Tests (lokal, ggf. Netlify Deploy Previews) | Supabase-Projekt im DEV-Account (z.B. „yogaflow-dev“) |
| **PROD** | Live-Website für echte Nutzer | Supabase-Projekt im PROD-Account (bestehendes Live-Projekt) |

Die App entscheidet **nicht** im Code, ob sie DEV oder PROD nutzt. Es zählen nur die **Environment Variables** (Env-Variablen): `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Welche Werte dort stehen, bestimmt die Datenbank.

## Wo werden welche Env-Variablen gesetzt?

| Ort | Werte eintragen | Regel |
|-----|------------------|--------|
| **Lokal (dein Rechner)** | `.env` mit **DEV**-URL und **DEV**-Anon-Key | Nur DEV. PROD-Keys **nie** in `.env` speichern. |
| **Netlify Production** | In Netlify: Site → Environment variables → **Production** → **PROD**-URL und **PROD**-Anon-Key | Nur PROD. So ist die Live-Seite immer mit der PROD-DB verbunden. |
| **Netlify Deploy Preview** (optional) | In Netlify: Environment variables → **Deploy Previews** → **DEV**-Werte | Dann nutzen Vorschau-Builds die DEV-Datenbank. |

## Lokale Einrichtung (DEV)

1. Datei `.env.example` im Projektroot als Vorlage kopieren: `cp .env.example .env` (oder manuell eine Datei `.env` anlegen).
2. In der Supabase-Dashboard des **DEV**-Projekts: **Settings → API** → Project URL und anon/public key kopieren.
3. In `.env` eintragen:
   - `VITE_SUPABASE_URL=<DEV-Project-URL>`
   - `VITE_SUPABASE_ANON_KEY=<DEV-Anon-Key>`
4. `.env` **niemals** committen (steht in `.gitignore`).

Beim Start mit `npm run dev` zeigt die Konsole z.B.: „Supabase configured with URL: …“ – dort sollte die **DEV**-URL erscheinen.

## Supabase CLI: einmalig Login und Verlinkung mit DEV

Damit du Migrationen mit `npm run db:push` auf die DEV-Datenbank anwenden kannst, musst du **einmal** Login und Verlinkung durchführen.

### In Cursor (empfohlen): Command Prompt + Access Token

1. **Terminal in Cursor:** Ein neues Terminal (Ctrl+Shift+ö) nutzt unter Windows automatisch **Command Prompt** (cmd), falls so in den Einstellungen eingestellt. So umgehst du die PowerShell-Execution-Policy.
2. **Access Token erzeugen:** Im Browser bei [supabase.com](https://supabase.com) anmelden, zu [Account → Tokens](https://supabase.com/dashboard/account/tokens) gehen, **„Generate new token“** wählen (keinen Experimental-Token), Namen vergeben, Token erzeugen und **sofort kopieren**.
3. **Im Cursor-Terminal** (im Projektordner), **in derselben Sitzung** nacheinander:
   - Token setzen (nur für diese Sitzung, nicht ins Repo committen):
     - **cmd:** `set SUPABASE_ACCESS_TOKEN=dein_kopierter_token`
     - **PowerShell:** `$env:SUPABASE_ACCESS_TOKEN="dein_kopierter_token"`
   - Verlinken: `npm run supabase:link`  
     Wenn nach dem **Datenbank-Passwort** gefragt wird: Das Passwort von „Yogaflow DEV“ eingeben (bei Projekterstellung vergeben; bei Bedarf unter Dashboard → **Settings** → **Database** zurücksetzen).
   - Migrationen anwenden: `npm run db:push`  
     (Falls „Cannot find project ref“ erscheint: zuerst Schritt 3 mit Token und `npm run supabase:link` in **demselben** Terminal ausführen.)
4. Danach reicht bei Schema-Änderungen: Migration anlegen, dann `npm run db:push` (siehe [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md)).

### Alternative: Browser-Login

1. **Anmelden:** Im Projektordner `npx supabase login` ausführen (in cmd). Es öffnet sich der Browser – bei Supabase anmelden und Zugriff erlauben.
2. **Mit DEV verlinken:** `npm run supabase:link` ausführen. Bei Aufforderung das **Datenbank-Passwort** von „Yogaflow DEV“ eingeben.
3. **Migrationen anwenden:** `npm run db:push` ausführen.

## Wichtige Regeln

- **Lokal = nur DEV:** In Cursor nur eine `.env` mit DEV-Werten verwenden.
- **Netlify Production = nur PROD:** In Netlify unter Production nur PROD-Supabase-Werte eintragen.
- **Supabase Dashboard:** Beim Entwickeln nur das DEV-Projekt im Browser öffnen; PROD-Dashboard nur bei bewussten Live-Checks.
- Vor Tests von riskanten Aktionen (Löschen, Massen-Updates): kurz prüfen, welche URL die App nutzt (Browser-Konsole oder Log „Supabase configured with URL“).

## Variablen-Übersicht

| Variable | Beschreibung |
|----------|--------------|
| `VITE_SUPABASE_URL` | Supabase-Projekt-URL (z.B. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Öffentlicher Anon-Key (für Browser/Frontend) |

Weitere Supabase-Keys (z.B. Service Role Key) werden nur serverseitig (Supabase Edge Functions, Skripte) genutzt und gehören **nicht** in die Frontend-Env-Variablen.
