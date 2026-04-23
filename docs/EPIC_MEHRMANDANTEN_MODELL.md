# Scrum Epic: Mehrmandanten-Modell

**Stand:** 2026-04-22
**Branch:** Julius
**Basis-Dokumente:** [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md) · [MULTI_TENANT_PRODUCT_BACKLOG.md](MULTI_TENANT_PRODUCT_BACKLOG.md)

---

## Epic-Ziel

YogaFlow wird zu einer **Multi-Tenant-Plattform**: Jedes Studio (Tenant) betreibt eine eigene, mandantengetrennte Instanz der App unter einer eigenen Subdomain. Ein Studio-Inhaber (Owner) registriert sein Studio über einen öffentlichen Onboarding-Wizard, erhält nach E-Mail-Verifikation eine aktive Session und verwaltet von dort Kurse, Teilnehmer und Nutzerrollen — vollständig isoliert von anderen Studios.

---

## Scope

### In diesem Epic (MVP)

- Tenant-Datenmodell mit erweiterten Slug-Regeln (E1)
- Nutzer- & Rollenzuordnung zum Tenant inkl. `first_name`/`last_name` (E2)
- Row Level Security auf allen relevanten Tabellen (E3)
- Tenant-Kontext aus Host/URL + 5-Schritt-Onboarding-Wizard (E4)
- Kurse & Buchung mandantengetrennt (E5)
- Rollenvergabe durch Owner — **neu, jetzt MVP** (E6)
- Landing Page mit CTA zum Onboarding
- Platzhalter-Seiten für AGB und Datenschutz

### Explizit nicht in diesem Epic

- Custom Domains / Branding
- Wildcard-DNS-Konfiguration (nach Partnermeeting)
- Supabase Auth Redirect-URLs für Produktionsdomain (nach Partnermeeting)
- Passwort-Reset-Flow für Tenant-User mit korrekter Tenant-URL (nach Domain-Entscheidung)
- Magic Link / OAuth
- Admin/Teacher-UI über den schmalen owner+user-Pfad hinaus
- Owner-Transfer (Ownership auf anderen User übertragen)
- Bezahlsystem für die Plattform
- Nachrichten, Wartelisten-Verwaltungs-UI, erweitertes Branding

---

## Architektur-Entscheidungen

### A1 — Deployment-Modell

**Entscheidung:** Alles in einem Cloudflare Pages Deployment (Modell A — eine Codebasis, ein Deployment).
**Begründung:** Weniger Infrastruktur, alles in einem Repo, kein Koordinationsaufwand.
**Konsequenz:** Apex-Route (`/`) = Landing Page; `/onboarding` = Onboarding-Wizard; Tenant-App unter `<slug>.<basisdomain>`.

### A2 — Domain & Deployment-URL

**Entscheidung:** Produktionsdomain ist `omlify.de` (registriert bei IONOS, DNS-Management über Cloudflare).
**Subdomain-Struktur (Option A):** `<tenant>.omlify.de` → `VITE_APP_BASE_DOMAIN=omlify.de`
**Beispiel:** `studioberlin.omlify.de`
**Preview/DEV:** Cloudflare Pages Preview-Deployments vom Branch `Julius` (`julius.*.pages.dev`) mit `?tenant=<slug>`-Override gegen DEV-Supabase.
**Konsequenz:** Wildcard-DNS-Record `*.omlify.de → Pages` und Custom Domain in Cloudflare Pages einrichten (Checkliste separat). Lokal und in Preview weiterhin `?tenant=<slug>`-Override (E4-08).

### A3 — Tenant-Routing

**Entscheidung:** Reines Frontend-Parsing via `window.location.hostname`.
**Begründung:** Sicherheit liegt in Supabase RLS, nicht im Host-Parsing. Kein Cloudflare Worker nötig — würde nur Komplexität und Kosten ohne Sicherheitsgewinn hinzufügen.
**Konsequenz:** `VITE_APP_BASE_DOMAIN` per Vite-ENV konfigurieren; Dev-Override via `?tenant=<slug>` (niemals in Production auswerten).

### A4 — Auth-Methoden

**Entscheidung:** Nur E-Mail + Passwort im MVP.
**Begründung:** Einfachste sichere Methode; Magic Link / OAuth Post-MVP.

### A5 — E-Mail-Verifizierung

**Entscheidung:** Owner muss E-Mail bestätigen, bevor Zugang zur App möglich ist.
**Konsequenz:** Nach Onboarding-Submit → Bestätigungsseite anzeigen. Nach Klick auf Verifikationslink → Supabase erstellt Session automatisch → Redirect direkt zum Owner-Dashboard (kein separater Login-Schritt nötig).

### A6 — Slug-Regeln

**Entscheidung:**
- Erlaubte Zeichen: `[a-z0-9]` (bereits im Schema)
- Länge: **3–30 Zeichen**
- Reservierte Slugs (dürfen nicht vergeben werden):
  `www`, `app`, `api`, `admin`, `mail`, `smtp`, `ftp`, `staging`, `dev`, `preview`, `static`, `assets`, `cdn`, `auth`, `login`, `signup`, `onboarding`, `dashboard`, `help`, `support`, `status`, `blog`, `docs`, `health`, `webhook`, `webhooks`, `storage`, `media`, `test`, `demo`, `sandbox`, `yogaflow`, `legal`, `privacy`, `terms`, `contact`, `abuse`
- Concurrency: Unique Constraint fängt Race Conditions ab
- Fehlermeldungen: „Dieser Name ist bereits vergeben. Bitte wähle einen anderen." (Unique-Verletzung) / „Dieser Name ist nicht erlaubt." (reservierter Slug)

### A8 — Rollen-Migration (E2)

**Entscheidung:** Option A — saubere Umstellung auf einzelne `role`-Spalte (`text`, nicht Array).
**Mapping:** `admin → admin`, `course_leader → teacher`, `participant → user`; neue Rolle `owner`.
**Konsequenz:** Array-Spalte `roles text[]` wird entfernt; alle RLS-Policies, TypeScript-Types (`UserRole`) und Frontend-Checks (`isCourseLeader`, `isParticipant`) werden auf Einzelrolle umgestellt. Keine doppelte Rollenlogik nach Migration.

### A9 — Atomarer Onboarding-Schreibpfad (E4)

**Entscheidung:** Supabase **Edge Function** mit Service Role Key.
**Begründung:** Nur die Admin-API kann Auth-User anlegen — eine reine Postgres-RPC kann das nicht. Die Edge Function legt atomar an: `tenants`-Zeile, Auth-User, `public.users` mit `tenant_id`, Rolle `owner`, `first_name`, `last_name`.

### A10 — Slug-Reservierungsliste (E1)

**Entscheidung:** Separate Tabelle `reserved_slugs` mit allen 37 reservierten Slugs + Trigger bei INSERT auf `tenants`.
**Begründung:** Flexibler als `CHECK NOT IN (...)` — neue reservierte Slugs können ohne Migrations-Änderung hinzugefügt werden.

### A11 — Live Slug-Verfügbarkeitscheck (E4)

**Entscheidung:** Öffentliche RPC-Funktion (ohne Auth-Session aufrufbar) die nur `true/false` zurückgibt.
**Begründung:** User ist beim Onboarding noch nicht eingeloggt; RLS blockiert direkte `tenants`-Abfragen. Kein Datenleck — nur Verfügbarkeit wird zurückgegeben.

### A12 — Rollen-Escalation-Trigger (E6)

**Entscheidung:** Bestehende Migration `20260122180741_prevent_self_role_escalation.sql` wird im Rahmen von E6 angepasst.
**Neue Regel:** Owner darf Rollen anderer User im eigenen Tenant ändern (außer `owner`-Rolle vergeben); Owner darf seine eigene Rolle nicht ändern; alle anderen Rollen dürfen keine Rollenänderungen vornehmen.

### A7 — Rollenvergabe durch Owner

**Entscheidung:** Owner kann Rollen anderer User im eigenen Tenant hoch- und rückstufen (`user` ↔ `teacher` ↔ `admin`). Rolle `owner` ist nicht übertragbar; Owner kann seine eigene Rolle nicht ändern.
**Begründung:** Ohne Rollenvergabe kann kein echtes Studio betrieben werden — daher MVP, nicht Post-MVP.

---

## Onboarding-Flow (End-to-End)

```
1. Interessent besucht app.yogaflow.de (Apex, kein Tenant-Kontext)
         ↓
2. Landing Page: Erklärtext, Features, Preise + CTA „Jetzt Studio anlegen"
         ↓
3. Klick auf CTA → /onboarding
         ↓
4. Onboarding-Wizard (5 Schritte):
   [1] „Wie heißt dein Studio?"       → Studio-Name
   [2] „Deine Studio-URL"             → Slug + Auto-Vorschlag + Live-Validierung + Echtzeit-Verfügbarkeitscheck
   [3] „Wie heißt du?"                → Vorname + Nachname
   [4] „Dein Zugang"                  → E-Mail + Passwort
   [5] „Alles korrekt?"               → Zusammenfassung + AGB/Datenschutz-Checkbox + „Studio anlegen"
         ↓
5. Server (atomarer Schreibpfad — RPC oder Edge Function):
   → tenants-Zeile anlegen (name, slug)
   → Auth-User anlegen (email, password)
   → public.users anlegen (tenant_id, role: owner, first_name, last_name)
   → Bei Fehler: Rollback/Kompensation; Wizard bleibt auf Schritt 5;
     verständliche Fehlermeldung; kein halb-angelegter Tenant ohne Owner
         ↓
6. Bestätigungsseite: „Schau in dein Postfach und bestätige deine E-Mail-Adresse."
         ↓
7. Owner klickt Verifikations-Link in der Bestätigungsmail
         ↓
8. Supabase erstellt Session automatisch (kein separater Login nötig)
         ↓
9. Redirect → <slug>.<basisdomain>/dashboard (direkt eingeloggt)
         ↓
10. Owner-Dashboard (Ist-App-Funktionsumfang, mandantengetrennt)
```

---

## Sub-Epics & User Stories

### Epic E1 — Tenant & Datenmodell

> Vollständige AK: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md — Epic E1](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)
> Status: Migration `20260408120000_create_tenants_table.sql` vorhanden — US-MVP-E1-01 im Wesentlichen erfüllt.

**US-MVP-E1-01** — Tabelle `tenants` mit Mindestfeldern → siehe MVP-Backlog
**US-MVP-E1-02** — Migration ausführen und Schema prüfen → siehe MVP-Backlog

#### US-E1-03 — Slug-Regeln im Schema erweitern (neu)

**Als** Team **möchten wir** die Slug-Constraints um Längenprüfung und reservierte Slugs ergänzen, **damit** ungültige Slugs bereits auf Datenbankebene abgelehnt werden.

**Akzeptanzkriterien**

- [ ] Migration ergänzt CHECK-Constraint: `LENGTH(slug) BETWEEN 3 AND 30`
- [ ] Migration ergänzt CHECK-Constraint oder Trigger: Slug darf nicht in der reservierten Slug-Liste stehen (37 Slugs gemäß A6)
- [ ] Frontend zeigt je nach Fehlertyp die passende Meldung: „Dieser Name ist bereits vergeben. Bitte wähle einen anderen." (Unique) / „Dieser Name ist nicht erlaubt." (reserviert)
- [ ] **Negative Tests:** Slug `www`, `yogaflow`, Slug mit 2 Zeichen, Slug mit 31 Zeichen → alle abgelehnt
- [ ] **Positiver Test:** Slug mit 3–30 Zeichen, nicht reserviert, nur `[a-z0-9]` → akzeptiert

---

### Epic E2 — Nutzer & Tenant-Zuordnung

> Vollständige AK: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md — Epic E2](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)

**US-MVP-E2-01** — `tenant_id` auf `users` mit Fremdschlüssel → siehe MVP-Backlog
**US-MVP-E2-02** — E-Mail-Eindeutigkeit pro Tenant → siehe MVP-Backlog
**US-MVP-E2-03** — Rollenmodell owner/admin/teacher/user → siehe MVP-Backlog
**US-MVP-E2-04** — Migration bestehender Rollen → siehe MVP-Backlog
**US-MVP-E2-05** — Owner-Profil bei Tenant-Erstellung → siehe MVP-Backlog
**US-MVP-E2-06** — User-Profil bei Signup → siehe MVP-Backlog

**Ergänzung zu US-MVP-E2-05:** Das Owner-Profil enthält zusätzlich `first_name` und `last_name` aus dem Onboarding-Wizard (Schritt 3). Bestehende `users`-Tabelle auf diese Felder prüfen und ggf. Migration ergänzen.

---

### Epic E3 — Mandantensicherheit (RLS)

> Vollständige AK: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md — Epic E3](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)

**US-MVP-E3-01** — `tenant_id` auf `courses` → siehe MVP-Backlog
**US-MVP-E3-02** — `tenant_id` auf `registrations` → siehe MVP-Backlog
**US-MVP-E3-03** — RLS: Tabelle `users` → siehe MVP-Backlog
**US-MVP-E3-04** — RLS: Tabelle `courses` → siehe MVP-Backlog
**US-MVP-E3-05** — RLS: Tabelle `registrations` → siehe MVP-Backlog
**US-MVP-E3-06** — Buchungs-/Kurs-RPCs absichern → siehe MVP-Backlog

---

### Epic E4 — Tenant-Kontext & Onboarding

> Vollständige AK für E4-01/02/03/08: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md — Epic E4](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)
> Erweiterungen: Landing Page (neu), Onboarding-Wizard ersetzt/erweitert E4-04 bis E4-07, AGB/Datenschutz-Platzhalter (neu)

**US-MVP-E4-01** — Host → Tenant (`slug`) auflösen → siehe MVP-Backlog
**US-MVP-E4-02** — Zentraler Tenant-Kontext in der App → siehe MVP-Backlog
**US-MVP-E4-03** — Session-Tenant vs. Host-Tenant abgleichen → siehe MVP-Backlog
**US-MVP-E4-08** — Lokale Entwicklung: Slug/Host simulieren → siehe MVP-Backlog

#### US-E4-LANDING-01 — Landing Page mit CTA (neu)

**Als** Interessent **möchte ich** eine übersichtliche Startseite sehen, **damit** ich verstehe was YogaFlow bietet und den Einstieg ins Onboarding finde.

**Akzeptanzkriterien**

- [ ] Route `/` auf dem Apex zeigt Landing Page (kein Tenant-Kontext erforderlich)
- [ ] Seite enthält: Erklärtext, Features, Preise und einen klar sichtbaren CTA-Button „Jetzt Studio anlegen"
- [ ] CTA-Button navigiert zu `/onboarding`
- [ ] Seite enthält Links zu `/legal/agb` und `/legal/datenschutz`
- [ ] Funktioniert ohne eingeloggte Session

#### US-E4-LEGAL-01 — Platzhalter-Seiten für AGB und Datenschutz (neu)

**Als** Team **möchten wir** vor Go-Live Platzhalter-Seiten für rechtliche Pflichtinformationen haben, **damit** die Checkbox im Onboarding-Wizard verlinkbar ist.

**Akzeptanzkriterien**

- [ ] Route `/legal/agb` vorhanden — enthält mindestens Überschrift und Platzhaltertext
- [ ] Route `/legal/datenschutz` vorhanden — enthält mindestens Überschrift und Platzhaltertext
- [ ] Beide Seiten ohne Tenant-Kontext erreichbar (kein Slug nötig)
- [ ] Vor Go-Live: Platzhaltertexte durch echte Inhalte ersetzen (separates Ticket)

#### US-E4-WIZARD-01 — Onboarding-Wizard: 5-Schritt-Flow (ersetzt/erweitert E4-04 und E4-05)

**Als** Interessent **möchte ich** durch einen geführten Wizard alle nötigen Informationen eingeben, **damit** ich mein Studio Schritt für Schritt anlegen kann ohne überfordert zu werden.

**Akzeptanzkriterien**

- [ ] Wizard liegt auf Route `/onboarding`; kein Tenant-Kontext erforderlich
- [ ] **Schritt 1 — Studio-Name:** Pflichtfeld; Eingabe → `tenants.name`
- [ ] **Schritt 2 — Studio-URL (Slug):**
  - Slug-Vorschlag wird automatisch aus Studio-Name generiert (lowercase, nur `[a-z0-9]`, Leerzeichen entfernen)
  - Slug ist editierbar
  - Live-Validierung: Format `[a-z0-9]`, Länge 3–30, reservierte Slugs (gemäß A6)
  - Echtzeit-Verfügbarkeitscheck gegen Datenbank (entprellt, min. 300ms Debounce)
  - Live-Vorschau der Ziel-URL: `<slug>.<basisdomain>`
  - Klare Fehlermeldungen je nach Fehlertyp (vergeben / nicht erlaubt / falsches Format / zu kurz / zu lang)
- [ ] **Schritt 3 — Vorname + Nachname:** beide Pflichtfelder → `users.first_name`, `users.last_name`
- [ ] **Schritt 4 — E-Mail + Passwort:** beide Pflichtfelder; Passwort-Anforderungen nach Supabase-Default
- [ ] **Schritt 5 — Zusammenfassung:**
  - Alle Eingaben zur Kontrolle angezeigt (Studio-Name, URL-Vorschau, Vor-/Nachname, E-Mail)
  - Pflicht-Checkbox: „Ich akzeptiere die [AGB](/legal/agb) und habe die [Datenschutzerklärung](/legal/datenschutz) gelesen."
  - „Studio anlegen"-Button deaktiviert bis Checkbox gecheckt
  - Button nach erstem Klick deaktiviert (verhindert Doppelsubmit)
- [ ] Navigation: Zurück-Button auf jedem Schritt außer Schritt 1; alle bisherigen Eingaben bleiben erhalten

#### US-E4-WIZARD-02 — Onboarding: atomarer Schreibpfad + Fehlerbehandlung (ersetzt/erweitert E4-06)

**Als** Interessent **möchte ich** dass mein Studio zuverlässig angelegt wird oder ich eine verständliche Fehlermeldung erhalte, **damit** ich nicht in einem halb-angelegten Zustand lande.

**Akzeptanzkriterien**

- [ ] **Ein einziger serverseitiger Schreibpfad** (RPC oder Edge Function) legt atomar an: `tenants`-Zeile, Auth-User, `public.users` mit `tenant_id`, Rolle `owner`, `first_name`, `last_name`
- [ ] Bei Fehler (Slug vergeben, Netzwerkfehler, sonstiger Serverfehler): Wizard bleibt auf Schritt 5; verständliche Fehlermeldung sichtbar; kein halb-angelegter Tenant ohne Owner (Rollback oder Kompensation)
- [ ] Doppelsubmit verhindert: Button nach Klick deaktiviert; Unique Constraint auf `slug` fängt Race Conditions ab
- [ ] E-Mail-Verifizierung ist in Supabase aktiviert; nach Submit → Supabase schickt Verifikationsmail automatisch
- [ ] Schreibpfad verletzt US-MVP-E3-06 nicht (`search_path` gesetzt, kein dauerhaftes RLS-Bypass-Muster)
- [ ] Fehler im Schreibpfad werden geloggt (Supabase Function Logs)

#### US-E4-WIZARD-03 — Onboarding: Bestätigungsseite + Verifikations-Redirect (ersetzt/erweitert E4-07)

**Als** neuer Owner **möchte ich** nach dem Absenden klare Anweisungen erhalten und nach E-Mail-Bestätigung direkt auf meinem Dashboard landen, **damit** ich ohne Umwege loslegen kann.

**Akzeptanzkriterien**

- [ ] Nach erfolgreichem Submit → Bestätigungsseite: „Wir haben dir eine E-Mail geschickt. Bitte bestätige deine Adresse, um dein Studio zu öffnen."
- [ ] Supabase Verifikations-Link in der Mail redirectet nach Klick zur Tenant-URL (nach Domain-Entscheidung in Supabase konfigurieren; im MVP/DEV: dokumentierter Umweg zulässig)
- [ ] Nach Klick auf Verifikationslink: Supabase erstellt Session automatisch; Redirect direkt zum Owner-Dashboard (`<slug>.<basisdomain>/dashboard`) — **kein** separater Login-Schritt
- [ ] Owner landet auf Dashboard mit leerem Stand (Ist-App-Funktionsumfang, mandantengetrennt)
- [ ] Manueller DEV-Test mit zwei Mandanten: Tenant angelegt, Owner kann Dashboard öffnen

---

### Epic E5 — Kurse & Buchung

> Vollständige AK: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md — Epic E5](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)

**US-MVP-E5-01** — Owner: neuen Kurs anlegen → siehe MVP-Backlog
**US-MVP-E5-02** — Owner: Kurse auflisten und bearbeiten → siehe MVP-Backlog
**US-MVP-E5-03** — Teilnehmer: Registrierung auf Tenant-Host → siehe MVP-Backlog
**US-MVP-E5-04** — Teilnehmer: Kursliste im Mandanten → siehe MVP-Backlog
**US-MVP-E5-05** — Teilnehmer: Kursdetail → siehe MVP-Backlog
**US-MVP-E5-06** — Teilnehmer: Anmeldung / Buchung (Fachregeln und Daten) → siehe MVP-Backlog
**US-MVP-E5-07** — Teilnehmer: Buchung technisch absichern (RPC / RLS) → siehe MVP-Backlog
**US-MVP-E5-08** — Owner: Anmeldungen zu Kursen einsehen → siehe MVP-Backlog

---

### Epic E6 — Rollenvergabe durch Owner (neu, jetzt MVP)

**Ziel:** Der Owner kann Rollen anderer User in seinem Tenant verwalten — hoch- und rückstufen. Die Owner-Rolle ist nicht übertragbar; der Owner kann seine eigene Rolle nicht ändern.

**Abhängigkeiten:** E1 (`tenants`), E2 (Rollenmodell, `users.role`), E3 (RLS auf `users`).

#### US-E6-01 — Owner: Nutzerliste mit aktuellen Rollen einsehen

**Als** Owner **möchte ich** alle Nutzer meines Studios mit ihrer aktuellen Rolle sehen, **damit** ich einen Überblick über mein Team habe.

**Akzeptanzkriterien**

- [ ] Dedizierte Seite „Nutzer verwalten" im Owner-Dashboard vorhanden und erreichbar
- [ ] Liste zeigt alle User des eigenen Tenants: Vorname, Nachname, E-Mail, Rolle
- [ ] Nur User des eigenen Tenants sichtbar (RLS E3 — keine User anderer Tenants)
- [ ] Owner selbst erscheint in der Liste, aber ohne Möglichkeit zur Rollenänderung (kein Dropdown für eigenen Account)

#### US-E6-02 — Owner: Rolle eines Nutzers ändern (hoch- und rückstufen)

**Als** Owner **möchte ich** einem Nutzer eine andere Rolle zuweisen oder entziehen, **damit** ich mein Team flexibel organisieren kann.

**Akzeptanzkriterien**

- [ ] Pro User (außer Owner selbst): Dropdown mit erlaubten Rollen (`user`, `teacher`, `admin`)
- [ ] Hoch- und Rückstufen möglich: z.B. `user → teacher`, `admin → user`, `teacher → admin`
- [ ] Rolle `owner` ist im Dropdown nicht wählbar — keine Owner-Übertragung möglich
- [ ] Eigene Rolle des Owners nicht änderbar (Dropdown deaktiviert oder nicht angezeigt)
- [ ] Änderung sofort serverseitig gespeichert; kurze Bestätigung in der UI
- [ ] RLS verhindert Rollenänderungen auf User anderer Tenants serverseitig
- [ ] Bestehende Migration `20260122180741_20260122_prevent_self_role_escalation.sql` prüfen — ggf. anpassen, damit Owner Rollen anderer User (nicht sich selbst) setzen darf
- [ ] **Tenant-Test (beobachtbar):** Owner A kann keine Rollen von Usern in Tenant B ändern

---

## Gesamt-Definition of Done

Das Epic ist abgeschlossen, wenn ein Team End-to-End zeigen kann:

1. **Landing Page:** Interessent besucht Apex, sieht Erklärtext/Features/Preise, klickt CTA „Jetzt Studio anlegen"
2. **Onboarding:** 5-Schritt-Wizard vollständig durchlaufen, AGB-Checkbox gecheckt, E-Mail bestätigt, direkt auf Owner-Dashboard gelandet
3. **Owner-Betrieb:** Kurse anlegen und bearbeiten; Nutzer verwalten und Rollen hoch-/rückstufen
4. **Teilnehmer-Betrieb:** Signup auf Tenant-Host, Kurse sehen, Kurs buchen, eigene Buchungen sehen
5. **Mandantentrennung mit zwei DEV-Tenants:** Keine Datenlecks, keine Cross-Tenant-Manipulationen möglich — inklusive mandantengehärteter Schreibpfade gemäß US-MVP-E3-06
6. **RLS aktiv:** Alle Policies auf `users`, `courses`, `registrations` greifen; keine Umgehung über RPCs möglich

---

## Infrastruktur-Checkliste (vor erstem PROD-Deploy)

| Schritt | Was | Status |
|---|---|---|
| 1 | Domain `omlify.de` zu Cloudflare hinzufügen (Add a Site) | [ ] |
| 2 | Nameserver bei IONOS auf Cloudflare umstellen | [ ] |
| 3 | Wildcard DNS in Cloudflare: CNAME `*` → Pages-URL, Proxy ein | [ ] |
| 4 | Custom Domains in Cloudflare Pages: `omlify.de` + `*.omlify.de` | [ ] |
| 5 | Supabase Auth Redirect-URLs: `https://omlify.de/**` + `https://*.omlify.de/**` | [ ] |
| 6 | Cloudflare Pages Env-Vars: Preview → DEV-Supabase-Keys; Production → PROD-Keys | [ ] |
| 7 | `VITE_APP_BASE_DOMAIN=omlify.de` in allen Umgebungen gesetzt | [ ] |

## Offene Punkte (vor Go-Live)

| Punkt | Wann | Wer |
|---|---|---|
| Passwort-Reset-Flow für Tenant-User (korrekte Tenant-URL in Reset-Mail) | Nach Infrastruktur-Setup | Entwicklung |
| AGB + Datenschutz-Texte (echte Inhalte statt Platzhalter) | Vor Go-Live | Julius + Partner |
