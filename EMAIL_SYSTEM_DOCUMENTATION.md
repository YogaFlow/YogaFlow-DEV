# E-Mail-Infrastruktur Dokumentation

## Übersicht

Die App verfügt jetzt über eine vollständige E-Mail-Infrastruktur für:
- E-Mail-Verifizierung bei der Registrierung
- Passwort-Zurücksetzen ("Passwort vergessen")
- Bestätigungsmails bei Passwortänderungen

## SMTP-Konfiguration

Der Absender aller E-Mails wird aus dem Secret `SMTP_USER` gelesen (in der Edge Function `send-email`). Sie können für Produktion einen eigenen SMTP-Server (z. B. IONOS) und zum Testen eine private E-Mail (z. B. Gmail) verwenden.

### Option A: Zum Testen mit Gmail (z. B. juliusbne@gmail.com)

1. Gehen Sie zu Ihrem Supabase Dashboard → **Edge Functions** → **Secrets**.
2. Fügen Sie folgende Secrets hinzu:
   - `SMTP_HOST`: `smtp.gmail.com`
   - `SMTP_PORT`: `587`
   - `SMTP_USER`: Ihre Gmail-Adresse (z. B. juliusbne@gmail.com)
   - `SMTP_PASS`: Ein **Gmail-App-Passwort** (nicht Ihr normales Gmail-Passwort)
     - Gmail-App-Passwort erzeugen: Google-Konto → Sicherheit → 2-Faktor-Aktivierung aktivieren → App-Passwörter → Passwort für „Mail“ erzeugen und eintragen

E-Mails werden dann von „Die Thallers“ &lt;IhreGmail@…&gt; versendet.

### Option B: Outlook / Microsoft 365 (z. B. für App-E-Mails)

1. Supabase Dashboard → **Edge Functions** → **Secrets**.
2. Secrets anlegen:
   - `SMTP_HOST`: `smtp.office365.com` (bei @outlook.de/@outlook.com ggf. `smtp-mail.outlook.com` testen)
   - `SMTP_PORT`: `587`
   - `SMTP_USER`: Ihre Outlook-Adresse (z. B. yogaflowapp@outlook.de)
   - `SMTP_PASS`: Ihr Outlook-Passwort (**nur** in Supabase Secrets eintragen, **niemals** im Code oder Repo)

Bei Outlook mit 2-Faktor-Authentifizierung ggf. ein App-Passwort verwenden (Microsoft-Konto → Sicherheit → Erweiterte Sicherheitsoptionen). Wenn E-Mails nicht ankommen: Edge Function Logs (send-email, request-password-reset) im Dashboard prüfen – dort steht z. B. „no user found“ oder der SMTP-Fehler.

### Option C: Produktion mit IONOS (tanja@die-thallers.de)

```
SMTP_HOST=smtp.ionos.de
SMTP_PORT=465
SMTP_USER=tanja@die-thallers.de
SMTP_PASS=<Ihr geheimes Passwort>
```

1. Supabase Dashboard → **Edge Functions** → **Secrets**.
2. Secrets anlegen:
   - `SMTP_USER`: tanja@die-thallers.de
   - `SMTP_PASS`: Ihr IONOS E-Mail-Passwort
   - `SMTP_HOST`: smtp.ionos.de
   - `SMTP_PORT`: 465

## Datenbank-Schema

### Neue Tabelle: `auth_tokens`
Speichert alle Verifizierungs- und Reset-Tokens mit:
- Unique Token (32 Bytes, hex-kodiert)
- Typ (email_verification oder password_reset)
- Ablaufzeit (24h für Verifizierung, 1h für Passwort-Reset)
- Verbrauchsstatus

### Neue Spalten in `users`-Tabelle:
- `email_verified` (boolean, default: false)
- `email_verified_at` (timestamptz)

## Edge Functions

### 1. `send-email`
Basis-Funktion zum Versenden von E-Mails über SMTP.
- Verwendet Nodemailer
- Unterstützt HTML und Plain-Text E-Mails
- Absender: "Die Thallers" &lt;SMTP_USER&gt; (aus Edge Function Secrets)

### 2. `send-verification-email`
Sendet Verifizierungs-E-Mail nach Registrierung.
- Erstellt sicheren Token (24h gültig)
- Generiert Verifizierungslink
- Sendet professionell gestaltete HTML-E-Mail

### 3. `verify-email`
Verifiziert E-Mail-Adresse mit Token.
- Prüft Token-Gültigkeit
- Markiert User als verifiziert
- Markiert Token als verbraucht

### 4. `request-password-reset`
Fordert Passwort-Reset an.
- Neutrale Antwort (gegen Account-Enumeration)
- Erstellt Reset-Token (1h gültig)
- Sendet Reset-Link per E-Mail

### 5. `reset-password`
Setzt Passwort zurück.
- Verifiziert Reset-Token
- Ändert Passwort
- Sendet Bestätigungsmail

## Frontend-Seiten

### `/verify-email`
- Automatische Token-Verifikation beim Laden
- Visuelles Feedback (Loading, Success, Error)
- Automatische Weiterleitung zur Login-Seite

### `/forgot-password`
- E-Mail-Eingabeformular
- Erfolgsbestätigung mit Hinweis
- Link zurück zur Anmeldung

### `/reset-password`
- Token-basierte Passwortänderung
- Passwort-Bestätigung
- Passwort-Sichtbarkeit-Toggle
- Erfolgsbestätigung mit Weiterleitung

## Sicherheitsfeatures

1. **Token-Sicherheit**
   - Kryptographisch sichere Tokens (32 Bytes)
   - Einmalige Verwendung
   - Zeitliche Begrenzung
   - Automatische Cleanup-Funktion

2. **RLS (Row Level Security)**
   - Tokens nur über Service-Role zugänglich
   - Keine direkten User-Zugriffe

3. **Account-Enumeration-Schutz**
   - Neutrale Meldungen bei Passwort-Reset
   - Keine Unterscheidung zwischen existierenden/nicht-existierenden Accounts

4. **Passwort-Anforderungen**
   - Mindestens 8 Zeichen
   - Passwort-Bestätigung erforderlich

## Workflow

### Registrierung
1. User füllt Registrierungsformular aus
2. Account wird erstellt (email_verified = false)
3. Verifizierungs-E-Mail wird automatisch gesendet
4. User erhält Bestätigung mit Hinweis auf E-Mail
5. User klickt auf Link in E-Mail
6. Account wird als verifiziert markiert

### Passwort-Zurücksetzen
1. User klickt auf "Passwort vergessen?"
2. User gibt E-Mail-Adresse ein
3. Wenn Account existiert, wird Reset-E-Mail gesendet
4. User klickt auf Reset-Link
5. User gibt neues Passwort ein
6. Passwort wird geändert
7. Bestätigungsmail wird gesendet

## E-Mail-Templates

Alle E-Mails verwenden professionelle HTML-Templates mit:
- Responsive Design
- Thallers-Branding (Teal-Farbe: #0f766e)
- Klare Call-to-Action-Buttons
- Fallback-Links für Kompatibilität
- Hinweise zur Gültigkeit

## Wartung

### Automatische Token-Bereinigung
Die Funktion `cleanup_expired_tokens()` kann periodisch ausgeführt werden:
```sql
SELECT cleanup_expired_tokens();
```

Entfernt:
- Abgelaufene Tokens
- Verbrauchte Tokens älter als 7 Tage

### Monitoring
Überwachen Sie die Edge Function Logs für:
- SMTP-Verbindungsfehler
- Token-Verifikationsfehler
- E-Mail-Versandfehler

## Testen

1. **E-Mail-Verifizierung testen**:
   - Neuen Account registrieren
   - E-Mail überprüfen
   - Auf Verifizierungslink klicken

2. **Passwort-Reset testen**:
   - "Passwort vergessen?" anklicken
   - E-Mail-Adresse eingeben
   - Reset-E-Mail überprüfen
   - Neues Passwort setzen

3. **Fehlerszenarien**:
   - Abgelaufene Tokens
   - Bereits verwendete Tokens
   - Ungültige Tokens

## Fehlerbehebung

### E-Mails werden nicht gesendet
- SMTP-Credentials in Supabase Edge Function Secrets überprüfen (SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT)
- Bei Gmail: App-Passwort verwenden, nicht das normale Passwort
- Edge Function Logs (send-email) im Dashboard prüfen
- Bei IONOS: Account-Status und Zugangsdaten prüfen

### Token-Fehler
- Datenbank-Logs überprüfen
- Token-Ablaufzeiten überprüfen
- RLS-Policies überprüfen

### Links funktionieren nicht
- APP_URL Umgebungsvariable überprüfen
- Routen in App.tsx überprüfen
