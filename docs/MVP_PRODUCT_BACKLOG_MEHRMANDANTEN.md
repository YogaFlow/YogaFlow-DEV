# Product Backlog: MVP Mehrmandantenmodell

Abgeleitet aus [MULTI_TENANT_PRODUCT_BACKLOG.md](MULTI_TENANT_PRODUCT_BACKLOG.md). Dieses Dokument **ersetzt** das Master-Backlog nicht; es definiert **nur** den minimalen Lieferumfang für ein **funktionsfähiges** Mehrmandanten-MVP.

## Leitprinzip: Ist-App als Funktionsbasis

Das MVP implementiert einen **minimalen Mehrmandanten-Mechanismus auf der bestehenden YogaFlow-App** in diesem Repository — nicht eine alternative Produktvision. Sobald ein Tenant angelegt ist und ein **owner** existiert (Onboarding gemäß Epic E4 in diesem Dokument), bilden die **bereits im Projekt vorhandenen** Funktionen die **fachliche Basis für diesen Mandanten**: im MVP konkret der schmale Pfad **Kurse + Teilnehmer-Anmeldung/Buchung**, mandantentrennend. Im **Schema** gelten die **vier Rollen** **owner**, **admin**, **teacher**, **user** (Epic E2); der MVP-Produktpfad konzentriert sich auf **owner** (Anbieter) und **user** (Teilnehmer) — **admin**/**teacher**-UI und Lehrer-Verwaltung (Master **E6**) sind für dieses MVP-Dokument **nicht** verpflichtend, sofern unten nicht anders genannt. Der **volle** Backlog erweitert dieselbe Logik auf den gesamten mandantenreifen Ist-Umfang (v. a. Epic E9 im Master-Backlog).

Das **End-Zielbild** (inkl. Branding, Custom Domain, mehrere Kursleiter im Studio usw.) bleibt im Master-Backlog festgehalten; der Abschnitt **Explizit außerhalb dieses MVP** unten benennt **bewusste Verzichte** für den ersten Liefercut — **kein** Bruch mit der gemeinsamen Produktlinie.

## MVP-Produktziel (verbindlich)

**Anbieter** (z. B. Studio oder einzelner Lehrer) kann:

- eine **Plattform** (Tenant) anlegen — **ohne** gespeicherte Tenant-Typunterscheidung im Datenmodell (siehe Epic E1),
- einen **owner**-Account nutzen,
- **Kurse** anlegen,
- **Teilnehmer** (technische Rolle **user**, siehe Epic E2) können sich **anmelden**,
- alle Daten sind **strikt mandantentrennt**.

## Explizit außerhalb dieses MVP

Die folgenden Punkte sind für **dieses MVP** nicht in Scope; sie gehören weiterhin zum **vollen** Mehrmandanten-Zielbild im Master-Backlog und sind hier **Zeit- und Scope-Kürzungen**, keine abweichende Produktstrategie:

Keine Custom Domains, kein Branding, kein Einstellungs-System, keine Bestands-/PROD-Migrations-Epics, keine erweiterten Security-/Performance-Programme, keine Nachrichten/Wartelisten, sofern nicht bereits durch bestehende App für den schmalen Kurs+Anmeldung-Pfad zwingend erforderlich. **Keine** verpflichtende UI für **Rollenvergabe durch owner** (Admin/Lehrer zuweisen; Master-Backlog E6), **keine** verpflichtenden **admin**-/**teacher**-Nutzungsflows über den schmalen owner+**user**-Pfad hinaus — das **Datenmodell** der vier Rollen kommt aus Epic E2 und bleibt mit [MULTI_TENANT_PRODUCT_BACKLOG.md](MULTI_TENANT_PRODUCT_BACKLOG.md) abgestimmt.

## Epics (Übersicht)

| ID | Titel |
|----|--------|
| E1 | Tenant & Datenmodell |
| E2 | Nutzer & Tenant-Zuordnung |
| E3 | Mandantensicherheit (RLS) |
| E4 | Tenant-Kontext & Onboarding |
| E5 | Kurse & Buchung |

---

## Epic E1 – Tenant & Datenmodell

**Ziel:** Es gibt eine minimale, persistente **Tenant**-Entität (`tenants`), über die alle mandantenbezogenen Daten später verknüpfbar sind. Fokus: **technische Identität** (`slug`), **Anzeigename** (`name`), Zeitstempel — ohne Domain-, Branding- oder Einstellungs-Logik. **Kein** Feld für Tenant-Arten (z. B. Studio vs. Lehrer); jeder Tenant ist fachlich dasselbe Modell (**implizit ein Studio** im MVP-Sinne).

**Abhängigkeiten:** Keine.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________
- **Slug nach Anlage:** Im MVP **nicht änderbar** (Produktregel). Optional **zusätzlich** technisch absichern (z. B. Trigger), siehe Umsetzung — in den AK als Leitplanke verankert.

**Explizit nicht Bestandteil von E1:** Rollen (**owner**, **admin**, **teacher**, **user** — siehe Epic E2), User-Zuordnung zu Tenant, RLS, App-Logik, Berechtigungen.

### User Story US-MVP-E1-01 – Tabelle `tenants` mit definierten Mindestfeldern

**Als** Produkt **möchten wir** eine zentrale Tabelle `tenants` mit klarem Mindestschema anlegen, **damit** Studios stabil gespeichert, eindeutig identifiziert und technisch referenziert werden können.

**Akzeptanzkriterien**

- [ ] Migration unter `supabase/migrations/`; **idempotent** wo sinnvoll (Migration mehrfach ausführbar); **versioniert und reproduzierbar**; **kein** Table Editor als Hauptquelle der Wahrheit.
- [ ] Migration enthält **nur Schema**; **keine** fachlichen Datenänderungen (kein INSERT/UPDATE/DELETE auf Bestandsdaten).
- [ ] Zentrale Entität **`tenants`**; Primärschlüssel **`id`** (`uuid`), automatisch generiert (z. B. `gen_random_uuid()`), eindeutig adressierbar.
- [ ] Verpflichtende Mindestfelder: **`id`**, **`name`**, **`slug`**, **`created_at`**, **`updated_at`**.
- [ ] **`name`:** `NOT NULL`; keine leeren Werte (z. B. `CHECK (name <> '')`).
- [ ] **`slug`:** `NOT NULL`; **systemweit eindeutig** (Unique-Constraint); nur **lowercase**; nur Zeichen **`[a-z0-9]`** (keine Leerzeichen, keine Sonderzeichen); ungültige Werte werden abgelehnt; **im MVP nicht änderbar** (kein Änderungsflow; optional DB-seitig mitabsichern).
- [ ] **`created_at`:** Default `now()`, `NOT NULL` — nach Projektkonvention sinnvoll **`timestamptz`**.
- [ ] **`updated_at`:** Default `now()`, `NOT NULL` — ebenfalls **`timestamptz`**; optional Angleichung an bestehende **`updated_at`-Trigger** im Repo (z. B. `update_updated_at_column()`), falls das Team Konsistenz mit `users`/`courses` will.
- [ ] **Keine Tenant-Typen im Datenmodell:** kein Feld `type` / `tenant_type` o. ä.; keine Validierungslogik für Typen.

### User Story US-MVP-E1-02 – Migration ausführen und Schema prüfen

**Als** Team **möchten wir** die Migration ausführen und prüfen, **damit** das Schema stabil und reproduzierbar ist.

**Akzeptanzkriterien**

- [ ] Migration liegt im **Repository**.
- [ ] Migration wird über den **Teamworkflow** ausgeführt: **lokal**, **DEV-Projekt** (verlinkt); Dokumentation beachtet: [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md), [PRE_START_CHECK.md](PRE_START_CHECK.md).
- [ ] **Smoke-Test:** Tabelle `tenants` existiert; Felder **`id`**, **`name`**, **`slug`**, **`created_at`**, **`updated_at`** vorhanden.
- [ ] **Constraints geprüft:** Primärschlüssel auf **`id`**; **Unique** auf **`slug`**.
- [ ] **Negative Fälle:** INSERT mit leerem `name` schlägt fehl; INSERT mit doppeltem `slug` schlägt fehl; INSERT mit ungültigem `slug` schlägt fehl (z. B. `My Studio!`).
- [ ] **Positiver Fall:** INSERT mit gültigem Datensatz erfolgreich (z. B. `name` = `Studio Berlin`, `slug` = `studioberlin`).
- [ ] Hinweis fürs Team: Ohne RLS können manuelle SQL-Checks je nach Rolle (**Service Role** / SQL-Editor) nötig sein — erwartbar bis Epic E3.

### Epic E1 – Definition of Done (Epic-Ebene)

E1 ist erledigt, wenn **US-MVP-E1-01** und **US-MVP-E1-02** erfüllt sind, die **Migration(en)** im Repository liegen und das Schema **reproduzierbar** aufgebaut werden kann (alles als Migration gespeichert). **RLS und App-Logik** sind nicht Teil des Epic-Abschlusses.

---

## Epic E2 – Nutzer & Tenant-Zuordnung

**Ziel:** Jeder Datensatz in `public.users` gehört **genau einem** Tenant (`tenant_id`). Zusätzlich existiert ein **einheitliches Rollenmodell** mit vier Werten: **owner**, **admin**, **teacher**, **user**. Neue Nutzer erhalten standardmäßig die Rolle **user**; höhere Rollen vergibt der **owner** (UI/API dafür **nicht** Teil von E2 — siehe Master-Backlog E6 und Abschnitt „Explizit außerhalb dieses MVP“ oben).

**Grundregeln (Epic-weite Constraints)**

- Jeder User gehört **genau einem** Tenant; **keine** Mehrfachzuordnung zu mehreren Tenants.
- **Keine** mandantenübergreifenden Accounts; **keine** automatische Aktivierung einer Session über mehrere Tenants (Details **Epic E4**).
- **E-Mail** darf in **verschiedenen** Tenants mehrfach vorkommen; **innerhalb eines Tenants** ist sie **eindeutig**.

**Abhängigkeiten:** Epic E1 (`tenants` existiert).

**Explizit nicht Bestandteil von E2:** Rollenvergabe durch **owner** (UI/API), **RLS**, Berechtigungslogik, allgemeine App-Logik jenseits der genannten Profil-/Signup-Anbindung.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________

### User Story US-MVP-E2-01 – `tenant_id` auf `users` mit Fremdschlüssel

**Als** Team **möchten wir** jede User-Profilzeile genau einem Tenant zuordnen, **damit** der Mandantenkontext systemweit eindeutig ableitbar ist.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` (`uuid`) auf `users` vorhanden; **NOT NULL**; jeder User hat genau einen Tenant.
- [ ] Fremdschlüssel `REFERENCES tenants(id)`; ON DELETE nach Teamentscheid (im PR beschrieben).
- [ ] Index auf `tenant_id` für Standard-Queries.
- [ ] **Keine Backfill-Logik erforderlich**, sofern keine produktiven Bestandsdaten betroffen sind; bestehende DEV-/Testaccounts dürfen im Rahmen der Umstellung gelöscht und bei Bedarf neu angelegt werden.

### User Story US-MVP-E2-02 – E-Mail-Eindeutigkeit pro Tenant

**Als** Produkt **möchten wir** innerhalb eines Tenants keine doppelte E-Mail, **damit** Accounts fachlich eindeutig sind.

**Akzeptanzkriterien**

- [ ] Unique Constraint auf `(tenant_id, email)` (bzw. genutzte E-Mail-Spalte).
- [ ] Registrierung mit doppelter E-Mail **im selben** Tenant: **klare** Fehlermeldung (UI/API).

### User Story US-MVP-E2-03 – Rollenmodell: owner, admin, teacher, user

**Als** Produkt **möchten wir** ein einheitliches Rollenmodell definieren, **damit** App und RLS dieselbe Grundlage nutzen.

**Akzeptanzkriterien**

- [ ] Zentrale Speicherung der Rolle (z. B. `role`-Spalte oder Enum + Spalte); **genau eine** Rolle pro User.
- [ ] Erlaubte Werte: **owner**, **admin**, **teacher**, **user**.
- [ ] Default bei Registrierung: **user**.
- [ ] Semantik (MVP): **owner** → Plattform-Inhaber (volle Kontrolle); **admin** → verwaltet Inhalte und Nutzer (kein Ownership); **teacher** → erstellt/verwaltet Kurse; **user** → normaler Teilnehmer.

### User Story US-MVP-E2-04 – Migration bestehender Rollen

**Als** Team **möchten wir** bestehende Rollen aus dem Ist-System konsolidieren, **damit** es nur **eine** eindeutige Rollenquelle gibt.

**Akzeptanzkriterien**

- [ ] Migrationslogik definiert; **Beispiel-Mapping:** Admin → **admin**, Lehrer → **teacher**, Teilnehmer → **user**; bei Unklarheit **fallback = user** (im PR festhalten).
- [ ] Nach Migration: alte Rollenfelder entfernt oder **nicht mehr genutzt**; **keine** doppelte Rollenlogik.

### User Story US-MVP-E2-05 – Owner-Profil bei Tenant-Erstellung

**Als** Team **möchten wir** bei Erstellung eines Tenants ein korrektes **owner**-Profil erzeugen, **damit** der Tenant sofort nutzbar ist.

**Akzeptanzkriterien**

- [ ] Neuer **owner** erhält: `tenant_id` des neu erstellten Tenants; Rolle **owner**.
- [ ] Umsetzung über Trigger, **RPC** oder bestehendes Auth-Muster.
- [ ] **DEV-Test:** User-Profil stimmt mit Tenant überein.

### User Story US-MVP-E2-06 – User-Profil bei Signup

**Als** Team **möchten wir** neue Nutzer mit Rolle **user** (fachlich: **Teilnehmer**) beim Signup korrekt zuordnen, **damit** sie im richtigen Tenant agieren.

**Akzeptanzkriterien**

- [ ] Signup erfolgt im Tenant-Kontext (z. B. Host/URL → Tenant); neuer Nutzer erhält `tenant_id` aus dem aktuellen Tenant und Rolle **user** (fachlich: Teilnehmer).
- [ ] **DEV-Test:** Profil entspricht dem Host-Tenant.

### Epic E2 – Definition of Done (Epic-Ebene)

E2 ist erledigt, wenn **alle** User Stories US-MVP-E2-01 bis US-MVP-E2-06 erfüllt sind, **jeder** User genau einem Tenant zugeordnet ist, Rollen **eindeutig und konsistent** gespeichert sind, die Default-Rolle **user** korrekt vergeben wird und **keine** parallele Rollen- oder Tenant-Logik aus Alt-Feldern verbleibt. **RLS** folgt in E3.

---

## Epic E3 – Mandantensicherheit (RLS)

**Ziel:** Für **`users`**, **`courses`** und **`registrations`** gilt RLS (Row Level Security): Zugriff nur innerhalb des eigenen Tenants.

**Abhängigkeiten:** Epic E1, Epic E2.

**Explizit nicht Bestandteil von E3:** Feingranulare Berechtigungen innerhalb eines Tenants über das MVP hinaus, UI-/Frontend-Logik, komplexe Rollenrechte über das MVP hinaus.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________

### User Story US-MVP-E3-01 – `tenant_id` auf `courses`

**Als** Team **möchten wir** jeden Kurs einem Tenant zuordnen, **damit** Policies (Regeln in der Datenbank) ohne Join-Ketten auskommen.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` auf `courses`, falls nicht vorhanden; `tenant_id` muss zu einem existierenden Tenant gehören (FK zu `tenants` wo passend).
- [ ] `tenant_id` ist **NOT NULL**.
- [ ] Index auf `tenant_id` vorhanden.
- [ ] **Keine Backfill-Logik erforderlich**; bestehende DEV-Daten dürfen gelöscht und neu angelegt werden.

### User Story US-MVP-E3-02 – `tenant_id` auf `registrations`

**Als** Team **möchten wir** Kurs-Anmeldungen demselben Tenant zuordnen wie der zugehörige Kurs, **damit** RLS einheitlich filtert.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` auf `registrations`, falls nicht vorhanden; Verweis auf existierenden Tenant (FK wo passend).
- [ ] `tenant_id` ist **NOT NULL**; Index auf `tenant_id` vorhanden.
- [ ] `registrations.tenant_id` entspricht dem `tenant_id` des referenzierten `courses`-Datensatzes; die Registrierung gehört zum selben Tenant wie der zugehörige User (falls vorhanden).
- [ ] Konsistenz wird sichergestellt über **Constraint** und/oder **Trigger** (z. B. Prüfung „`registration.tenant_id` = `course.tenant_id`?“).
- [ ] **Keine Backfill-Logik erforderlich**; bestehende DEV-Daten dürfen gelöscht und neu angelegt werden.

### User Story US-MVP-E3-03 – RLS: Tabelle `users`

**Als** Produkt **möchten wir** Nutzerdaten mandantenbasiert absichern, **damit** keine fremden Profile sichtbar sind.

**Akzeptanzkriterien**

- [ ] RLS auf `users` aktiviert; Zugriff nur auf Datensätze mit `tenant_id` = aktuellem Tenant (Ableitung aus dem Profil zu `auth.uid()` nach Team-Muster).
- [ ] **Rechte im MVP — owner:** darf alle User im eigenen Tenant **lesen** und User im eigenen Tenant **aktualisieren**; kein Zugriff auf User anderer Tenants.
- [ ] **Rechte im MVP — admin:** darf alle User im eigenen Tenant **lesen**; kein Zugriff auf andere Tenants.
- [ ] **Rechte im MVP — teacher:** kein Zugriff auf fremde User; Zugriff nur auf **eigenes** Profil.
- [ ] **Rechte im MVP — user:** darf nur **eigenes** Profil lesen und bearbeiten; kein Zugriff auf andere User.
- [ ] Policies migrationsfreundlich (`DROP POLICY IF EXISTS` …) nach Repo-Konvention.

### User Story US-MVP-E3-04 – RLS: Tabelle `courses`

**Als** Produkt **möchten wir** Kurse nur im eigenen Mandanten sehen und verwalten können, **damit** Daten nicht zwischen Mandanten wechseln.

**Akzeptanzkriterien**

- [ ] RLS auf `courses` aktiviert; Zugriff nur auf Kurse mit `tenant_id` = aktuellem Tenant.
- [ ] **Rechte im MVP — owner:** CRUD (Create, Read, Update, Delete) auf Kurse im eigenen Tenant.
- [ ] **Rechte im MVP — admin:** CRUD auf Kurse im eigenen Tenant.
- [ ] **Rechte im MVP — teacher:** darf Kurse im eigenen Tenant **erstellen** und **bearbeiten**; darf **eigene oder zugewiesene** Kurse **lesen** (Semantik „zugewiesen“ nach Ist-Modell im PR festhalten).
- [ ] **Rechte im MVP — user:** darf Kurse im eigenen Tenant **lesen**; **keine** Bearbeitung.
- [ ] Kein Zugriff auf Kurse anderer Tenants möglich.

### User Story US-MVP-E3-05 – RLS: Tabelle `registrations`

**Als** Produkt **möchten wir** Anmeldungen mandantenbasiert absichern, **damit** Teilnehmerlisten nicht durchleaken.

**Akzeptanzkriterien**

- [ ] RLS auf `registrations` aktiviert; Zugriff nur auf Datensätze mit `tenant_id` = aktuellem Tenant.
- [ ] **Rechte im MVP — owner:** sieht alle Registrierungen im eigenen Tenant.
- [ ] **Rechte im MVP — admin:** sieht alle Registrierungen im eigenen Tenant.
- [ ] **Rechte im MVP — teacher:** sieht Registrierungen für Kurse im eigenen Tenant.
- [ ] **Rechte im MVP — user:** sieht nur **eigene** Registrierungen.
- [ ] Kein Zugriff auf Registrierungen anderer Tenants möglich.

### User Story US-MVP-E3-06 – Buchungs-/Kurs-RPCs absichern

**Als** Team **möchten wir** Funktionen absichern, **damit** RLS nicht umgangen werden kann.

**Akzeptanzkriterien**

- [ ] Jede betroffene Funktion prüft: Nutzer gehört zum **selben** Tenant wie die betroffenen Daten (`tenant_id`-Abgleich).
- [ ] `search_path` ist gesetzt (insb. bei `SECURITY DEFINER`).
- [ ] Keine Umgehung von RLS über Funktionen möglich (oder Funktion wird für MVP entfernt/ersetzt).

### Epic E3 – Definition of Done (Epic-Ebene)

E3 ist erledigt, wenn **alle** User Stories US-MVP-E3-01 bis US-MVP-E3-06 erfüllt sind, RLS auf allen genannten Tabellen aktiv ist, der Zugriff **ausschließlich** tenant-basiert erfolgt und **keine** Umgehung über Funktionen möglich ist. **Weitere Tabellen** (z. B. Nachrichten) sind **nicht** MVP-Pflicht.

---

## Epic E4 – Tenant-Kontext & Onboarding

**Ziel:** Die Web-App löst den **Tenant** aus dem **Host** (MVP: z. B. Subdomain = Slug), hält den Kontext zentral und erlaubt **neuen Tenant + Owner** ohne Branding, Custom Domain oder Einstellungen. Slug-Regeln in der UI stimmen mit dem **reproduzierbaren** Datenbank-Schema aus Epic E1 überein (kein reines Client-Only-Verhalten ohne nachvollziehbare Server-Fehler bei Verstößen). Session- und Host-Tenant-Logik setzt die **Grundregeln** aus Epic E2 voraus (kein mandantenübergreifender Account, kein stiller Wechsel des Mandanten über Hosts hinweg).

**Abhängigkeiten:** Epic **E1** (`tenants`, reproduzierbares Schema), Epic **E2** (Profil, `tenant_id`, Rollen), Epic **E3** (RLS auf `users`/`courses`/`registrations` sowie **US-MVP-E3-06** für gesicherte Schreibpfade — keine RLS-Umgehung beim Onboarding).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Basis-Host / Slug: Subdomain aus Host gemäß **US-MVP-E4-01**; Basisdomain per Vite-ENV (Vorschlag: `VITE_APP_BASE_DOMAIN`, finaler Name: _________________). Lokal: `?tenant=`-Override gemäß **US-MVP-E4-08**.
- Technik Tenant + Owner: **eine** zentrale **RPC oder Edge Function** gemäß **US-MVP-E4-06** (kein verteilter Client-Flow); konkrete Wahl im Repo: _________________

### User Story US-MVP-E4-01 – Host → Tenant (`slug`) auflösen

**Als** Nutzer **möchte ich** die App unter der Adresse **meines** Mandanten öffnen und korrekt zugeordnet werden, **damit** ich nicht auf dem falschen Mandanten lande.

**Akzeptanzkriterien**

- [ ] **Parsing (MVP, ohne Custom Domain):** Aus `window.location.hostname` (Host **ohne** Port; Port z. B. bei `localhost:5173` gehört nicht zum Slug) wird der **Tenant-Slug** abgeleitet, wenn der Host mit der konfigurierten **Basisdomain** endet (Beispiel: Host `studio1.app.example`, Basisdomain `app.example` → Slug `studio1`). Basisdomain aus Vite-ENV (Team legt einen Namen fest, z. B. `VITE_APP_BASE_DOMAIN`); **kein** reiner Produktions-Hardcode.
- [ ] **Genau eine Subdomain-Ebene:** Gültig ist nur das Muster `<tenantSlug>.<basisdomain>`. Hosts mit **mehreren** Labels vor der Basisdomain (z. B. `www.studio1.app.example`, `api.studio1.app.example`) sind im MVP **ungültig** — klarer Fehler/Blockade, **kein** Erraten des Slugs aus tieferliegenden Ebenen. (Optional später: dokumentiertes Entfernen einzelner Präfixe wie `www.` — im MVP nicht vorausgesetzt.)
- [ ] **Apex / ohne Subdomain-Slug:** kein stiller Default-Tenant; klare Fehlermeldung oder Blockade wie bei unbekanntem Slug.
- [ ] **DEV-Override:** Wenn in **US-MVP-E4-08** dokumentiert, hat `?tenant=<slug>` **Vorrang** vor Subdomain-Parsing (nur Entwicklung/Preview); in **Production** wird kein Tenant per Query-Parameter akzeptiert (kein Spoofing).
- [ ] Unbekannter Slug / kein Treffer in `tenants`: keine stillschweigende Zuordnung zu einem Default-Tenant; Nutzer sieht eine klare Fehlermeldung oder Blockade.

### User Story US-MVP-E4-02 – Zentraler Tenant-Kontext in der App

**Als** Entwicklungsteam **möchten wir** einen **einheitlichen** Tenant-Kontext (z. B. React Context + Hook), **damit** Seiten dieselbe `tenant_id` nutzen.

**Akzeptanzkriterien**

- [ ] Hook/Context liefert `tenantId`, Lade- und Fehlerzustand sowie Anzeigename für die UI.
- [ ] Loading-UI bis der Kontext steht; Fehlerfall konsistent zu US-MVP-E4-01.
- [ ] Optional (Performance): erfolgreich aufgelöster Tenant darf **kurzzeitig im Provider** gehalten werden. **Neuauflösung / Invalidierung:** sobald sich `window.location.hostname` gegenüber dem zuletzt für die Auflösung genutzten Wert **ändert** (Hard-Reload, Navigation auf anderen Host, Link mit anderem Host). Reine **Client-Router**-Wechsel **ohne** Hoständerung lösen **keine** erzwungene Neuauflösung aus dem Host allein aus (Tenant kommt dann weiterhin vom gleichen Host / gleichem `?tenant=` Override gemäß E4-08). Mandantenschutz bleibt bei **RLS** (E3); der Cache ersetzt **keine** Zugriffskontrolle.

### User Story US-MVP-E4-03 – Session-Tenant vs. Host-Tenant abgleichen

**Als** Produkt **möchten wir** verhindern, dass eine Session für **Mandant B** auf dem Host von **Mandant A** genutzt wird.

**Akzeptanzkriterien**

- [ ] Abgleich **erst**, wenn gleichzeitig: Host-Tenant-Kontext **ready** (nicht mehr im Ladezustand), **Session** vorhanden, und **Profil** des eingeloggten Users **geladen** ist (`users.tenant_id` bekannt). **Kein** Abmelden bei „Profil lädt noch“ (vermeidet Race nach Signup/Redirect).
- [ ] Auf dokumentierten **öffentlichen** Routen gemäß **US-MVP-E4-04** kein erzwungener Mismatch-Logout.
- [ ] Wenn nach obigen Bedingungen Profil-`tenant_id` und Host-Tenant abweichen → Abmelden und kurzer Hinweis (Link zum richtigen Host optional, nicht zwingend perfektes Deep-Linking).
- [ ] Einmal mit zwei DEV-Mandanten geprüft.

### User Story US-MVP-E4-04 – Onboarding: öffentlicher Einstieg zur Mandanten-Registrierung

**Als** Interessent **möchte ich** ohne bestehenden Tenant-Kontakt eine Seite öffnen und die Registrierung eines neuen Mandanten starten, **damit** ich ein Konto und einen Tenant anlegen kann.

**Akzeptanzkriterien**

- [ ] Route(n) **ohne** vorherigen Tenant-Kontext nutzbar (wie im Projekt vereinbart, z. B. separater Pfad auf gleichem Host).
- [ ] **Kein** gespeichertes Tenant-Typ-Feld (kein `tenant_type` / keine Typwahl, die ins Schema schreibt); konsistent mit Epic E1.
- [ ] Kein Branding, keine Custom Domain.

### User Story US-MVP-E4-05 – Onboarding: Formular Name und Slug

**Als** Interessent **möchte ich** Anzeigenamen und Slug eingeben, **damit** meine Plattform erreichbar und benannt ist.

**Akzeptanzkriterien**

- [ ] Felder: **Name** + **Slug** mit einfacher Client-Validierung (**lowercase**, nur **`[a-z0-9]`**, Länge nach Team-Vorgabe — konsistent mit E1).
- [ ] Slug vergeben: verständliche Fehlermeldung; kein stilles Überschreiben.

### User Story US-MVP-E4-06 – Onboarding: Tenant, Auth und Owner-Profil anlegen

**Als** Interessent **möchte ich** mich registrieren und **einen** neuen Tenant mit Owner-Konto erhalten, **damit** ich direkt starten kann.

**Akzeptanzkriterien**

- [ ] **Ein einziger serverseitiger Schreibpfad** (zentrale **RPC oder Edge Function**), nicht mehrere nacheinander feuernde Client-Schritte auf `tenants` / Auth / `public.users`. Er legt **logisch atomar** mit **Rollback oder Kompensation** an: Zeile `tenants`, Auth-User, `public.users` mit `tenant_id` und Rolle **owner**. Eine einzige SQL-Transaktion über `auth` und `public` ist nicht zwingend, aber bei Fehler kein nutzbarer MVP-Endzustand „Tenant ohne Owner“ (Rollback, Kompensation oder bereinigbarer Fehler dokumentiert).
- [ ] **Doppelte Ausführung / Retries:** Schreibpfad ist gegen parallele oder wiederholte Anfragen abgesichert (mindestens **Unique Constraint** auf `tenants.slug` gemäß E1 plus verständliche Fehlerbehandlung; zusätzlich sinnvoll: UI einmaliges Absenden, Idempotenz- oder Korrelationskonzept wo technisch möglich). Keine stillen zweiten Tenants bei Doppelklick oder Netzwerk-Retry.
- [ ] Der Schreibpfad erfüllt **US-MVP-E2-05** (Owner-Profil zum neuen Tenant) und **verletzt US-MVP-E3-06 nicht** (verwendete RPCs/Trigger prüfen Mandantenübereinstimmung, `search_path` gesetzt — kein Muster, das RLS dauerhaft umgeht).
- [ ] Keine zusätzlichen Pflichtfelder außerhalb MVP (kein Logo, keine Farben).
- [ ] Optional: Fehler im serverseitigen Onboarding-Schreibpfad werden geloggt (z. B. Supabase Edge-/Function-Logs), um Produktions-Debugging zu erleichtern.

### User Story US-MVP-E4-07 – Onboarding: Redirect zur Tenant-URL

**Als** neuer Owner **möchte ich** nach dem Setup auf **meiner** Mandanten-URL landen, **damit** ich dort einloggen und arbeiten kann.

**Akzeptanzkriterien**

- [ ] Erfolgsfall: Navigation zur Tenant-URL (Subdomain/Host-Konzept des Projekts); lokal dokumentierter Umweg zulässig.
- [ ] **Redirect-Timing:** Wechsel zur Mandanten-URL erst, wenn die **Auth-Session** nach dem Setup **bestätigt** vorliegt (z. B. Supabase-Session etabliert); kein Redirect in einen Zustand, in dem der Nutzer auf dem Ziel-Host ohne gültige Session oder ohne nachvollziehbaren nächsten Schritt landet. Wo der Ziel-Host wieder Tenant-Kontext aus dem Host braucht: Tenant-Auflösung dort gemäß E4-01/E4-02 berücksichtigen (kein Race mit E4-03).
- [ ] Kurzer manueller Durchlauf auf DEV: Tenant da, Owner kann sich anmelden.

### User Story US-MVP-E4-08 – Lokale Entwicklung: Slug/Host simulieren

**Als** Entwickler **möchte ich** **lokal** zwei Mandanten unterscheiden können, **damit** Multi-Tenant ohne produktionsnahes DNS testbar ist.

**Akzeptanzkriterien**

- [ ] **Festgelegte MVP-Dev-Methode:** Query-Parameter `?tenant=<slug>` als **Tenant-Override** (nur `import.meta.env.DEV` oder **explizit** dokumentierte Preview/Staging-Umgebung — **niemals** in Production auswerten; verhindert Cross-Tenant-Spoofing). Preview/Staging entweder wie DEV behandeln oder in einem Satz abweichend festhalten.
- [ ] Kurz im [README.md](../README.md) (Abschnitt „Lokale Entwicklung“) oder gleichwertig verlinktem Dev-Doc beschrieben.

### Epic E4 – Definition of Done (Epic-Ebene)

E4 ist erledigt, wenn US-MVP-E4-01 bis US-MVP-E4-08 auf **DEV** mit mindestens **zwei** Mandanten durchspielbar sind.

---

## Epic E5 – Kurse & Buchung

**Benennung in diesem Epic:** In Berechtigungen und Datenmodell gilt die Rolle **`user`** (Epic E2, **US-MVP-E2-03**). **Teilnehmer** ist die **fachliche/UI-Bezeichnung** für Accounts mit dieser Rolle. Technische Namen in der DB (z. B. `user_id`) bleiben unverändert.

**Ziel — Produktpfad:** Im MVP legt der **owner** über die App **Kurse** für **seinen** Mandanten an. Nutzer mit Rolle **`user`** (**Teilnehmer**) sehen das Angebot im Mandanten und können sich **anmelden** — strikt tenant-lokal im UI.

**Ziel — Mandantenschutz:** Kurs- und Anmeldedaten sind über **Tenant-Kontext** (Epic E4) und **RLS** (Epic E3) nur im eigenen Mandanten sichtbar und schreibbar; mandantenfremde Zugriffe schlagen fehl.

**Nicht-Ziel — UI für weitere Rollen:** Pflicht-UI für **admin** oder **teacher** gibt es in diesem MVP nicht. Deren Zugriff auf `courses` / `registrations` regelt ausschließlich Epic E3 (**US-MVP-E3-04**, **US-MVP-E3-05**); dieses Epic wiederholt keine Rollenmatrix.

**Abhängigkeiten:** Epic **E1** (Tenant-Referenz), Epic **E2** (Nutzer- und Rollenmodell), Epic **E3** (`tenant_id` auf `courses`/`registrations`, RLS, **US-MVP-E3-06**), Epic **E4** (Tenant-Kontext aus Host).

**Team-Notizen (bei Umsetzung ausfüllen):**

- **Ist-Schema (Orientierung):** `courses` u. a. `title`, `description`, `date`, `time`, `location`, `max_participants`, `price`, `teacher_id`; Erweiterungen z. B. `status`, `duration`, `room`, `prerequisites`, `frequency`, `series_id`, `end_time` — finale Pflichtfelder gegen Migrationen im Repo prüfen.
- **Buchungslogik:** serverseitige Funktionen im Repo (z. B. `register_for_course`); nach Multi-Tenant-Umbau mit `tenant_id`-Konsistenz und **US-MVP-E3-06**.

### User Story US-MVP-E5-01 – Owner: neuen Kurs anlegen

**Als** Owner **möchte ich** einen Kurs anlegen, **damit** Teilnehmer (Rolle **`user`**) ihn später buchen können.

*Hinweis:* Die Story bündelt mehrere Aspekte (Felder, Sichtbarkeit, Mandantenschutz). Unterblöcke dienen der Lesbarkeit; bei Bedarf kann das Team die AK-Gruppen in der Umsetzung auf Tickets splitten.

**Akzeptanzkriterien — Kursdaten (Formular / Schema)**

- [ ] **MVP-Mindestinhalt** orientiert an `courses` im Repo: alle Felder, die das Schema als **`NOT NULL`** verlangt, sind im Anlegeformular **Pflicht** (typisch u. a. **Titel**, **Beschreibung**, **Datum**, **Uhrzeit**, **Ort**, **max. Teilnehmer** mit `max_participants` > 0, **Preis** ≥ 0 — exakte Liste im PR gegen Migrationen prüfen).
- [ ] **`teacher_id` (FK auf `users.id` im Ist-Schema):** **Pflicht nur**, wenn die Migrationen `teacher_id` **nicht optional** definieren; ist die Spalte optional, bleibt sie im MVP **optional** (kein künstliches Nachpflichten). **Fachliche MVP-Regel:** der gewählte Datensatz liegt in **`users` desselben Tenants** wie der Kurs; **keine** neue MVP-Pflicht, dass dieser User die Rolle **`teacher`** hat (kein Lehrer-Onboarding-Epic) — üblich ist z. B. **`owner`** als `teacher_id`. **Keine** zusätzliche Rollenvalidierung auf dem FK im MVP, **es sei denn**, das Team entscheidet das ausdrücklich im PR (dann dokumentieren). So bleibt die Zuordnung **technisch** (Schema) und **tenant-sicher**, ohne Schein-„Lehrer-Produkt“.

**Akzeptanzkriterien — Sichtbarkeit für Teilnehmer**

- [ ] Nach erfolgreichem Anlegen ist der Kurs für Teilnehmer (Rolle **`user`**) im **selben Tenant** in **Kursliste** und **Kursdetail** sichtbar — **sofern** kein Schema- oder Filterfeld (z. B. `courses.status`) das verhindert; gibt es einen solchen Zwang, sind Produktregel und UI im PR dokumentiert. **Kein** zusätzlicher **Draft-/Publish-Workflow** im MVP, wenn das Schema ihn nicht erzwingt.

**Akzeptanzkriterien — Mandantenschutz und Rechte**

- [ ] **MVP-UI:** Anlegen im Produktpfad als **owner**; neuer Kurs hat `tenant_id` des aktuellen Mandanten (**US-MVP-E3-01**). Weitere Schreibberechtigungen auf `courses` nur gemäß **US-MVP-E3-04** (ohne zusätzliche UI-Pflicht hier).
- [ ] **Tenant-Tests (beobachtbar):** Zwei Mandanten auf DEV: im Anlegeflow von A keine Kursdaten von B; manipulierter Anlege-Request mit fremder `tenant_id` erzeugt **keinen** Kurs in fremdem Tenant (Server lehnt ab oder setzt Kontext-Tenant durch).

### User Story US-MVP-E5-02 – Owner: Kurse auflisten und bearbeiten

**Als** Owner **möchte ich** meine Kurse sehen und gezielt bearbeiten, **damit** ich Angebote pflegen kann.

**Akzeptanzkriterien**

- [ ] **Liste:** nur Kurse mit `tenant_id` des eigenen Tenants; **US-MVP-E3-04** und Tenant-Kontext **E4**.
- [ ] **Bearbeiten (MVP-Scope):** nur dieselben Felder wie **US-MVP-E5-01** änderbar; **kein** Kurs-Löschen im MVP; **kein** Massenimport; **keine** neue Serien-/Ausnahme-Logik über den bestehenden Ist-Umfang hinaus (mehr nur mit explizitem Scope im PR).
- [ ] **Tenant-Tests (beobachtbar):** User (Rolle **`user`**) auf Host B sieht keine Kurse von A; Deep-Link/Detail mit `course_id` von A auf Host B → **404** oder gleichwertiger Schutz ohne Datenleck.

### User Story US-MVP-E5-03 – Teilnehmer: Registrierung auf Tenant-Host

**Als** Teilnehmer (Rolle **`user`**) **möchte ich** mich unter der **URL meines Anbieters** registrieren, **damit** mein Konto zum richtigen Mandanten gehört.

**Akzeptanzkriterien**

- [ ] Signup setzt `tenant_id` aus Host-Tenant und Rolle **`user`** — **US-MVP-E2-06** (Tenant-Kontext **E4**).
- [ ] Kein „mandantenloser“ Signup im MVP.
- [ ] **Tenant-Test (beobachtbar):** Signup über Host A erzeugt kein Profil mit `tenant_id` von B.

### User Story US-MVP-E5-04 – Teilnehmer: Kursliste im Mandanten

**Als** Teilnehmer (Rolle **`user`**) **möchte ich** die Kurse **meines** Anbieters sehen, **damit** ich wählen kann.

**Akzeptanzkriterien**

- [ ] Liste nur Kurse des aktuellen Mandanten; abgesichert durch **US-MVP-E3-04** und **E4** (UI-Filter optional, RLS verbindlich).
- [ ] **Tenant-Test (beobachtbar):** eingeloggter User (Rolle **`user`**) auf Tenant A sieht keine Kurstitel oder -metadaten von B.

### User Story US-MVP-E5-05 – Teilnehmer: Kursdetail

**Als** Teilnehmer (Rolle **`user`**) **möchte ich** einen Kurs im Detail sehen, **damit** ich ihn bewusst buchen kann.

**Akzeptanzkriterien**

- [ ] Detail nur für Kurse im eigenen Mandanten; fremde `course_id` → **404** oder gleichwertiger Schutz (**US-MVP-E3-04**, **E4**).

### User Story US-MVP-E5-06 – Teilnehmer: Anmeldung / Buchung (Fachregeln und Daten)

**Als** Teilnehmer (Rolle **`user`**) **möchte ich** mich für einen Kurs anmelden, **damit** meine Anmeldung serverseitig gültig gespeichert ist (regulärer Platz oder — **sofern** die Buchungslogik im Repo das vorsieht — Warteliste).

**Akzeptanzkriterien — Fachregeln**

- [ ] **Höchstens eine aktive Buchung pro User und Kurs:** zweiter Versuch mit klarer Fehlermeldung (kein zweites aktives Teilnahme-Datensatz-Äquivalent; keine Doppelbuchung).
- [ ] **Kapazität und Warteliste (MVP-Entscheidung):** Es gibt **kein** neues Wartelisten-**Produkt** über den Ist-Stand hinaus (keine Benachrichtigungen, keine eigene Wartelisten-Verwaltungs-UI als MVP-Pflicht). **Wenn** die im Repo genutzte zentrale Buchungsfunktion (nach Multi-Tenant-Anpassung) Wartelisten-Einträge **erzeugt**, gelten diese als **MVP-Bestand**: die Buchungsrückmeldung muss den Status für den Teilnehmer erkennbar machen; in **US-MVP-E5-08** muss derselbe Status in der Kurs-Anmeldeübersicht erscheinen, **sofern** das Schema ihn speichert. **Wenn** die Funktion **keine** Warteliste kennt, **entfällt** sie im MVP **ohne** Ersatzimplementierung.
- [ ] **Kursbeginn in der Vergangenheit:** Anmeldung serverseitig abgelehnt, wenn der **Beginn** aus **`date` + `time`** (ggf. mit `end_time` nur falls im PR für „vorbei“ relevant) **vor** dem aktuellen Zeitpunkt liegt — **nicht** nur die grobe Regel `date` < heute, sofern `time` im Schema existiert (sonst `date` < heute als dokumentierte Vereinfachung im PR).
- [ ] **Nicht buchbare Stati:** Anmeldung serverseitig abgelehnt für abgesagte / nicht geplante Kurse (Orientierung am Ist-Repo, z. B. `courses.status` in `canceled`, `cancelled`, `not_planned` — exakte Liste im PR am Code festhalten).

**Akzeptanzkriterien — Daten und Tenant**

- [ ] Schreiben in `registrations` (aktuelle Struktur) mit korrekter `tenant_id`, `course_id`, `user_id`; **US-MVP-E3-02** (`registrations.tenant_id` = `courses.tenant_id`; User desselben Tenants).
- [ ] **Tenant-Test (beobachtbar):** Buchung für Kurs aus B während Session auf A schlägt fehl; kein sichtbarer Eintrag in Tenant B bei Tenant-A-Manipulation.

### User Story US-MVP-E5-07 – Teilnehmer: Buchung technisch absichern (RPC / RLS)

*Enabler- / Security-Story (mandantengehärteter Schreibpfad), kein klassisches Endnutzer-Fachverhalten — analog zu technischen Stories in anderen Epics.*

**Als** Team **möchten wir** den Buchungs-Schreibpfad technisch absichern, **damit** Mandantengrenzen nicht umgangen werden können.

**Akzeptanzkriterien**

- [ ] Buchung über **denselben zentralen serverseitigen Pfad** wie im Ist-Repo (z. B. `register_for_course`, finaler Name im PR), erweitert um **Tenant-Abgleich** zwischen Aufrufer, Kurs und ggf. Registration.
- [ ] **`search_path`** gesetzt; kein Muster, das RLS dauerhaft umgeht — **US-MVP-E3-06**.
- [ ] **Tenant-Test (beobachtbar):** Funktion lehnt ab, wenn Kurs-`tenant_id` ≠ `tenant_id` des authentifizierten Users; zwei Mandanten manuell dokumentiert.

### User Story US-MVP-E5-08 – Owner: Anmeldungen zu Kursen einsehen

**Als** Owner **möchte ich** für **einen gewählten Kurs** die Anmeldungen einsehen, **damit** ich den Betrieb steuern kann.

**Akzeptanzkriterien**

- [ ] **UI-Kontext:** Ansicht **pro Kurs** (von Liste/Detail erreichbar); keine Pflicht für eine aggregierte „alle Kurse“-Übersicht im MVP.
- [ ] **Angezeigte Felder (Minimum):** pro Teilnehmer mindestens **Name** (bzw. Anzeigename aus Profil) und **E-Mail**; dazu **Status** der Anmeldung (regulär vs. Warteliste o. ä. laut Schema) und **Zeitpunkt** der Anmeldung, falls im Schema vorhanden. **Hinweis (Review):** bewusste Produktentscheidung — personenbezogene Daten nur für die **Kursorganisation im eigenen Tenant**, keine Pflicht zu Export/Drittsystem; Umfang im PR gegen geltende Datenschutzvorgaben des Betreibers prüfen.
- [ ] **Lesen:** MVP verlangt **keine** Pflicht-Aktionen Stornieren / Warteliste verwalten / fremde Profile bearbeiten (bestehende Ist-Features dürfen bleiben, sind aber nicht Teil des MVP-Lieferumfangs dieser Story).
- [ ] Nur Kurse/Registrierungen des **eigenen** Mandanten; **US-MVP-E3-05**; keine Admin-/Teacher-UI-Pflicht.
- [ ] **Tenant-Test (beobachtbar):** Owner A sieht für einen Kurs in A keine Teilnehmerdaten aus B; Zugriff mit fremder `course_id`/`registration_id` ohne Berechtigung → leer/Fehler, **kein** Datenleck.

### Epic E5 – Definition of Done (Epic-Ebene)

E5 ist erledigt, wenn **US-MVP-E5-01** bis **US-MVP-E5-08** erfüllt sind, **zwei Mandanten** auf DEV jeweils Kurse und Anmeldungen haben und **übergreifend** keine Daten sichtbar oder manipulierbar sind — einschließlich Schreibpfaden (Buchung/Kurs), die **US-MVP-E3-06** einhalten und RLS nicht umgehen.

---

## Gesamt-Definition of Done (MVP-Produkt)

Das MVP ist erledigt, wenn ein Team **End-to-End** zeigen kann:

1. Neuen Tenant inkl. Owner anlegen (E4) — **ohne** gespeicherte Tenant-Typunterscheidung (E1).
2. Als Owner Kurse erstellen und verwalten (E5).
3. Als Teilnehmer mit Rolle **`user`** registrieren, Kurse sehen, anmelden (E5).
4. Mit zwei Mandanten: Daten **getrennt** (E3/E5), inklusive **mandantengehärteter** Kurs-/Buchungs-Schreibpfade gemäß **US-MVP-E3-06**.

Referenz für spätere Erweiterungen: [MULTI_TENANT_PRODUCT_BACKLOG.md](MULTI_TENANT_PRODUCT_BACKLOG.md).
