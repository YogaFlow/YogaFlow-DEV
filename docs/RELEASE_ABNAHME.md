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
- [ ] Teilnehmer öffnet einen **zukünftigen** Kurs (Zeile antippen) und meldet sich über den Knopf in der Leiste an
- [ ] Teilnehmer öffnet denselben Kurs und meldet sich über „Abmelden" in der Leiste wieder ab, Platz wird frei
- [ ] Anmeldung zu einem **vergangenen** Kurs ist nicht möglich (kein Anmeldeknopf in der Leiste)
- [ ] **Warteliste:** Zeile des vollen *Vinyasa Flow* antippen, „Auf die Warteliste" in der Leiste; Anmeldung landet auf der Warteliste
- [ ] Meldet sich ein regulärer Teilnehmer ab, rückt der erste von der Warteliste nach

### Kursdetailseite

- [ ] Zeile in Kurse / Übersicht / Meine Anmeldungen / Hero-Karte öffnet die Detailseite,
      „Zurück" führt zur Herkunftsseite
- [ ] Kurs-Link direkt aufrufen (neuer Tab): Seite lädt, „Zurück" führt zu den Kursen
- [ ] Handy: Aktionsleiste bleibt unten sichtbar, auch nach „Weiterlesen"; geöffnetes
      Menü liegt darüber
- [ ] Leiste zeigt je Zustand: „pro Termin" + Anmelden · Ausgebucht oben + „Auf die
      Warteliste" · „Angemeldet" + Abmelden · Warteliste-Pill + Abmelden
- [ ] Kursleitung im eigenen Kurs und Admin: „Teilnehmer" und „Bearbeiten" statt Anmelden
- [ ] Kursleitung in einem fremden Kurs kann sich anmelden
- [ ] Abgesagter oder begonnener Kurs: kein Anmeldeknopf
- [ ] Kursliste enthält keine Anmelde-/Abmeldeknöpfe und keine Beschreibung mehr

### Rollen

- [ ] Lehrer sieht die Teilnehmerliste seiner Kurse
- [ ] Teilnehmer sieht **keine** Verwaltungsbereiche
- [ ] Owner kann eine Rolle ändern (Teilnehmer → Lehrer), die Person sieht danach mehr
- [ ] Owner kann die eigene Rolle **nicht** ändern

### Nachrichten

- [ ] Nachricht an einen Teilnehmer senden, kommt beim Empfänger an
- [ ] Ungelesen-Zähler stimmt und geht nach dem Lesen zurück

### Übersicht und Kurslisten

Demo Alpha, Seed-Konten.

- [ ] `teilnehmer1`: Hero-Karte „Deine nächste Stunde", darunter „Danach"
- [ ] `teilnehmer3` (eine Anmeldung): Hero-Karte, darunter direkt „Noch Plätze frei" mit
      buchbaren Kursen, kein leerer Bereich daneben
- [ ] `teilnehmer4` (nur Warteliste): Karte „Noch keine feste Anmeldung", Warteliste als
      Pill unter „Danach"
- [ ] `teacher`: keine Hero-Karte, Schnellzugriff unverändert
- [ ] Kennzahl „Meine Anmeldungen" = Anzahl der Einträge in Hero + Danach
- [ ] Kursliste: Uhrzeit als kompakter Chip, Endzeit als „bis HH:MM"
- [ ] Ein abgesagter Kurs erscheint weder auf der Übersicht noch unter Meine Anmeldungen
      (Seed enthält keinen; einen Kurs absagen und danach prüfen)

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
