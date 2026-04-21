# GitHub: Repository in eine Organisation wechseln – Schritt für Schritt

Detaillierte Anleitung, um dein YogaFlow-Repository von deinem persönlichen GitHub-Account in eine **Organisation** zu übertragen. Danach kannst du deinem Partner die Rolle **Admin** geben (bei persönlichen Repos gibt es diese Rolle nicht).

---

## Übersicht

| Schritt | Inhalt |
|--------|--------|
| 1 | Organisation anlegen |
| 2 | Partner in die Organisation einladen (optional: auch nach dem Transfer möglich) |
| 3 | Repository in die Organisation transferieren |
| 4 | Partner Admin-Rechte am Repo geben |
| 5 | Prüfen: Cloudflare (Git-Deploy), lokaler Git-Remote, Cursor |

**Hinweis:** Die Organisation ist kostenlos, das Repo kann **weiterhin privat** bleiben.

---

## Voraussetzungen

- Du bist **Owner** des Repositories (z.B. auf deinem Account `juliusbne stack`).
- Du hast Zugriff auf die **E-Mail-Adresse** deines GitHub-Accounts (für Bestätigungen).
- Optional: **Cloudflare** ist mit diesem Repo verbunden – nach dem Transfer ggf. einmal Git-Zugriff und Build prüfen (siehe Schritt 5).

---

## Schritt 1: Organisation anlegen

1. **GitHub öffnen** und **eingeloggt** sein (mit dem Account, dem das Repo gehört).

2. **Neue Organisation erstellen**
   - Oben rechts auf dein **Profilbild** klicken.
   - Im Menü **Your organizations** („Deine Organisationen“) auswählen.
   - Rechts auf den grünen Button **Create organization** („Organisation erstellen“) klicken.
   - Oder direkt: [https://github.com/organizations/plan](https://github.com/organizations/plan) öffnen.

3. **Plan wählen**
   - **GitHub Free** auswählen (kostenlos).
   - Auf **Next** / **Weiter** klicken.

4. **Organisations-Daten ausfüllen**
   - **Organization name:** z.B. `YogaFlow` oder `YogaFlow-App` (muss auf GitHub einzigartig sein).
   - **Contact email:** deine Geschäfts- oder Privat-E-Mail (für GitHub-Kommunikation).
   - **This organization belongs to:** z.B. „My personal account“ oder „A business or personal account“, je nach Auswahl.
   - Auf **Next** klicken.

5. **Optional: Teammitglieder einladen**
   - Du kannst hier **andrethaller-ctrl** (oder die E-Mail deines Partners) einladen – oder das in Schritt 2 nachholen.
   - Wenn du jetzt einladen willst: E-Mail oder GitHub-Benutzername eingeben → **Invite**.
   - Sonst: **Skip this step** / „Diesen Schritt überspringen“ wählen.

6. **Fertig**
   - **Complete setup** klicken. Die Organisation ist angelegt.

---

## Schritt 2: Partner in die Organisation einladen (falls noch nicht geschehen)

1. In die **Organisation** wechseln: Oben links auf das GitHub-Logo, dann unter **Organizations** deine neue Org (z.B. **YogaFlow**) auswählen.

2. In der Org: Reiter **People** („Personen“) öffnen.

3. **Invite member** („Mitglied einladen“) klicken.

4. **GitHub-Benutzername** oder **E-Mail** des Partners eingeben (z.B. `andrethaller-ctrl` oder seine E-Mail).

5. **Rolle** für die Organisation wählen:
   - **Member** reicht aus, wenn du ihm pro Repo **Admin** geben willst (empfohlen).
   - **Owner** nur, wenn er in der gesamten Org dieselben Rechte wie du haben soll (z.B. Org löschen, Abrechnung).

6. **Invite** senden. Dein Partner erhält eine E-Mail und muss die Einladung **annehmen** („Accept invitation“).

---

## Schritt 3: Repository in die Organisation transferieren

1. **Repository öffnen** (das YogaFlow-Repo, z.B. `Yogaflow DEV`).

2. **Einstellungen öffnen**
   - Reiter **Settings** („Einstellungen“) anklicken.
   - Falls du **Settings** nicht siehst: Du bist möglicherweise nicht Owner – dann mit dem Account einloggen, der das Repo besitzt.

3. **Transfer-Bereich finden**
   - In der linken Sidebar ganz nach **unten** scrollen.
   - Unter **Danger Zone** („Gefahrenzone“) den Eintrag **Transfer ownership** („Besitz übertragen“) finden.

4. **Transfer ownership** anklicken.

5. **Neuen Besitzer eingeben**
   - Im Feld **New owner** („Neuer Besitzer“) den **Namen der Organisation** eintragen (z.B. `YogaFlow`).
   - GitHub zeigt eine Autovervollständigung – die **Organisation** auswählen (nicht einen Benutzer).

6. **Bestätigung**
   - Den **Repository-Namen** genau so eintragen, wie er angezeigt wird (z.B. `Yogaflow-DEV` oder `YogaApp2-main` – **exakt** wie in der Warnung angegeben).
   - Das bestätigt, dass du den Transfer wirklich willst.

7. **Transfer** („Übertragen“) klicken.

8. **Hinweis lesen**
   - GitHub informiert: Forks, Stars, Watches werden nicht übertragen; Redirects von der alten URL zur neuen werden eingerichtet. Das ist normal.

9. **Fertig**
   - Du wirst auf die **neue Repo-URL** weitergeleitet: z.B. `https://github.com/YogaFlow/Yogaflow-DEV` (statt `https://github.com/juliusbne-stack/Yogaflow-DEV` oder wie vorher).
   - **Alte URLs** leiten automatisch auf die neue Adresse um (Redirect).

---

## Schritt 4: Partner Admin-Rechte am Repository geben

1. **In der Organisation** sein und das **transferierte Repository** öffnen (z.B. `YogaFlow/Yogaflow-DEV`).

2. **Settings** des Repositories öffnen.

3. Links unter **Access** den Eintrag **Collaborators and teams** (oder **Collaborators**) auswählen.

4. **Bereich „Direct access“ / „Manage access“**
   - Dort siehst du dich (als Owner der Org) und ggf. bereits eingeladene Mitglieder.
   - **Add people** („Personen hinzufügen“) klicken.

5. **Partner hinzufügen**
   - GitHub-Benutzername oder E-Mail eingeben (z.B. `andrethaller-ctrl`).
   - **Role** auswählen: **Admin** wählen (dann kann er Einstellungen, Collaborators, Branch-Protection usw. verwalten).
   - **Add … to this repository** bestätigen.

6. **Rolle bei bestehendem Zugriff ändern**
   - Falls dein Partner schon Zugriff hat (z.B. über Org-Mitgliedschaft), erscheint er in der Liste.
   - Neben seinem Namen steht eine **Rolle** (z.B. „Read“ oder „Write“). Auf diese **Rolle klicken** und im Dropdown **Admin** wählen.

Damit hat dein Partner dieselben Rechte am Repo wie du (außer Org-Owner-Funktionen).

---

## Schritt 5: Nach dem Transfer prüfen

### 5.1 Lokaler Git-Remote (Cursor / Rechner)

- Die **Repository-URL** hat sich geändert (z.B. von `github.com/juliusbne-stack/...` zu `github.com/YogaFlow/...`).
- **Redirect:** `git fetch` und `git push` funktionieren oft weiter, weil GitHub alte URLs umleitet. Zur Sicherheit den Remote einmal anpassen:

  ```bash
  git remote -v
  ```

  Wenn dort noch die **alte** URL (persönlicher Account) steht, auf die **neue** Org-URL umstellen:

  ```bash
  git remote set-url origin https://github.com/YogaFlow/Yogaflow-DEV.git
  ```

  (Ersetze `YogaFlow` und `Yogaflow-DEV` durch deine echte Org- und Repo-Namen. Bei SSH: `git@github.com:YogaFlow/Yogaflow-DEV.git`.)

### 5.2 Cloudflare (Live-Deploy)

- Cloudflare Workers/Pages ist mit dem **Repository** verbunden, nicht mit dem persönlichen GitHub-Account als „Besitzer“ des Deployments. Nach dem Transfer kann die Verbindung weiter funktionieren.
- **Prüfen:** Cloudflare-Dashboard → **Workers & Pages** → euer Projekt → **Settings** → **Build** → **Git repository**. Es sollte das neue Org-Repo anzeigen (z.B. `YogaFlow/YogaFlow-DEV`).
- Falls die Verbindung abreißt: Repository in den Build-Einstellungen erneut mit der Organisation verknüpfen; bei GitHub den Zugriff für die **Cloudflare GitHub App** auf die **Organisation** freigeben.

### 5.3 Cursor / IDE

- Keine speziellen Einstellungen nötig. Wenn der Git-Remote stimmt (siehe 5.1), arbeitest du wie gewohnt auf dem gleichen Repo unter der neuen URL.

### 5.4 Branch „Julius“, main, PRs

- Alle Branches (z.B. **Julius**, **main**) und die Branch-Protection-Einstellungen bleiben erhalten. Du kannst sie in **Settings** → **Branches** der Organisation prüfen und ggf. anpassen.

---

## Kurz-Checkliste

- [ ] Organisation erstellt (GitHub Free).
- [ ] Partner in die Organisation eingeladen und Einladung angenommen.
- [ ] Repo unter **Settings** → **Danger Zone** → **Transfer ownership** an die Organisation übertragen.
- [ ] Partner unter **Settings** → **Collaborators and teams** mit Rolle **Admin** hinzugefügt bzw. Rolle auf Admin gesetzt.
- [ ] Lokal: `git remote -v` geprüft, ggf. `origin` auf neue Org-URL gesetzt.
- [ ] Cloudflare: Repo-Zuordnung geprüft, Build einmal testweise ausgelöst.

---

## Wenn etwas schiefgeht

- **Transfer rückgängig:** Nur möglich, wenn der **neue** Owner (die Organisation bzw. ein Org-Owner) das Repo wieder an dich **zurück** transferiert (Settings → Danger Zone → Transfer ownership → dein Benutzername).
- **Org löschen:** Organisation kann nur gelöscht werden, wenn alle Repos vorher transferiert oder gelöscht wurden; nur Org-Owner können die Org löschen.
- **Partner sieht Repo nicht:** Einladung zur Organisation muss angenommen sein; danach unter Repo **Collaborators** explizit mit Rolle **Admin** hinzufügen.

Bei weiteren Fragen: [GitHub Docs – Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).
