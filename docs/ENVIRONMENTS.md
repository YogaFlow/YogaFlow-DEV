# Umgebungen: DEV und PROD

Diese App nutzt zwei getrennte Umgebungen, damit die **Live-Datenbank (PROD)** bei der Entwicklung nie gefährdet wird.

## Was ist DEV, was ist PROD?

| Umgebung | Zweck | Datenbank |
|----------|--------|-----------|
| **Lokal** | Schnelle Entwicklungsschleife auf dem eigenen Rechner, `localhost:5173` und `<slug>.localhost:5173` | DEV-Projekt |
| **DEV** | Deploytes Frontend auf `omlify-dev.de` und `*.omlify-dev.de`; hier nimmt der Geschäftspartner ab | DEV-Projekt („Yogaflow DEV“) |
| **PROD** | Live-Website auf `omlify.de` und `*.omlify.de` für echte Nutzer | PROD-Projekt |

Die App entscheidet **nicht** im Code, ob sie DEV oder PROD nutzt. Es zählen nur die **Environment Variables** (Env-Variablen): `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Welche Werte dort stehen, bestimmt die Datenbank.

## Wo werden welche Env-Variablen gesetzt?

| Ort | Werte eintragen | Regel |
|-----|------------------|--------|
| **Lokal (dein Rechner)** | `.env` mit **DEV**-URL und **DEV**-Anon-Key | Nur DEV. PROD-Keys **nie** in `.env` speichern. |
| **Cloudflare Production** | Im Pages/Worker-Projekt: **Settings** → **Variables** (Build) für **Production** → **PROD**-URL und **PROD**-Anon-Key | Nur PROD. So ist die Live-Seite immer mit der PROD-DB verbunden. |
| **Cloudflare Preview** (optional) | Dieselbe Stelle für **Preview**-Umgebung → **DEV**-Werte | Dann nutzen Branch-/PR-Builds die DEV-Datenbank. |

## Lokale Einrichtung (DEV)

1. Datei `.env.example` im Projektroot als Vorlage kopieren: `cp .env.example .env` (oder manuell eine Datei `.env` anlegen).
2. In der Supabase-Dashboard des **DEV**-Projekts: **Settings → API** → Project URL und anon/public key kopieren.
3. In `.env` eintragen:
   - `VITE_SUPABASE_URL=<DEV-Project-URL>`
   - `VITE_SUPABASE_ANON_KEY=<DEV-Anon-Key>`
4. `.env` **niemals** committen (steht in `.gitignore`).

Beim Start mit `npm run dev` zeigt die Konsole z.B.: „Supabase configured with URL: …“ – dort sollte die **DEV**-URL erscheinen.

## Supabase CLI: Kommandos mit explizitem Ziel

Seit dem DEV-Setup läuft **jede** Supabase-Operation über `scripts/db.mjs`. Das Ziel steht im
Kommando, nicht in unsichtbarem lokalem Zustand:

| Kommando | Wirkung |
|----------|---------|
| `npm run db:status:dev` | zeigt, welche Migrationen auf DEV schon laufen (nur lesen) |
| `npm run db:push:dev` | wendet ausstehende Migrationen auf DEV an |
| `npm run functions:dev` | deployt alle Edge Functions nach DEV |
| `npm run secrets:dev` | spielt `supabase/.env.dev` als Edge-Function-Secrets ein |
| `npm run deploy:dev` | baut und deployt das Frontend auf den DEV-Worker |

Dieselben Kommandos gibt es mit `:prod`. Sie sind zusätzlich abgesichert: Sie brechen ab,
wenn der aktuelle Git-Branch nicht `main` ist, und verlangen die getippte Eingabe `PROD`.
`npm run db:status:prod` ist davon ausgenommen, weil es nur liest.

### Einmalige Einrichtung

1. `.env.deploy.example` als `.env.deploy` kopieren.
2. Projekt-Refs, Pooler-Hosts und Datenbank-Passwörter eintragen (aus dem Passwortmanager).
   Den Pooler-Host findest du im Supabase-Dashboard unter **Connect → Session pooler** —
   es ist der Teil vor `.pooler.supabase.com`.
3. `.env.deploy` steht in `.gitignore` und darf **niemals** committet werden.

`supabase link` und `supabase db push` von Hand werden nicht mehr gebraucht. Wer sie trotzdem
benutzt, umgeht die Absicherung — genau das war vorher das Risiko: `db push` traf immer die
Datenbank, mit der zuletzt verlinkt wurde, und dieser Zustand lag unsichtbar in `supabase/.temp/`.

## Wichtige Regeln

- **Lokal = nur DEV:** In Cursor nur eine `.env` mit DEV-Werten verwenden.
- **Cloudflare Production = nur PROD:** In Cloudflare unter Production-Build-Variablen nur PROD-Supabase-Werte eintragen.
- **Supabase Dashboard:** Beim Entwickeln nur das DEV-Projekt im Browser öffnen; PROD-Dashboard nur bei bewussten Live-Checks.
- Vor Tests von riskanten Aktionen (Löschen, Massen-Updates): kurz prüfen, welche URL die App nutzt (Browser-Konsole oder Log „Supabase configured with URL“).

## Variablen-Übersicht

| Variable | Beschreibung |
|----------|--------------|
| `VITE_SUPABASE_URL` | Supabase-Projekt-URL (z.B. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Öffentlicher Anon-Key (für Browser/Frontend) |

Weitere Supabase-Keys (z.B. Service Role Key) werden nur serverseitig (Supabase Edge Functions, Skripte) genutzt und gehören **nicht** in die Frontend-Env-Variablen.
