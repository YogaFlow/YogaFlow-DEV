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
