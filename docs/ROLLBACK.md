# Rollback-Anleitung: Zurück zur letzten funktionierenden Version

Wenn nach einem Deployment (Merge in `main` → Cloudflare baut) etwas schiefgeht, könnt ihr die Live-Seite auf den letzten bekannten guten Stand zurücksetzen. Beide (Julius und Geschäftspartner) können sich an diese Schritte halten.

## Voraussetzungen

- Git ist auf dem Rechner installiert.
- Du hast Schreibrechte auf das GitHub-Repository (push auf `main` ist für Rollback nötig).

---

## Schritt 1: Ruhe bewahren

- Die Live-Seite kann bei Bedarf mit einem Wartungshinweis versehen werden (z.B. über Cloudflare oder einen schnellen Fix).
- Keine weiteren Änderungen auf `main` vornehmen, bis der Rollback durch ist.

---

## Schritt 2: Letzten guten Commit finden

1. Öffne das Repository auf **GitHub**.
2. Gehe zur **main**-Branch (Branch-Dropdown oben links: „main“ auswählen).
3. Klicke auf **„X commits“** oder öffne die Commit-Liste (z.B. durch Klick auf den letzten Commit).
4. Scrolle durch die Liste und finde den **letzten Commit vor dem problematischen Merge** (z.B. anhand Datum oder Commit-Message). Das ist der „gute“ Stand.
5. Klicke auf diesen Commit, um die Commit-Detailseite zu öffnen.
6. **Commit-Hash kopieren:** Der Hash ist die lange Zeichenkette (z.B. `a1b2c3d4e5f6...`). Rechts neben dem Hash gibt es ein Kopier-Symbol – klicken, um den vollen Hash zu kopieren. Du brauchst ihn in Schritt 3.

**Beispiel:** Wenn der fehlerhafte Merge-Commit „Merge pull request #12“ heißt, nimmst du den Commit **darunter** (der davor) als „letzten guten“ Commit.

---

## Schritt 3: Rollback durch Zurücksetzen von main (Force Push)

Führe diese Befehle **lokal in einem Terminal** aus (z.B. PowerShell oder Git Bash im Projektordner).

1. **Aktuellen Stand holen und auf main wechseln:**
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   ```

2. **main auf den letzten guten Stand zurücksetzen** (ersetze `<COMMIT-HASH>` durch den kopierten Hash aus Schritt 2):
   ```bash
   git reset --hard <COMMIT-HASH>
   ```
   Beispiel: `git reset --hard a1b2c3d4e5f6789`

3. **Zurückgesetzten Stand nach GitHub pushen (Force Push):**
   ```bash
   git push origin main --force
   ```
   **Hinweis:** Force Push auf `main` nur für Rollbacks verwenden. Damit überschreibst du die History auf `main` – alle Commits nach dem gewählten Hash sind auf `main` „weg“ (bleiben aber in anderen Branches wie `Julius` erhalten).

---

## Schritt 4: Cloudflare baut automatisch neu

- Cloudflare erkennt den neuen Push auf `main` und startet einen neuen Build (Git-Integration).
- Nach etwa 1–2 Minuten sollte die **alte, funktionierende Version** wieder live sein.
- Prüfe die Live-Website im Browser.

---

## Schritt 5: Nach dem Rollback

- Den Fehler in Ruhe auf der **Julius**-Branch analysieren (lokal mit **DEV**-Datenbank testen).
- Fix entwickeln, testen, dann neuen **Pull Request** von Julius → main erstellen.
- Nach **Review** und Merge wird die korrigierte Version wieder deployed.

---

## Kurz-Checkliste

- [ ] Letzten guten Commit auf GitHub (main) identifiziert und Hash kopiert
- [ ] Lokal: `git fetch origin`, `git checkout main`, `git pull origin main`
- [ ] Lokal: `git reset --hard <COMMIT-HASH>`
- [ ] Lokal: `git push origin main --force`
- [ ] Cloudflare-Build abwarten und Live-Seite prüfen
- [ ] Fehler auf Julius-Branch mit DEV-DB nachvollziehen und Fix vorbereiten

Falls gleichzeitig eine Schema-Änderung auf PROD zurückgenommen werden muss, siehe [SCHEMA_ROLLBACK_WORKFLOW.md](SCHEMA_ROLLBACK_WORKFLOW.md).
