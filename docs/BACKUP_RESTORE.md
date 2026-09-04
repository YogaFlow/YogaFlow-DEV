# Backup und Wiederherstellung der PROD-Datenbank

Das PROD-Projekt läuft auf dem Supabase-**Free-Plan**. Dort gibt es **keine automatischen
Backups** und **kein Point-in-Time-Recovery**. Ohne die hier beschriebene Sicherung wäre
ein Datenverlust endgültig.

## Was gesichert wird

Täglich um 03:00 UTC läuft [`.github/workflows/backup-prod.yml`](../.github/workflows/backup-prod.yml)
und legt eine verschlüsselte Sicherung in Cloudflare R2 ab.

| Enthalten | Nicht enthalten |
|-----------|-----------------|
| Datenbank-Rollen | Projekteinstellungen (Auth-Konfiguration, Redirect-URLs) |
| Schema inkl. Tabellen, RLS-Policies, Funktionen, Trigger | Edge-Function-Secrets |
| Alle Daten inkl. `auth.users` | Edge-Function-Code (liegt in Git) |
| | Dateien in Supabase Storage (wird nicht genutzt) |

Die nicht enthaltenen Punkte sind der Grund, warum es unten eine Nachbereitungs-Checkliste gibt.

## Grenzen — ehrlich benannt

- **Bis zu 24 Stunden Datenverlust.** Die Sicherung läuft einmal täglich. Was zwischen zwei
  Läufen passiert, ist im Ernstfall weg. (Der Supabase-Pro-Plan sichert ebenfalls nur täglich;
  lückenlose Wiederherstellung gäbe es dort erst mit dem PITR-Zusatz.)
- **Ohne Passwort kein Backup.** `BACKUP_PASSPHRASE` entschlüsselt die Sicherungen. Geht es
  verloren, sind alle Sicherungen wertlos. Es gehört in den Passwortmanager **und** muss beiden
  Gesellschaftern vorliegen.
- **Ein ungeprüftes Backup ist kein Backup.** Siehe Rückspielprobe unten.

## Wiederherstellung im Ernstfall

### 1. Sicherung holen

Cloudflare → **R2** → Bucket → Ordner `prod/` → die gewünschte Datei herunterladen.
Der Dateiname trägt den Zeitstempel in UTC.

### 2. Entschlüsseln und auspacken

```bash
gpg --decrypt --output backup.tar.gz omlify-prod-<zeitstempel>.tar.gz.gpg
mkdir wiederherstellung && tar -xzf backup.tar.gz -C wiederherstellung
ls wiederherstellung    # roles.sql  schema.sql  data.sql
```

### 3. Zielprojekt vorbereiten

Ein **neues, leeres** Supabase-Projekt anlegen. Nicht in ein bestehendes einspielen — bei
einem Teilausfall würde das den Schaden vergrößern. Danach unter **Connect → Session pooler**
die Verbindungszeichenfolge kopieren.

### 4. Einspielen — Reihenfolge ist zwingend

```bash
psql "<verbindungszeichenfolge>" -f wiederherstellung/roles.sql
psql "<verbindungszeichenfolge>" -f wiederherstellung/schema.sql
psql "<verbindungszeichenfolge>" -f wiederherstellung/data.sql
```

Rollen zuerst, weil das Schema sie referenziert. Daten zuletzt, weil sie die Tabellen brauchen.

### 5. Nachbereitung — was nicht im Dump steckt

- [ ] **Auth → URL Configuration:** Site URL und Redirect-URLs neu setzen (siehe [ENVIRONMENTS.md](ENVIRONMENTS.md))
- [ ] **Auth → Sign In / Providers:** „Confirm email" ausschalten (die App bestätigt selbst, siehe `AuthContext.tsx`)
- [ ] **Edge Functions deployen:** `npm run functions:prod`
- [ ] **Edge-Function-Secrets setzen:** `npm run secrets:prod` mit `supabase/.env.prod`
      — dabei sicherstellen, dass `EMAIL_REDIRECT_TO` **nicht** gesetzt ist
- [ ] **Cloudflare:** Build-Variable `VITE_SUPABASE_URL` und den Anon-Key auf das neue Projekt umstellen, dann neu deployen
- [ ] **Leaked Password Protection** wieder aktivieren
- [ ] `.env.deploy` auf die neue Projekt-Ref und den neuen Pooler-Host anpassen

## Rückspielprobe — einmal im Quartal

Der wichtigste Punkt dieses Dokuments. Ein Backup, das nie zurückgespielt wurde, ist eine
Hoffnung, kein Sicherheitsnetz.

1. Ein Wegwerf-Supabase-Projekt anlegen
2. Die aktuellste Sicherung nach obiger Anleitung einspielen
3. Prüfen: Sind alle Studios da? Stimmen die Nutzerzahlen? Sind Kurse und Anmeldungen vollständig?
4. **Projekt danach sofort löschen** — es enthält echte Personendaten

Ergebnis mit Datum unten festhalten.

| Datum | Sicherung vom | Ergebnis | Durchgeführt von |
|-------|---------------|----------|------------------|
| _(noch keine)_ | | | |

## Wenn der Job fehlschlägt

GitHub verschickt bei fehlgeschlagenen geplanten Läufen automatisch eine E-Mail an die Person,
die den Zeitplan zuletzt geändert hat. **Diese Mails nicht wegklicken.** Häufige Ursachen:

| Meldung | Ursache |
|---------|---------|
| `PROD_REF ... fehlt in den Secrets` | Secret gelöscht oder umbenannt |
| Verbindung schlägt fehl | Datenbank-Passwort rotiert, Secret nicht nachgezogen |
| `ist nur N Bytes gross` | Dump leer — Zugriffsrechte oder pausiertes Projekt prüfen |
| `Tabelle ... fehlt im Datendump` | Schema hat sich geändert, Prüfliste im Workflow anpassen |

## Aufbewahrung

Geregelt über eine Lifecycle-Regel am R2-Bucket, nicht über den Workflow. Empfehlung:
**30 Tage**. Bei etwa 10–50 MB je Sicherung bleibt das weit unter dem kostenlosen R2-Kontingent.
