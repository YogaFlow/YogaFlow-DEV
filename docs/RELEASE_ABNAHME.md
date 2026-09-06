# Abnahme vor einem PROD-Release

Diese Liste wird **auf DEV** durchgeklickt, bevor ein Pull Request nach `main` gemergt wird.
Sie ersetzt kein Nachdenken, aber sie fängt die Fälle, die man beim zehnten Release vergisst.

**Wo:** `https://demoalpha.omlify-dev.de` und `https://demobeta.omlify-dev.de`
**Vorher:** `npm run seed:dev` — stellt in Sekunden denselben Ausgangspunkt her.

## Zugangsdaten der Demo-Studios

Passwort für alle: `DemoPasswort123!`

| Rolle | Demo Alpha | Demo Beta |
|-------|------------|-----------|
| Owner | `demoalpha.owner@example.com` | `demobeta.owner@example.com` |
| Lehrer | `demoalpha.teacher@example.com` | `demobeta.teacher@example.com` |
| Teilnehmer | `demoalpha.teilnehmer1@example.com` … `6` | `demobeta.teilnehmer1@example.com` … `4` |

Jedes Studio hat fünf Kurse: drei in der Zukunft, zwei in der Vergangenheit. Der Kurs
**Vinyasa Flow** hat nur drei Plätze und ist absichtlich überbucht — daran wird die
Warteliste geprüft.

---

## Was immer geprüft wird

Auch wenn die Änderung „damit nichts zu tun hat". Genau diese Fälle brechen still.

### Anmeldung und Zugang

- [ ] Owner kann sich anmelden und landet im Dashboard
- [ ] Falsches Passwort erzeugt eine verständliche Fehlermeldung, keine leere Seite
- [ ] Abmelden funktioniert, danach ist `/dashboard` nicht mehr erreichbar
- [ ] Anmeldung mit den Daten von **Demo Alpha** auf `demobeta.omlify-dev.de` wird abgewiesen
      (Hinweis „falsches Studio") — das ist die Mandantentrennung
- [ ] `https://gibtsnicht.omlify-dev.de` zeigt „Studio nicht gefunden"

### Registrierung und Bestätigung

- [ ] Neuregistrierung auf `demoalpha.omlify-dev.de` mit einer neuen Adresse
- [ ] **Genau eine** Mail kommt an, im DEV-Postfach mit `[DEV → …]` im Betreff
- [ ] Ohne Klick auf den Bestätigungslink: Anmeldung führt **nicht** ins Dashboard,
      sondern zeigt den Bestätigungshinweis
- [ ] Nach dem Klick: Anmeldung funktioniert, Dashboard erscheint

### Passwort vergessen

- [ ] „Passwort vergessen" mit einer bekannten Adresse → Mail kommt an
- [ ] Der Link im Text zeigt auf `demoalpha.omlify-dev.de`, **nicht** auf `omlify.de`
- [ ] Neues Passwort setzen, damit anmelden
- [ ] Mit einer unbekannten Adresse: dieselbe neutrale Meldung, keine Mail
      (verhindert, dass man Konten erraten kann)

### Kurse

- [ ] Owner legt einen Kurs an, er erscheint in der Liste
- [ ] Kurs bearbeiten, Änderung ist nach dem Neuladen noch da
- [ ] Teilnehmer meldet sich zu einem **zukünftigen** Kurs an
- [ ] Teilnehmer meldet sich wieder ab, Platz wird frei
- [ ] Anmeldung zu einem **vergangenen** Kurs ist nicht möglich
- [ ] **Warteliste:** Anmeldung zum vollen *Vinyasa Flow* landet auf der Warteliste
- [ ] Meldet sich ein regulärer Teilnehmer ab, rückt der erste von der Warteliste nach

### Rollen

- [ ] Lehrer sieht die Teilnehmerliste seiner Kurse
- [ ] Teilnehmer sieht **keine** Verwaltungsbereiche
- [ ] Owner kann eine Rolle ändern (Teilnehmer → Lehrer), die Person sieht danach mehr
- [ ] Owner kann die eigene Rolle **nicht** ändern

### Nachrichten

- [ ] Nachricht an einen Teilnehmer senden, kommt beim Empfänger an
- [ ] Ungelesen-Zähler stimmt und geht nach dem Lesen zurück

---

## Zusätzlich bei bestimmten Änderungen

### Wenn Migrationen dabei sind

- [ ] `npm run db:status:dev` — alle Migrationen auf DEV angewendet
- [ ] `npm run db:status:prod` — Liste der **ausstehenden** Migrationen gelesen und verstanden
- [ ] Nach dem Merge: `npm run db:push:prod`, danach die Live-Seite prüfen
- [ ] Es ist klar, ob der neue Code ohne die Migration läuft. Falls nicht: Merge und
      `db:push:prod` unmittelbar nacheinander, sonst ist die Live-Seite dazwischen kaputt

### Wenn Edge Functions geändert wurden

- [ ] `npm run functions:dev`, danach den betroffenen Ablauf in DEV geprüft
- [ ] Nach dem Merge: `npm run functions:prod`
- [ ] **`EMAIL_REDIRECT_TO` ist im PROD-Projekt nicht gesetzt** — sonst landen alle
      Kundenmails im Testpostfach

### Wenn Abhängigkeiten geändert wurden

- [ ] CI ist grün (baut mit den neuen Paketen)
- [ ] DEV-Deploy lief durch und die Seite lädt

---

## Nach dem PROD-Deploy

- [ ] `https://omlify.de` lädt und die Anmeldung funktioniert
- [ ] Ein echtes Studio aufrufen, z. B. `https://yomita.omlify.de`
- [ ] Browser-Konsole: `Supabase configured with URL:` zeigt die **PROD**-Kennung
      (`otnhxzomnjjthocovasu`), nicht die von DEV

Bei Problemen: [ROLLBACK.md](ROLLBACK.md). Ein Release lässt sich mit
`git revert -m 1 <Merge-Commit>` in einem Zug zurückdrehen.

---

## Warum das hier steht

Bis September 2026 gab es keine Zwischenstufe: Änderungen gingen vom Entwicklungsrechner
direkt live, und ob etwas funktionierte, zeigte sich an echten Kunden. Diese Liste ist die
Gegenprobe dazu — und sie ist nur so viel wert, wie sie tatsächlich benutzt wird.

Wenn ein Punkt regelmäßig übersprungen wird, weil er nichts findet: streichen. Eine Liste,
die zur Hälfte ignoriert wird, wird bald ganz ignoriert.
