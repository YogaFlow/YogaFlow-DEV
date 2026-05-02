# Pre-Start-Check: Entwicklungsumgebung prüfen

Vor dem Arbeiten im YogaFlow-Projekt solltest du prüfen, ob die Entwicklungsumgebung korrekt aufgesetzt ist (Branch Julius, DEV-Datenbank, Supabase mit DEV verlinkt). Dieser Check verhindert versehentliches Arbeiten auf `main` oder gegen die PROD-Datenbank.

---

## So führst du den Check aus

1. Öffne diese Datei und kopiere den **Prompt-Text** aus dem Abschnitt unten.
2. Füge den Text in den Cursor-Chat ein und sende ihn ab.
3. Der Agent führt die Prüfungen durch und meldet das Ergebnis. Bei Abweichungen bekommst du konkrete Fix-Befehle.

---

## Prompt zum Kopieren

```
YogaFlow Pre-Start-Check: Führe die folgenden Prüfungen durch und melde das Ergebnis. Bei jeder Abweichung einen konkreten Fix-Befehl vorschlagen.

1. Git-Branch: Aktueller Branch muss „Julius“ sein (lokal nie main). Prüfe mit git branch --show-current. Bei Abweichung: git checkout Julius und ggf. git pull origin Julius vorschlagen.

2. .env: Datei .env muss im Projektroot existieren und die Variablen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY enthalten. Werte nicht anzeigen oder ausgeben. Lokal sind nur DEV-Keys erlaubt (keine PROD-Keys). Fehlt .env: Hinweis auf docs/ENVIRONMENTS.md und .env aus .env.example anlegen, DEV-Werte aus dem DEV-Dashboard eintragen.

3. Supabase-Verlinkung: Das Projekt muss mit der DEV-Datenbank verlinkt sein. DEV-Project-Ref aus package.json (Script supabase:link): mufxhtctutfpzklwqnze. Prüfe den verlinkten Ref (z. B. npx supabase status oder Supabase-Konfiguration). Stimmt der Ref nicht: npm run supabase:link ausführen (verlinkt explizit DEV).

4. Git-Status: Bei uncommitteten Änderungen eine Warnung ausgeben (kein Fehler). Optional git status ausgeben.

5. node_modules: Prüfen ob vorhanden, damit npm run dev und npm run db:push laufen. Fehlt: npm install vorschlagen.

6. Supabase Auth (Dashboard, kein SQL): Im **DEV-** und **PROD-**Projekt unter Authentication die **Leaked Password Protection** aktivieren, falls noch aus (Security Advisor, HaveIBeenPwned). Siehe [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) Pre-PROD-Checkliste.

Am Ende klar zusammenfassen: Alles OK oder Liste der Abweichungen mit konkreten Fix-Befehlen.
```

---

## Was der Agent prüft (Übersicht)

| Prüfung | Erwartung |
|--------|-----------|
| Git-Branch | `Julius` |
| .env | Vorhanden, mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (nur DEV-Werte) |
| Supabase | Mit DEV verlinkt (Project-Ref `mufxhtctutfpzklwqnze`) |
| Git-Status | Uncommittete Änderungen nur als Warnung |
| node_modules | Vorhanden |
| Auth (optional) | Leaked Password Protection in DEV/PROD aktiviert ([DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md)) |

Die Befehle, die der Agent typischerweise nutzt: `git branch --show-current`, `git status`, Prüfung auf Existenz und Variablen in `.env` (ohne Werte), `npx supabase status` bzw. Projekt-Ref aus der Supabase-Konfiguration, Prüfung auf `node_modules`.

---

## Verweise

- Umgebungen und .env: [ENVIRONMENTS.md](ENVIRONMENTS.md)
- Workflow und Branch-Regeln: [.cursor/rules/yogaflow-workflow.mdc](../.cursor/rules/yogaflow-workflow.mdc)
- DEV vs. PROD Sicherheit: [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md)
