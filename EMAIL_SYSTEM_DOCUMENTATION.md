# E-Mail-Infrastruktur Dokumentation

## Übersicht

Die App verfügt jetzt über eine vollständige E-Mail-Infrastruktur für:
- E-Mail-Verifizierung bei der Registrierung
- Passwort-Zurücksetzen ("Passwort vergessen")
- Bestätigungsmails bei Passwortänderungen

## E-Mail-Konfiguration (Gmail SMTP)

Die Edge Function `send-email` versendet E-Mails über **Gmail SMTP** (nodemailer). Absender ist „Die Thallers“ mit der konfigurierten E-Mail-Adresse (siehe `SENDER_EMAIL` bzw. `SMTP_USER`).

**Interner Aufruf von send-email:** Die Functions `request-password-reset`, `send-verification-email` und `reset-password` rufen `send-email` per HTTP mit dem Header **X-Internal-Secret** auf. Der JWT-Check für `send-email` ist deaktiviert (`supabase/config.toml`: `[functions.send-email] verify_jwt = false`); die Absicherung erfolgt über das gemeinsame Secret.

- **INTERNAL_EMAIL_SECRET** muss in **Edge Functions → Secrets** gesetzt sein (langer Zufallswert). Derselbe Wert gilt für alle Edge Functions im Projekt; nur Aufrufer mit diesem Header können E-Mails auslösen. Für PROD dasselbe Secret (oder ein eigener Wert) in den PROD-Edge-Function-Secrets hinterlegen.
- **SMTP-Secrets** müssen in **Edge Functions → Secrets** gesetzt sein: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. **Niemals** im Code oder Repo speichern.

### Secret `APP_URL` (Links in Bestätigungs- und Reset-Mails)

Die Functions `send-verification-email`, `request-verification-email` und `request-password-reset` setzen die Basis-URL für Links (`…/verify-email?token=…` bzw. `…/reset-password?token=…`).

- **Priorität (Verifizierung / Passwort-Reset):** Es wird ein **Tenant-Slug** ermittelt (`users.tenant_id` → `tenants.slug`; falls `tenant_id` in `public.users` noch leer ist, Fallback über **`auth.users.user_metadata.tenant_id`**). Ist ein Slug da und gilt mindestens eines der folgenden Punkte, lautet der Link **`https://{slug}.{apex}`** (z. B. `https://studio1.omlify.de/verify-email?…`):
  - Edge-Secret **`APP_BASE_DOMAIN`** = `omlify.de`, **oder**
  - Der Request-Header **`Origin`** ist eine **Apex-URL** (Hostname mit genau zwei Labels wie `omlify.de`, oder `www.omlify.de`) — dann wird die Apex-Domain aus `Origin` abgeleitet, **ohne** separates Secret.

- **Fallback:** Slug unbekannt oder Origin ist bereits eine Studio-Subdomain → **`Origin`**, dann **`APP_URL`**, dann `http://localhost:5173`.

- **`APP_URL` in PROD:** Entweder **nicht setzen** oder auf die **kanonische Produkt-URL** setzen (z. B. `https://omlify.de`). **Nicht** auf `*.workers.dev` setzen.

- **Betreff und HTML („Willkommen bei Die Thallers!“ usw.):** fest in den jeweiligen Edge-Function-Dateien unter `supabase/functions/` (nicht im Supabase-Dashboard).

### Gmail einrichten (aktuell verwendet)

1. Gehen Sie zu Ihrem Supabase Dashboard → **Edge Functions** → **Secrets**.
2. Fügen Sie folgende Secrets hinzu:
   - `SMTP_HOST`: `smtp.gmail.com`
   - `SMTP_PORT`: `465` (empfohlen; SSL). Alternativ `587` (STARTTLS).
   - `SMTP_USER`: Ihre **vollständige** Gmail-Adresse (z. B. yogaflowapplication@gmail.com) – exakt so, keine Leerzeichen.
   - `SMTP_PASS`: Ein **Gmail-App-Passwort** (nicht Ihr normales Gmail-Passwort)
     - Gmail-App-Passwort erzeugen: Google-Konto → Sicherheit → 2-Faktor-Aktivierung aktivieren → App-Passwörter → Passwort für „Mail“ erzeugen.
     - Das App-Passwort hat **16 Zeichen ohne Leerzeichen**. Google zeigt es oft als „xxxx xxxx xxxx xxxx“ – in den Secrets **ohne Leerzeichen** eintragen (16 Zeichen hintereinander).
   - **Optional** `SENDER_EMAIL`: Absender-Adresse (z. B. dieselbe Gmail-Adresse). Ohne Angabe wird `SMTP_USER` verwendet.

E-Mails werden dann von „Die Thallers“ &lt;IhreGmail@…&gt; versendet.

---

### Option B: Outlook / Microsoft 365 (z. B. für App-E-Mails)

1. Supabase Dashboard → **Edge Functions** → **Secrets**.
2. Secrets anlegen:
   - `SMTP_HOST`: `smtp.office365.com` (bei @outlook.de/@outlook.com ggf. `smtp-mail.outlook.com` testen)
   - `SMTP_PORT`: `587`
   - `SMTP_USER`: Ihre Outlook-Adresse (z. B. yogaflowapp@outlook.de)
   - `SMTP_PASS`: Ihr Outlook-Passwort oder **App-Passwort** (**nur** in Supabase Secrets eintragen, **niemals** im Code oder Repo)

**Persönliches Microsoft-Konto (@outlook.com, @outlook.de) – SMTP aktivieren (Schritt für Schritt):**

1. Im Browser zu **https://account.microsoft.com** gehen und mit dem Konto anmelden (z. B. yogaflowapp@outlook.de).
2. Oben rechts auf **Mein Konto** klicken, dann **Sicherheit** (oder direkt **https://account.live.com/proofs/Manage**).
3. Unter **Sicherheitsoptionen** nach **App-Kennwörter** oder **App-Passwörter** suchen.
4. Falls 2-Faktor-Authentifizierung noch nicht aktiv ist: Zuerst unter **Sicherheit** die **Zwei-Schritt-Verifizierung** aktivieren (nötig für App-Passwörter).
5. **App-Passwort erstellen:** Bei „App-Kennwörter“ auf **Neues App-Kennwort erstellen** klicken, Namen vergeben (z. B. „YogaFlow E-Mail“), erzeugen. Den angezeigten **16-Zeichen-Code** kopieren (ohne Leerzeichen).
6. In Supabase unter **Edge Functions → Secrets** bei **SMTP_PASS** genau dieses App-Passwort eintragen (nicht das normale Microsoft-Passwort).
7. Wenn der Fehler „SmtpClientAuthentication is disabled“ auftritt: Unter **https://aka.ms/smtp_auth_disabled** prüfen, ob für deine Region/Kontotyp zusätzlich SMTP AUTH freigeschaltet werden muss; ggf. in den erweiterten Sicherheitseinstellungen des Microsoft-Kontos nach „SMTP“ oder „Authenticated SMTP“ suchen und aktivieren.

Wenn E-Mails nicht ankommen: Edge Function Logs (send-email, request-password-reset) im Dashboard prüfen – dort steht z. B. „no user found“ oder der SMTP-Fehler.

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
Basis-Funktion zum Versenden von E-Mails über **Gmail SMTP** (nodemailer).
- Erfordert Secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in Edge Function Secrets; optional `SENDER_EMAIL`
- Absender: „Die Thallers“ &lt;SENDER_EMAIL bzw. SMTP_USER&gt;
- Unterstützt HTML-E-Mails; Absicherung über `INTERNAL_EMAIL_SECRET` (X-Internal-Secret Header)

### 2. `send-verification-email`
Sendet Verifizierungs-E-Mail nach Registrierung.
- Erstellt sicheren Token (24h gültig)
- Generiert Verifizierungslink
- Sendet professionell gestaltete HTML-E-Mail

### 2b. `request-verification-email`
Sendet Bestätigungsmail **ohne Login** erneut (z. B. wenn die erste nicht angekommen ist).
- Aufruf mit nur `email` im Body (wie „Passwort vergessen“)
- Neutrale Antwort (kein Hinweis, ob Konto existiert)
- Auf der Login-Seite: Link „Bestätigungsmail nicht erhalten? Erneut senden“

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
- SMTP-Fehler (z. B. ungültige SMTP-Secrets, Gmail 535)
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

### „Email rate limit exceeded“ bei Registrierung
- Supabase begrenzt Anmeldeversuche pro Zeiteinheit (z. B. wenige Mails pro Stunde). Nach Überschreitung: etwa **1 Stunde warten**, dann erneut versuchen.
- **Limits anpassen:** Im Supabase Dashboard unter **Authentication → Rate Limits** die Grenzwerte für Sign-up/E-Mail ansehen und ggf. erhöhen (Projekt-Einstellungen).
- Die App zeigt in diesem Fall eine verständliche Meldung und verweist auf „Bestätigungsmail erneut senden“, falls der Account schon existiert.

### E-Mails werden nicht gesendet
- **INTERNAL_EMAIL_SECRET** in Edge Function Secrets setzen (muss für send-email und aufrufende Functions identisch sein); bei 401 aus send-email: Secret prüfen.
- **SMTP-Secrets** in Edge Function Secrets setzen: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (siehe „Gmail einrichten“ oben).
- Edge Function Logs (send-email, request-password-reset, request-verification-email) im Dashboard prüfen.

### Login nicht möglich, weil „E-Mail nicht bestätigt“
- **Bestätigungsmail erneut senden:** Auf der Login-Seite E-Mail eintragen und auf „Bestätigungsmail nicht erhalten? Erneut senden“ klicken.
- **Login ohne Bestätigung (nur zum Entsperren):** Im Supabase Dashboard unter **Authentication → Providers → Email** die Option **„Confirm email“** deaktivieren. Dann können sich Nutzer auch ohne geklickten Bestätigungslink anmelden. Für Produktion wieder aktivieren, sobald gewünscht.

### Gmail-Fehler „535-5.7.8 Username and Password not accepted“
- **SMTP_PASS** muss ein **Gmail-App-Passwort** sein (nicht das normale Passwort). 2-Faktor-Authentifizierung muss aktiv sein, um ein App-Passwort zu erzeugen.
- App-Passwort **ohne Leerzeichen** eintragen (16 Zeichen; Google zeigt „xxxx xxxx xxxx xxxx“ – alle Leerzeichen entfernen).
- **SMTP_USER** muss die **vollständige Gmail-Adresse** sein (z. B. `you@gmail.com`).
- In den Supabase Secrets keine Leerzeichen am Anfang oder Ende eintragen (die Edge Function trimmt Werte; bei Verdacht Secret neu eintragen).

### 535 trotz korrektem App-Passwort (passLength=16, keine Leerzeichen)
Gmail kann SMTP-Anmeldungen von **Rechenzentrum-IPs** (z. B. Supabase/Cloud) blockieren oder einschränken – auch bei korrekten Zugangsdaten. **Lösungen:**
- **Port 587 testen:** In den Secrets `SMTP_PORT` auf `587` setzen (STARTTLS statt reines SSL).
- **Produktion:** Statt Gmail einen eigenen SMTP-Server nutzen (z. B. **IONOS**, Option C in dieser Doku). IONOS (tanja@die-thallers.de) ist für den Live-Betrieb ohnehin vorgesehen und umgeht Gmail-Beschränkungen.

### Token-Fehler
- Datenbank-Logs überprüfen
- Token-Ablaufzeiten überprüfen
- RLS-Policies überprüfen

### Links funktionieren nicht
- APP_URL Umgebungsvariable überprüfen
- Routen in App.tsx überprüfen
