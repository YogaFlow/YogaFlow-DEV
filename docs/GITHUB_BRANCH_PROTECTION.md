# GitHub: Branch Protection für main

Damit nicht versehentlich direkt in `main` gemerged wird, solltest du eine Branch-Protection-Regel für `main` einrichten. Diese Schritte führst du **manuell auf GitHub** aus.

## Schritte auf GitHub

1. Öffne das Repository auf **GitHub**.
2. Gehe zu **Settings** (Repository-Einstellungen).
3. Links in der Sidebar: **Branches** auswählen.
4. Unter **Branch protection rules** auf **Add branch protection rule** (oder bestehende Regel für `main` bearbeiten).
5. **Branch name pattern:** `main` eintragen.
6. Folgende Optionen setzen:
   - **Require a pull request before merging:** aktivieren.
   - **Require approvals:** z.B. 1 (mindestens eine Person muss den PR freigeben).
   - **Do not allow bypassing the above settings:** aktivieren (gilt auch für Admins).
7. Optional: **Require status checks to pass** – falls ihr später CI (z.B. Lint/Tests) einrichtet, könnt ihr hier die Checks eintragen. Anfangs kann das leer bleiben.
8. Rule **Create** bzw. **Save** speichern.

## Ergebnis

- Neue Änderungen kommen nur noch über einen **Pull Request** (z.B. von Branch `Julius` nach `main`) in `main`.
- Der Merge ist erst möglich, wenn die konfigurierte Anzahl **Approvals** (z.B. 1) vorliegt.
- Direktes Pushen auf `main` ist blockiert.

## Test

Einen Test-PR von `Julius` nach `main` erstellen und prüfen: Ohne Approval sollte der Merge-Button nicht aktiv sein (oder Merge blockiert sein).
