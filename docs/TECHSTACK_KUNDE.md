Hier ist die kundenfähige Übersicht aus Repo, Live-DNS und Doku. Vor dem Versand solltest du die **drei gelb markierten Punkte** im Dashboard noch einmal gegenprüfen (genaue Supabase-Region, aktueller SMTP-Absender, R2-Jurisdiction).

---

# Omlify – Technik, Server, Datenstandorte

**Produkt:** Omlify (Yoga-Studio-Management, Mehrmandanten-SaaS)  
**Live:** [https://omlify.de](https://omlify.de) sowie Studio-Subdomains `https://<studio>.omlify.de`  
**Test:** [https://omlify-dev.de](https://omlify-dev.de) sowie `https://<studio>.omlify-dev.de`

Es gibt **keine eigenen physischen Server** bei uns. Die Plattform läuft vollständig auf gemieteten Cloud-Diensten. Die **Kundendaten liegen in einer PostgreSQL-Datenbank bei Supabase auf AWS in Europa**, nicht auf den Rechnern der Entwickler.

---

## 1. Kurz: Wo liegt was?

| Was | Anbieter | Wo | Enthält Personen-/Kundendaten? |
|-----|----------|----|-------------------------------|
| **Hauptdatenbank** (Nutzer, Kurse, Buchungen, Nachrichten) | **Supabase** auf **Amazon Web Services** | **EU** – dokumentierte Hosts: Frankfurt (`eu-central-1`) bzw. Irland (`eu-west-1`). Die exakte Region steht im Supabase-Dashboard unter Settings → Infrastructure. | **Ja – das ist der primäre Datenspeicher** |
| **Login / Passwort-Hashes** | **Supabase Auth** (GoTrue) | Dieselbe AWS-Region wie die Datenbank | Ja (E-Mail, Passwort nur als Hash) |
| **Web-App** (HTML/JS/CSS) | **Cloudflare Workers** | Globales Edge-Netzwerk (Auslieferung am nächsten Standort zum Nutzer) | Nein. Die App ist statisch; Kundendaten fließen **nicht** dauerhaft über Cloudflare. |
| **DNS / Domain** | **Cloudflare** | Nameserver `lina.ns.cloudflare.com` / `martin.ns.cloudflare.com` | Nein |
| **Tägliche Datenbank-Sicherung** | **Cloudflare R2** (S3-kompatibler Objektspeicher), verschlüsselt | Abhängig von der Bucket-Einstellung (Standard oder EU-Jurisdiction). Der Upload-Endpunkt im Backup-Job ist der globale R2-Endpunkt, **nicht** explizit `.eu.`. | Ja, aber **GPG-verschlüsselt** |
| **Backup-Job** | **GitHub Actions** (`ubuntu-latest`) | Typischerweise **USA** (Microsoft Azure) – nur temporär während des Dumps, danach verschlüsselt nach R2 | Ja, kurzzeitig unverschlüsselt im Runner, danach GPG |
| **Quellcode** | **GitHub** (Organisation YogaFlow) | USA (GitHub/Microsoft) | Nein (keine Kundendaten im Repo). Das Repo ist aktuell **öffentlich**. |
| **E-Mail-Versand** (Verifizierung, Passwort-Reset) | SMTP über **Gmail** (so dokumentiert) oder alternativ **IONOS / Microsoft 365** | Google: überwiegend USA; IONOS: Deutschland/EU | Ja: Empfängeradresse + Mailinhalt |
| **E-Mail-Empfang** für `omlify.de` | **IONOS** (MX `mx00.ionos.de` / `mx01.ionos.de`, SPF `_spf-eu.ionos.com`) | Deutschland / EU | Nur wenn jemand an Adressen @omlify.de schreibt |
| **CI (Build/Lint)** | GitHub Actions | USA | Nein (baut nur Code, keine Live-Daten) |

**Datenfluss im Alltag (PROD):**

1. Der Browser lädt die Web-App von **Cloudflare** (weltweit).
2. Login und alle Fachdaten gehen **direkt vom Browser zu Supabase** in der EU-AWS-Region – nicht über einen eigenen App-Server.
3. Passwort-Reset- und Bestätigungsmails erzeugt eine **Supabase Edge Function** und schickt sie per SMTP.

---

## 2. Architektur (Schichten)

```
Nutzer-Browser
    │
    ├─ Web-App ──────── Cloudflare Workers (global, SPA)
    │
    ├─ API / Auth ──── Supabase (AWS EU)
    │                     ├─ PostgreSQL  (Fachdaten)
    │                     ├─ Auth        (Konten, Sessions)
    │                     └─ Edge Functions (Deno: E-Mail, Onboarding, User-Admin)
    │
    ├─ E-Mail ──────── SMTP (Gmail / IONOS / M365)
    │
    └─ Backups ────── GitHub Actions → GPG → Cloudflare R2
```

Es gibt **keinen klassischen App-Server** (kein eigener VPS, kein Kubernetes, kein Netlify mehr). Die frühere Netlify-Umgebung ist abgeschaltet.

Zwei getrennte Welten:

| Umgebung | Domain | Datenbank | Zweck |
|----------|--------|-----------|--------|
| **PROD** | `omlify.de` / `*.omlify.de` | eigenes Supabase-Projekt | echte Studios und Nutzer |
| **DEV** | `omlify-dev.de` / `*.omlify-dev.de` | eigenes Supabase-Projekt | Tests, Abnahme |
| **Lokal** | `localhost` | nur DEV-Datenbank | Entwicklung |

PROD-Zugangsdaten liegen **nicht** in der lokalen `.env` und **nicht** im Git-Repository.

---

## 3. Frontend / Client

| Baustein | Details |
|----------|---------|
| Sprache | **TypeScript** |
| UI | **React 18** |
| Routing | **React Router 7** (SPA, Client-Side) |
| Build | **Vite 7** |
| Styling | **Tailwind CSS 3**, Lucide-Icons |
| Datum | **date-fns**, **react-datepicker** |
| Hosting-Plugin | `@cloudflare/vite-plugin` + **Wrangler 4** |
| Auth-Client | `@supabase/supabase-js` |

Die gebaute App ist eine **Single-Page Application**. Cloudflare liefert sie als Worker mit statischen Assets aus (`not_found_handling: single-page-application`). Worker-Namen intern: DEV `omlify-dev`, PROD historisch `yogaflow-dev` (die Live-Domain ist trotzdem `omlify.de`).

**Nicht vorhanden:** Tracking (kein Google Analytics, kein Meta-Pixel, kein Sentry), keine eingebetteten Google Fonts, kein CDN für Bilder, kein Payment-Widget.

**Im Browser gespeichert:**
- Session-Token von Supabase im `localStorage` (Schlüssel `sb-…`)
- UI-Hilfsstände (z. B. ausgeblendete Chats) ebenfalls lokal im Browser

---

## 4. Backend / Datenbank (das relevante Datenzentrum)

### 4.1 Supabase / PostgreSQL

| Punkt | Stand |
|-------|--------|
| Produkt | **Supabase** (Managed Postgres + Auth + Edge Functions) |
| Infrastruktur darunter | **AWS** |
| Region | **Europa** – im Projekt dokumentiert als Pooler-Hosts `aws-1-eu-central-1` (Frankfurt) bzw. `aws-1-eu-west-1` (Irland). Bitte vor Kundenversand im Dashboard die **eine** Live-Region ablesen. |
| Plan | PROD laut Backup-Doku: **Free Plan** (keine automatischen Supabase-Backups, kein Point-in-Time-Recovery) |
| Isolation | DEV und PROD = **zwei getrennte Projekte** |
| Zugriffsschutz | **Row Level Security (RLS)** auf den Fachtabellen; Mandanten (`tenants`) trennen Studios voneinander |
| Dateispeicher | **Supabase Storage wird nicht genutzt** (keine hochgeladenen Fotos/PDFs) |
| Realtime | **nicht im Einsatz** (Benachrichtigungen per Polling alle 30 s) |

Postgres, Auth und (falls genutzt) Storage bleiben bei gewählter Region in genau dieser AWS-Region. Das ist der Speicherort, den ein Kunde für „unsere Daten“ meint.

### 4.2 Welche Daten liegen in der Datenbank?

**Personenbezogene Daten (pro Nutzer):**
- E-Mail, Vorname, Nachname
- optional: Telefon, Straße, Hausnummer, PLZ, Ort
- Rolle: Owner / Admin / Lehrer / Teilnehmer
- Zugehörigkeit zum Studio (`tenant_id`)
- Passwort nur als Hash (Supabase Auth)
- DSGVO-Einwilligungsfelder (`gdpr_consent`, `gdpr_consent_date`)
- E-Mail-Verifizierungsstatus, Auth-Tokens (Verifizierung / Passwort-Reset, zeitlich begrenzt)

**Fachdaten (pro Studio/Mandant):**
- Studio-Name und Subdomain-Slug
- Kurse (Titel, Beschreibung, Ort, Raum, Zeiten, Preis als Zahl, Teilnehmerlimit, Lehrer)
- Anmeldungen und Warteliste
- In-App-Nachrichten (Kurschat)
- In-App-Benachrichtigungen
- Studio-Einstellungen (z. B. Stornierungsfrist)

**Kein Zahlungsdienst:** Kurse haben einen Preis als Feld, es gibt **kein Stripe/PayPal**, keine Kreditkartendaten.

### 4.3 Edge Functions (serverseitig bei Supabase, Runtime Deno)

| Function | Aufgabe |
|----------|---------|
| `send-email` | SMTP-Versand (nodemailer) |
| `send-verification-email` / `request-verification-email` / `verify-email` | Registrierungsbestätigung |
| `request-password-reset` / `reset-password` | Passwort vergessen |
| `onboarding-public` | Studio-Onboarding ohne direkten DB-Zugriff mit Anon-Key |
| `update-user` / `delete-user` | Nutzerverwaltung (nur Owner/Admin/Teacher) |

Die Functions laufen in der Supabase-Infrastruktur. Ohne regionale Festlegung können einzelne Function-Aufrufe theoretisch außerhalb der DB-Region ausgeführt werden; die **persistierten Daten** bleiben in der Projektregion.

---

## 5. Hosting, Domain, E-Mail

### Cloudflare (Web + DNS + Backup-Objektstore)

- **Workers** mit Observability (Logs) aktiv
- Custom Domains: `omlify.de`, `*.omlify.de`, `omlify-dev.de`, `*.omlify-dev.de`
- DNS-IPs sind Cloudflare-Anycast (`104.21…`, `172.67…`) – typisch für „orange cloud“ / Proxy
- **R2:** tägliche verschlüsselte PROD-Dumps, Aufbewahrung empfohlen **30 Tage** (Lifecycle-Regel am Bucket)
- Deploy: Git-Build von Branch `main` + Wrangler. Cloudflare ändert **nur Code**, nie das Datenbankschema.

Cloudflare speichert die App-Dateien global. **Kundendatenbanken liegen nicht bei Cloudflare**, außer den **verschlüsselten Backups in R2**.

Für strikte EU-Residenz der Backups: R2-Bucket mit Jurisdiction **`eu`** anlegen. Der aktuelle Job nutzt `https://<account>.r2.cloudflarestorage.com` (Standard-Endpunkt).

### Domain / Postfach

- Domain und DNS: Cloudflare
- **MX für omlify.de: IONOS Deutschland** (`mx00.ionos.de`, `mx01.ionos.de`)
- SPF: `v=spf1 include:_spf-eu.ionos.com ~all`

### Transaktionsmails der App

Die App sendet **nicht** über Supabase-Systemmail, sondern über eigene SMTP-Secrets.

Dokumentiert als aktuell: **Gmail SMTP** (`smtp.gmail.com`, Port 465), Absendername „Omlify“. Alternativen in der Doku: **IONOS** (`smtp.ionos.de`) und **Outlook/M365**.

Das ist für Datenschutz relevant: Bei Gmail verlassen Mailinhalte Google-Infrastruktur (USA). Bei IONOS bleiben sie eher in DE/EU. **Bitte im PROD-Dashboard unter Edge Function Secrets nachschauen, welcher `SMTP_HOST` wirklich gesetzt ist**, bevor ihr das dem Kunden als Fakt gebt.

---

## 6. Sicherheit und Betrieb

| Maßnahme | Umsetzung |
|----------|-----------|
| Mandantentrennung | Jedes Studio = eigener `tenant`; RLS + Subdomain |
| Autorisierung | JWT (Supabase Auth), Rollenprüfung, RLS |
| Passwörter | gehashed in Auth; Leaked-Password-Protection (HaveIBeenPwned) vorgesehen |
| Secrets | nicht im Git; Cloudflare Build-Vars + Supabase Function Secrets + GitHub Action Secrets |
| Schema-Änderungen | SQL-Migrationen, erst DEV, dann bewusst PROD |
| Releases | Branch `Julius` → Pull Request → Review → `main` → Cloudflare-Deploy |
| CI | GitHub Actions: TypeScript, ESLint, Production-Build, keine Secrets im Repo |
| Backup | täglich 03:00 UTC, GPG-verschlüsselt, ohne Passphrase nicht lesbar |
| Wiederherstellung | Dump in ein **neues** leeres Supabase-Projekt (kein Überschreiben der Live-DB) |
| Logging | Cloudflare Workers Observability; Supabase Edge-Function-Logs |

**Backup-Grenze (ehrlich):** maximal ca. **24 Stunden** Datenverlust zwischen zwei Läufen. Der Free-Plan hat kein PITR.

**Transit-Hinweis für DSGVO:** Beim täglichen Backup liegt der Datenbank-Dump kurz auf einem **GitHub-Actions-Runner (USA)**, wird dort GPG-verschlüsselt und nach R2 geschoben. Das ist ein möglicher Drittlandtransfer und sollte in AVV/TIA stehen, falls der Kunde danach fragt.

---

## 7. Auftragsverarbeiter / Subprocessoren (für den Kunden)

Nur Dienste, die **personenbezogene Daten** sehen oder transportieren können:

| Auftragsverarbeiter | Rolle | Sitz / Hosting | DPA / Hinweis |
|---------------------|-------|----------------|---------------|
| **Supabase, Inc.** | Datenbank, Auth, Edge Functions | AWS EU (Projektregion) | [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), [GDPR](https://supabase.com/docs/guides/security/gdpr-compliance) |
| **Amazon Web Services** | Unterauftragnehmer von Supabase | EU-Region des Projekts | über Supabase |
| **Cloudflare, Inc.** | CDN/Workers, DNS, R2-Backups | global / R2 je Bucket | Cloudflare DPA; Workers-Logs können Metadaten enthalten |
| **GitHub (Microsoft)** | Quellcode, CI, Backup-Job | USA | DPA; Backup-Job verarbeitet PROD-Dump |
| **Google** (falls Gmail-SMTP aktiv) | Versand Transaktionsmails | überwiegend USA | Google Workspace/Gmail DPA |
| **IONOS SE** | MX für omlify.de; optional SMTP | Deutschland | IONOS AVV |

**Nicht im Einsatz:** Stripe, PayPal, SendGrid, Mailchimp, Analytics, Error-Tracking, eigene File-Storage-Buckets, eigene Server in einem deutschen Rechenzentrum.

---

## 8. Was der Kunde typischerweise wissen will

**„Liegen unsere Daten in Deutschland/EU?“**  
Die **Nutz- und Kursdaten** liegen in **PostgreSQL bei Supabase auf AWS in der EU** (Frankfurt oder Irland – Dashboard prüfen). Es gibt **kein deutsches Dedicated-Rechenzentrum** von uns.

**„Wer kann darauf zugreifen?“**  
Studio-Personal gemäß Rolle; Plattform-Betreiber über das Supabase-PROD-Projekt; Entwickler im Alltag nur gegen die **DEV**-Datenbank.

**„Geht etwas in die USA?“**  
Ja, potenziell: GitHub (Code + Backup-Job), Cloudflare-Edge (Auslieferung, Logs), und – falls Gmail SMTP – E-Mails. Die **primäre Datenbank** ist EU-AWS.

**„Speichert ihr Dateien/Fotos?“**  
Nein. Kein Supabase Storage, kein Nutzer-Upload.

**„Gibt es Tracking?“**  
Nein, kein Analytics-Pixel.

**„Zahlungsdaten?“**  
Keine. Nur ein Preis-Feld am Kurs, keine Zahlungsabwicklung.

---

## 9. Vor dem Kundenmail noch intern prüfen

1. **Supabase PROD → Settings → Infrastructure:** genaue Region notieren (Frankfurt vs. Irland).
2. **Edge Functions → Secrets:** `SMTP_HOST` (Gmail vs. IONOS).
3. **Cloudflare R2:** Bucket-Location / EU-Jurisdiction.
4. Datenschutzerklärung in der App ist noch **Platzhalter** (`/datenschutz`) – für den Kunden besser einen eigenen Text/AVV liefern als die Live-Seite.
5. GitHub-Repo `YogaFlow/YogaFlow-DEV` ist **public** – kein Kundendatenleck, aber der **Quellcode ist öffentlich**.

Wenn du willst, formatiere ich das als einseitiges PDF-Wording oder als AVV-Anlage „Technische und organisatorische Maßnahmen / Subprocessoren“.
