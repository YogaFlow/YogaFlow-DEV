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
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Publishable Key für Embedded Onboarding (1.3b). Lokal und in den Cloudflare-Build-Variablen für **DEV**: `pk_test_…`. Für **PROD** erst beim Einschalten (`pk_live_…`). Fehlt der Key oder beginnt er auf DEV nicht mit `pk_test_`, bleibt der Abschnitt Online-Zahlung unsichtbar. |

Weitere Supabase-Keys (z.B. Service Role Key) werden nur serverseitig (Supabase Edge Functions, Skripte) genutzt und gehören **nicht** in die Frontend-Env-Variablen.

## Edge-Function-Secrets für Zahlungen (Geldkette 1.2b)

Nur als Supabase-Secret im jeweiligen Projekt, eingespielt aus `supabase/.env.dev` bzw.
`supabase/.env.prod` (`npm run secrets:dev`). Nie in eine `VITE_`-Variable, nie ins Repo.

| Secret | DEV | PROD | Bedeutung |
|--------|-----|------|-----------|
| `PAYMENTS_MODE` | `test` | erst mit dem PROD-Gate | `test` verlangt `sk_test_`/`rk_test_`, `live` verlangt `sk_live_`/`rk_live_`. Fehlt es oder passt der Key nicht, verweigert der Adapter jede Anfrage (`CONFIG_ERROR`). |
| `STRIPE_SECRET_KEY` | Test-Key der Sandbox | — | Secret oder Restricted Key der Plattform. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` des DEV-Endpunkts (Testmodus) | erst beim Einschalten | Signing Secret des Snapshot-Webhook-Endpunkts. Mindestens eines der Webhook-Secrets muss gesetzt sein, sonst `payments-webhook` → 500 `CONFIG_ERROR`. |
| `STRIPE_WEBHOOK_SECRET_2` | optional | optional | Zweites Secret für die Snapshot-Rotation. Die Signatur gilt, wenn eines der gesetzten Secrets passt. Nach dem Wechsel wieder leeren. |
| `STRIPE_WEBHOOK_SECRET_THIN` | optional | optional | Signing Secret des zweiten Stripe-Ziels mit Nutzlast-Stil **Thin/Schlank** (v2-Ereignisse). Wird wie die anderen Secrets geprüft. |
| `PAYMENTS_PROVIDER` | optional | nie | `stripe` (Standard) oder `fake`; `fake` nur mit `PAYMENTS_MODE=test`. |

`VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`): lokal in `.env` und in den Cloudflare-Build-Variablen für DEV setzen (Story 1.3b). Für PROD erst beim Einschalten.

### Webhook-Endpunkt (Geldkette 1.4)

- Ein Endpunkt im Stripe-Dashboard, Testmodus, Typ **„Connected accounts“** (Ereignisse verbundener Konten),
  Nutzlast-Stil **Snapshot**. Ein Plattform-Endpunkt ist vorerst nicht nötig (Nachtrag 5c, W1).
- Zweites Ziel (optional) mit Nutzlast-Stil **Thin/Schlank** für v2-Kontoereignisse; Secret
  `STRIPE_WEBHOOK_SECRET_THIN`. Welcher Geltungsbereich wirklich zustellt, klärt der E2E-Test (V4).
- URL (beide): `https://<DEV_REF>.supabase.co/functions/v1/payments-webhook`
- Snapshot vorerst: `account.updated` und `account.application.deauthorized`. Thin: Typen
  `v2.core.account…` (Nachlesen wie W3). Zahlungsereignisse kommen mit 2.2.
- Signing Secrets in `supabase/.env.dev`, danach `npm run secrets:dev`.
- PROD: Live-Endpunkt und Live-Secret erst beim Einschalten (siehe `docs/RELEASE_GELDKETTE_PLAN.md`).

## Edge-Function-Secrets für E-Mail-Outbox (Geldkette 2.1b-b B2)

| Secret | DEV | PROD | Bedeutung |
|--------|-----|------|-----------|
| `EMAIL_DISPATCH_SECRET` | Zufallswert aus `scripts/dev/email_dispatch_secret.mjs` | eigener Zufallswert (nicht DEV kopieren) | Header `X-Email-Dispatch-Secret` für `dispatch-emails`. Parallel als Vault-Eintrag `email_dispatch_secret` (Cron/`pg_net`). |
| `INTERNAL_EMAIL_SECRET` | wie bisher | wie bisher | Weiterhin für `send-email`; `dispatch-emails` ruft `send-email` damit auf. |
| `APP_BASE_DOMAIN` | `omlify-dev.de` | `omlify.de` | Link `https://{slug}.{APP_BASE_DOMAIN}/my-registrations` in der Nachrück-Mail. |

Vault (nur DB, nicht Edge-Secret):

| Name | Inhalt |
|------|--------|
| `email_dispatch_url` | `https://<REF>.supabase.co/functions/v1/dispatch-emails` |
| `email_dispatch_secret` | derselbe Wert wie `EMAIL_DISPATCH_SECRET` |

DEV-Einrichtung: `node scripts/dev/email_dispatch_secret.mjs` (Ref-Prüfung, schreibt Vault + `supabase/.env.dev`, gibt das Secret nie aus) → `npm run secrets:dev` → Function deployen. Fehlt ein Vault-Eintrag, tut der Cron-Job nichts.