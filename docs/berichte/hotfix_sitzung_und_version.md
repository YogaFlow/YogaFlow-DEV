# Bericht — Hotfix Sitzung und Version

Stand: 2026-10-10 · Branch `Julius` · Hotfix `hotfix/sitzung-und-version` · Status: **angehalten (STOPP, Klicktest Schritt 3 erneut)**

---

## Teil 0 (gelesen, dann weiter)

Keine Haltestelle. Es gibt keinen Service Worker. Abmelden, Client und `onAuthStateChange` sind auf `main` und `Julius` dieselben Aufrufe (Zeilen verschoben, kein `scope`). Nur Julius schrieb schon `version.json` (`{ sha, builtAt }`, kurzer Hash) — ohne Hinweis und ohne `no-cache`.

`supabase-js` (im Repo): `signOut(options = { scope: 'global' })`. Ohne `scope` beendet der Server alle Sitzungen des Logins.

### signOut (ohne scope, also global)

| Datei | main | Julius |
|---|---|---|
| `src/context/AuthContext.tsx` | 257 | 257 |
| `src/lib/supabase.ts` | 58 | 58 |
| `src/pages/OnboardingWizard.tsx` | 88, 245, 328 | 92, 252, 335 |
| `src/pages/AuthPage.tsx` | 45, 55, 74 (über `useAuth().signOut`) | 46, 56, 75 |
| `src/components/Layout/Sidebar.tsx` | 165 | 192 |
| `src/components/Auth/RegisterForm.tsx` | 110 | 112 |
| `src/pages/JoinStudio.tsx` | 154 | 154 |

Testskripte (`scripts/test/*.mjs`) rufen `signOut()` nur für Test-Clients. Die bleiben unverändert.

### Client

`createClient` in `src/lib/supabase.ts` setzt keine Auth-Optionen. Bibliotheks-Vorgabe: `autoRefreshToken: true`, `persistSession: true`, Speicher `localStorage`. Der eigene `fetch` hängt nur `x-omlify-tenant` an.

`AuthContext` hört `onAuthStateChange`: `INITIAL_SESSION`, `TOKEN_REFRESHED` (nur User setzen), `SIGNED_OUT` (Zustand leeren). Kein Hinweis, kein Server-Check beim Zurückkehren.

### Functions und Fehler

Nutzer-Functions laufen über `supabase.functions.invoke` (Passwort, update-user, delete-user, Zahlungen). Öffentliche Wege (Onboarding, Passwort-Reset, E-Mail-Bestätigung) nutzen eigenes `fetch` mit Anon-Key, ohne Nutzer-Sitzung. Eine zentrale Fehlerstelle gab es nicht.

Passwort setzen: unbekannter Code, auch `invalid_token` von `initService` (401), landete auf „Das Passwort konnte nicht gesetzt werden.“ Die 401-Antwort der Function ist `{ code: "invalid_token" }`, nicht der Satz „Auth session missing“ — der stand im Function-Log von `auth.getUser()`.

### Version und Cache

Kein Service Worker, keine PWA, kein `_headers`. Der Worker reicht Assets durch; `/assets/*` geht am Worker vorbei (`run_worker_first`). Vor diesem Fix lieferte DEV `version.json` mit `Cache-Control: public, max-age=0, must-revalidate`.

---

## Umsetzung

Abmelden ist überall `signOut({ scope: 'local' })` (`signOutThisDevice`). Kein „Überall abmelden“.

Sitzungswächter: `useSessionGuard` im App-Root. `SIGNED_OUT` ohne eigenes Abmelden startet den Ablauf. Fehlgeschlagenes Refresh ruft in dieser Bibliothek `_removeSession` auf und feuert ebenfalls `SIGNED_OUT` (Netzwerkfehler beim Refresh nicht). Beim Sichtbarwerden, Fokus und `online`: `getUser()`, höchstens alle 60 s, nur wenn lokal eine Sitzung liegt.

Klassifizierer `isSessionError` hängt am gemeinsamen `fetch` des Supabase-Clients (Functions, PostgREST, `/auth/v1/user`). 42501 und 403 mit Rechte-Text lösen nichts aus.

Ablauf einmal: lokal abmelden, `/auth?signed_out=1&next=<relativ>` auf derselben Studio-Adresse. Text: „Du wurdest abgemeldet. Bitte melde dich neu an.“ Nach der Anmeldung zurück auf `next`, fremde Hosts verworfen.

`version.json` ist `{ "build": "<commit-sha>" }`, dieselbe ID als `VITE_BUILD_SHA` im Bundle (Einstellungen › Studio › Build). Prüfung beim Zurückkehren und alle 10 Minuten. Leiste „Neue Version verfügbar“, Knopf „Neu laden“. `version.json` und HTML der App: `Cache-Control: no-cache` (Worker und `public/_headers`). Gehashte Assets: `public, max-age=31536000, immutable`.

Passwort setzen: Erfolg „Passwort geändert“. Sitzungsfehler → Ablauf. Sonst bekannte Codes wie bisher, alles andere „Das hat nicht geklappt. Bitte versuch es noch einmal.“

---

## Dateien

Neu: `src/lib/sessionRules.mjs`, `sessionRules.d.mts`, `sessionHttp.ts`, `sessionGuard.ts`, `useSessionGuard.ts`, `src/components/VersionBanner.tsx`, `scripts/test/session_guard.test.mjs`, `public/_headers`.

Geändert: `src/lib/supabase.ts`, `src/context/AuthContext.tsx`, `src/main.tsx`, `src/App.tsx`, `src/pages/AuthPage.tsx`, `OnboardingWizard.tsx`, `Users.tsx`, `src/worker.ts`, `vite.config.ts`, `.gitignore`, `.github/workflows/ci.yml`. Auf Julius zusätzlich `scripts/check_ci.mjs`.

Commits: Hotfix `bce1ed0` (von `origin/main`), Julius `f3356dc`.

---

## Tests

`node --test scripts/test/session_guard.test.mjs` — 11 grün (jede Fehlerart, 42501 kein Sitzungsfehler, drei gleichzeitige Auslöser nur 1×, `https://fremd…` kein Rücksprung).

`npm run check:ci` auf Julius grün (Typen, Lint, Unit, Deno 205, Build).

Auf `main` gibt es kein `npm run check:ci`. Dieselben Schritte plus der Unit-Test stehen in `.github/workflows/ci.yml` des Hotfix-Branches.

### DEV-Build (Commit `f3356dc`)

- Check-Run **Workers Builds: omlify-dev**: `success` (Run `113941435755`, 2026-10-09T17:26:46Z).
- `https://demoalpha.omlify-dev.de/version.json` → `{"build":"f3356dc1740e34809dab909f9b85a93a7a125a81"}`, Antwort-Header `Cache-Control: no-cache`.
- Bundle `https://demoalpha.omlify-dev.de/assets/index-DFAhM4VS.js` enthält „Du wurdest abgemeldet. Bitte melde dich neu an.“, „Neue Version verfügbar“, „Passwort geändert“ und die Build-ID.
- `index.html` der Studio-Seite: `Cache-Control: no-cache`.

---

## Klicktest (Julius, DEV, Mac + iPhone, gleicher Owner)

Studio-Subdomain, z. B. `https://demoalpha.omlify-dev.de`. Build in Einstellungen › Studio muss `f3356dc1740e34809dab909f9b85a93a7a125a81` sein (oder die ID des späteren Doku-Commits, sobald der Build durch ist).

1. Auf beiden anmelden. Am Mac über den Abmelden-Knopf abmelden. Das iPhone bleibt angemeldet. Passwort setzen auf dem iPhone klappt, Meldung „Passwort geändert“.
2. Am Mac wieder anmelden. DevTools → Network → ein Request an `*.supabase.co` → Header `apikey` (der öffentliche Anon-Key, schon im Bundle). In der Konsole der Studio-Seite — das ist derselbe Request wie `supabase.auth.signOut({ scope: 'global' })`, der Client liegt nicht auf `window`:

```javascript
const storageKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
const { access_token } = JSON.parse(localStorage.getItem(storageKey));
const ref = storageKey.slice(3, -'-auth-token'.length);
const apikey = prompt('apikey aus dem Network-Tab');
const res = await fetch(`https://${ref}.supabase.co/auth/v1/logout?scope=global`, {
  method: 'POST',
  headers: {
    apikey,
    Authorization: 'Bearer ' + access_token,
    'Content-Type': 'application/json',
  },
});
console.log(res.status);
```

`res.status` ist 204. iPhone in den Vordergrund: innerhalb von Sekunden „Du wurdest abgemeldet. Bitte melde dich neu an.“, Anmeldung, danach dieselbe Seite.

3. Wie 2, aber auf dem iPhone direkt **Passwort setzen**: derselbe Hinweis, dann Anmeldung. Keine stille Fehlermeldung.  
   _(Schritt 3 am 10.10. zuerst ❌ — siehe Nachtrag unten. Nach dem Fix erneut.)_
4. Teilnehmer ohne Recht auf eine Owner-Seite: „keine Berechtigung“, kein Abmelden.
5. App offen lassen und Bescheid sagen. Dann kommt ein leerer Commit. Nach dem Build App in den Vordergrund: Leiste „Neue Version verfügbar“, „Neu laden“, neue Build-ID.

---

## Nachtrag Klicktest Schritt 3 (10.10.)

### Befund

- Schritt 2 ✅ (Zurückkehren → `session_not_found` → Hinweis + Login).
- Schritt 3 ❌. DEV-Log UTC: 16:33:17 globaler Logout. 16:33:31 Edge Function vom iPhone → `initService: JWT ungültig` / `AuthSessionMissingError` (401). Kein Hinweis, kein Login; Nutzerverwaltung lud neu (`get_current_member` 16:33:32). Zweiter Versuch 16:34:16: 401 → `logout?scope=local`, danach wieder nur Neuladen.

### Welche Function?

**`set-participant-password`** (Passwort setzen). Dieselbe 401-Form kommt von `initService` auch bei den anderen Function-Aufrufen der Nutzerverwaltung:

| Aufruf | Function |
|---|---|
| Passwort setzen | `set-participant-password` |
| Profil speichern | `update-user` |
| Person entfernen | `delete-user` (`removePerson`) |

Kurs zuweisen läuft über RPC `admin_register_user_for_course` (kein Function-Invoke); Sitzungsende dort weiter über den zentralen `fetch`-Wächter / PostgREST.

### Ursache

1. Die 401 der Function **wurde** erkannt (`invalid_token` / Status 401 → Klassifizierer + `logout?scope=local` beim zweiten Versuch). Beim ersten Versuch wirkt es so, als hätte der async Body-Weg und/oder der Race den Ablauf „verschluckt“.
2. **Race:** `beginForcedSignOut` rief `signOut({ scope: 'local' })` ohne `await` und machte sofort `location.replace('/auth?signed_out=1&next=/users')`. Die Auth-Seite startete **mit noch gültigen Tokens in localStorage**, der Redirect-Effekt sah eine Sitzung und sprang zurück nach `/users`. PostgREST akzeptiert den JWT noch (~1 h), Functions prüfen die Session serverseitig → Seite „lädt neu“, kein Login-Hinweis.

### Fix

- Vor dem Wechsel: Intent in `sessionStorage`, `sb-*` lokal löschen, **`await signOut({ scope: 'local' })`**, erst dann `location.replace`.
- Auth-Seite: Hinweis auch aus `sessionStorage`; während die alte Sitzung noch geräumt wird, kein Sprung zu `next`.
- Nutzerverwaltung: `reactToSessionInvokeError` an `set-participant-password`, `update-user`, `delete-user`.
- Unit-Test: Function 401 „Auth session missing“ → genau 1× Ablauf, Hinweistext, URL `/auth?signed_out=1&next=/users` (Login-Route der App ist `/auth`, nicht `/login`).

Commits: Julius `c57eda7`, Hotfix `79ad145`. 12 Unit-Tests grün.

---

## STOPP

Schritt 3 erneut auf DEV (Mac global abmelden → iPhone Passwort setzen → Hinweis + Login). Build muss `c57eda7` (oder neuer) sein. Nicht mergen, bis 3–5 durch und die PR-CI grün ist. `origin/main` danach in Julius mergen.

Hinweis danach: Wer die App schon offen hatte, lädt einmal von Hand neu (Testkundin). Ab dann kommt der Versionshinweis von selbst.
