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
- **Teilnehmer** können sich **anmelden**,
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

**Als** Team **möchten wir** Teilnehmer beim Signup korrekt zuordnen, **damit** sie im richtigen Tenant agieren.

**Akzeptanzkriterien**

- [ ] Signup erfolgt im Tenant-Kontext (z. B. Host/URL → Tenant); neuer Teilnehmer erhält `tenant_id` aus dem aktuellen Tenant und Rolle **user**.
- [ ] **DEV-Test:** Profil entspricht dem Host-Tenant.

### Epic E2 – Definition of Done (Epic-Ebene)

E2 ist erledigt, wenn **alle** User Stories US-MVP-E2-01 bis US-MVP-E2-06 erfüllt sind, **jeder** User genau einem Tenant zugeordnet ist, Rollen **eindeutig und konsistent** gespeichert sind, die Default-Rolle **user** korrekt vergeben wird und **keine** parallele Rollen- oder Tenant-Logik aus Alt-Feldern verbleibt. **RLS** folgt in E3.

---

## Epic E3 – Mandantensicherheit (RLS)

**Ziel:** Für **`users`**, **`courses`** und **`registrations`** gilt RLS: Zugriff nur innerhalb des eigenen Tenants.

**Abhängigkeiten:** Epic E1, Epic E2.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________
- Hilfsfunktion-Name (z. B. `current_user_tenant_id()`): _________________

### User Story US-MVP-E3-01 – `tenant_id` auf `courses` inkl. Backfill

**Als** Team **möchten wir** jeden Kurs einem Tenant zuordnen, **damit** Policies ohne Join-Ketten auskommen.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` auf `courses`, falls nicht vorhanden; FK zu `tenants` wo passend.
- [ ] Backfill nur **DEV**: sinnvolle Quelle (z. B. über Ersteller/Owner-Zeile).

### User Story US-MVP-E3-02 – `tenant_id` auf `registrations` inkl. Backfill

**Als** Team **möchten wir** Anmeldungen demselben Tenant zuordnen wie der zugehörige Kurs, **damit** RLS einheitlich filtert.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` auf `registrations`, falls nicht vorhanden; Backfill **DEV** aus Kurs oder User.
- [ ] Neue Anmeldungen: `tenant_id` konsistent zum Kurs (Constraint, Trigger oder disziplinierte Writes in App/RPC).

### User Story US-MVP-E3-03 – Hilfsfunktion: Tenant des aktuellen Nutzers

**Als** Team **möchten wir** **eine** SQL-Hilfsfunktion für Policies, **damit** Tenant-Filter nicht kopiert werden.

**Akzeptanzkriterien**

- [ ] Funktion liefert `tenant_id` für `auth.uid()` via Lookup in `public.users` (oder festgelegtes Äquivalent).
- [ ] `STABLE`, `search_path` gesetzt; bei Policies auf `users`: keine rekursive Selbstreferenz ohne etabliertes Muster.

### User Story US-MVP-E3-04 – RLS: Tabelle `users`

**Als** Produkt **möchten wir** Nutzerdaten nur innerhalb des Mandanten sichtbar und änderbar machen, **damit** keine fremden Profile geleakt werden.

**Akzeptanzkriterien**

- [ ] RLS für `users` aktiv; Zugriff nur mit Tenant-Bezug (z. B. Zeilen-`tenant_id` vs. Hilfsfunktion).
- [ ] **owner** (und ggf. **admin** / **teacher**, sofern im MVP für dieselben Rechte genutzt): Lesen/Schreiben im eigenen Tenant, soweit für MVP nötig (z. B. Teilnehmerlisten); keine Fremd-Tenants.
- [ ] **user**: eigenes Profil; keine fremden Nutzerdaten aus anderen Mandanten.
- [ ] Policies migrationsfreundlich (`DROP POLICY IF EXISTS` …) nach Repo-Konvention.

### User Story US-MVP-E3-05 – RLS: Tabelle `courses`

**Als** Produkt **möchten wir** Kurse nur im eigenen Mandanten sehen und verwalten können, **damit** keine Fremdkurse sichtbar sind.

**Akzeptanzkriterien**

- [ ] RLS aktiv; kein Lesezugriff auf Kurse anderer Tenants.
- [ ] **owner** (MVP-Produktpfad; ggf. **admin** / **teacher** analog E2): CRUD für Kurse mit `tenant_id` = eigenem Tenant.
- [ ] **user**: Lesen der Kurse im eigenen Tenant; keine Bearbeitung fremder Kurse.

### User Story US-MVP-E3-06 – RLS: Tabelle `registrations`

**Als** Produkt **möchten wir** Anmeldungen nur im eigenen Mandanten nutzbar machen, **damit** Teilnehmerlisten nicht durchleaken.

**Akzeptanzkriterien**

- [ ] RLS aktiv; Tenant-Filter auf `tenant_id`.
- [ ] **owner** (ggf. **admin** / **teacher** analog E2): Anmeldungen zu Kursen des eigenen Tenants lesen; Schreiben nach bestehender Fachlogik, tenant-gehärtet.
- [ ] **user**: nur eigene Anmeldungen (bzw. Buchungen) im eigenen Tenant.

### User Story US-MVP-E3-07 – Buchungs-/Kurs-RPCs: Tenant mitprüfen

**Als** Team **möchten wir** `SECURITY DEFINER`-Funktionen, die Kurse oder Anmeldungen schreiben, absichern, **damit** man RLS nicht darum herum nutzen kann.

**Akzeptanzkriterien**

- [ ] Jede betroffene Funktion prüft: der Aufruf-Kontext (Nutzer/Tenant) passt zur **gleichen** `tenant_id` wie die betroffenen Zeilen — oder die Funktion wird für MVP entfernt/ersetzt.
- [ ] `search_path` bei `SECURITY DEFINER` gesetzt.

### User Story US-MVP-E3-08 – Mandanten-Isolation kurz verifizieren

**Als** Team **möchten wir** auf DEV grob nachweisen, dass Mandant A keine Daten von Mandant B in diesen Tabellen sieht, **damit** E3 verlässlich ist.

**Akzeptanzkriterien**

- [ ] Zwei Test-Tenants; Stichproben: Abfragen/Mutationen als User A dürfen Daten von B nicht offen legen (manuell oder kleines Script).
- [ ] Ergebnis für das Team nachvollziehbar (kurze Notiz reicht).

### Epic E3 – Definition of Done (Epic-Ebene)

E3 ist erledigt, wenn US-MVP-E3-01 bis US-MVP-E3-08 erfüllt sind. **Weitere Tabellen** (z. B. Nachrichten) sind **nicht** MVP-Pflicht.

---

## Epic E4 – Tenant-Kontext & Onboarding

**Ziel:** Die Web-App löst den **Tenant** aus dem **Host** (MVP: z. B. Subdomain = Slug), hält den Kontext zentral und erlaubt **neuen Tenant + Owner** ohne Branding, Custom Domain oder Einstellungen.

**Abhängigkeiten:** Epic E1–E3 (Schema und RLS für sichere Schreibwege).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Basis-Host Produktion vs. lokaler Slug/ENV: _________________
- Technik Tenant + Owner (RPC/Edge/App): _________________

### User Story US-MVP-E4-01 – Host → Tenant (`slug`) auflösen

**Als** Nutzer **möchte ich** die App unter der Adresse **meines** Mandanten öffnen und korrekt zugeordnet werden, **damit** ich nicht auf dem falschen Mandanten lande.

**Akzeptanzkriterien**

- [ ] Beim Start: Host auswerten und `tenants.slug` zuordnen (ohne Custom Domain).
- [ ] Unbekannter Host: keine stillschweigende Zuordnung zu einem Default-Tenant; Nutzer sieht eine klare Fehlermeldung oder Blockade.
- [ ] Basisdomain/Konfiguration über Umgebungsvariablen (kein reiner Hardcode).

### User Story US-MVP-E4-02 – Zentraler Tenant-Kontext in der App

**Als** Entwicklungsteam **möchten wir** einen **einheitlichen** Tenant-Kontext (z. B. React Context + Hook), **damit** Seiten dieselbe `tenant_id` nutzen.

**Akzeptanzkriterien**

- [ ] Hook/Context liefert `tenantId`, Lade- und Fehlerzustand sowie Anzeigename für die UI.
- [ ] Loading-UI bis der Kontext steht; Fehlerfall konsistent zu US-MVP-E4-01.

### User Story US-MVP-E4-03 – Session-Tenant vs. Host-Tenant abgleichen

**Als** Produkt **möchten wir** verhindern, dass eine Session für **Mandant B** auf dem Host von **Mandant A** genutzt wird.

**Akzeptanzkriterien**

- [ ] Nach Login bzw. Resume: weicht Profil-`tenant_id` vom Host-Tenant ab → Abmelden und kurzer Hinweis (Link zum richtigen Host optional, nicht zwingend perfektes Deep-Linking).
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

- [ ] Ein Schreibpfad legt nacheinander oder atomar an: Zeile `tenants`, Auth-User, `public.users` mit `tenant_id` und Rolle **owner**; bei Fehler kein nutzbarer Endzustand „Tenant ohne Owner“ (Rollback oder bereinigbarer Fehler).
- [ ] Keine zusätzlichen Pflichtfelder außerhalb MVP (kein Logo, keine Farben).

### User Story US-MVP-E4-07 – Onboarding: Redirect zur Tenant-URL

**Als** neuer Owner **möchte ich** nach dem Setup auf **meiner** Mandanten-URL landen, **damit** ich dort einloggen und arbeiten kann.

**Akzeptanzkriterien**

- [ ] Erfolgsfall: Navigation zur Tenant-URL (Subdomain/Host-Konzept des Projekts); lokal dokumentierter Umweg zulässig.
- [ ] Kurzer manueller Durchlauf auf DEV: Tenant da, Owner kann sich anmelden.

### User Story US-MVP-E4-08 – Lokale Entwicklung: Slug/Host simulieren

**Als** Entwickler **möchte ich** **lokal** zwei Mandanten unterscheiden können, **damit** Multi-Tenant ohne produktionsnahes DNS testbar ist.

**Akzeptanzkriterien**

- [ ] Team hat eine vereinbarte Dev-Methode (z. B. `VITE_`-Variable und/oder `hosts`); in README oder bestehendem Dev-Doc verlinkt oder in 2–3 Sätzen beschrieben.

### Epic E4 – Definition of Done (Epic-Ebene)

E4 ist erledigt, wenn US-MVP-E4-01 bis US-MVP-E4-08 auf **DEV** mit mindestens **zwei** Mandanten durchspielbar sind.

---

## Epic E5 – Kurse & Buchung

**Ziel:** **owner** legt **Kurse** an (MVP-Produktpfad); **user** sieht Angebot und meldet sich an — strikt **tenant-lokal**. (Rollen **admin** / **teacher** sind im Schema E2 vorhanden; Kursanlage durch **teacher**/**admin** kann später ergänzt werden, ohne E2 zu ändern.)

**Abhängigkeiten:** Epic E2–E4.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Welche Kursfelder die Ist-App hat (Dauer, Kapazität, …): _________________

### User Story US-MVP-E5-01 – Owner: neuen Kurs anlegen

**Als** Owner **möchte ich** einen Kurs anlegen, **damit** Teilnehmer ihn später buchen können.

**Akzeptanzkriterien**

- [ ] Anlegen nur als **owner**; neuer Kurs hat `tenant_id` des aktuellen Mandanten.
- [ ] Keine sichtbaren Daten aus anderen Mandanten im Anlegeflow.

### User Story US-MVP-E5-02 – Owner: Kurse auflisten und bearbeiten

**Als** Owner **möchte ich** meine Kurse sehen und bearbeiten, **damit** ich Angebote pflegen kann.

**Akzeptanzkriterien**

- [ ] Liste und Bearbeitung nur für Kurse mit `tenant_id` des eigenen Tenants.
- [ ] UI und Queries an Tenant-Kontext aus E4 angepasst.

### User Story US-MVP-E5-03 – User (Teilnehmer): Registrierung auf Tenant-Host

**Als** Teilnehmer **möchte ich** mich unter der **URL meines Anbieters** registrieren, **damit** mein Konto zum richtigen Mandanten gehört.

**Akzeptanzkriterien**

- [ ] Signup setzt `tenant_id` aus Host-Tenant und Rolle **user** (verknüpft mit US-MVP-E2-06).
- [ ] Kein „mandantenloser“ Teilnehmer-Signup im MVP.

### User Story US-MVP-E5-04 – User (Teilnehmer): Kursliste im Mandanten

**Als** Teilnehmer **möchte ich** die Kurse **meines** Anbieters sehen, **damit** ich wählen kann.

**Akzeptanzkriterien**

- [ ] Liste zeigt nur Kurse des aktuellen Mandanten (RLS und/oder Filter).
- [ ] Keine Cross-Tenant-Anzeige.

### User Story US-MVP-E5-05 – User (Teilnehmer): Kursdetail

**Als** Teilnehmer **möchte ich** einen Kurs im Detail sehen, **damit** ich ihn bewusst buchen kann.

**Akzeptanzkriterien**

- [ ] Detailansicht nur für Kurse im eigenen Mandanten; andernfalls 404 oder gleichwertiger Schutz.

### User Story US-MVP-E5-06 – User (Teilnehmer): Anmeldung / Buchung

**Als** Teilnehmer **möchte ich** mich für einen Kurs anmelden, **damit** mein Platz registriert ist.

**Akzeptanzkriterien**

- [ ] Schreiben in `registrations` (oder bestehende Struktur) mit korrekter `tenant_id` und Kursbezug.
- [ ] Kapazität/Doppelbuchung etc. wie in der Ist-App, tenant-sicher; keine Daten in fremde Mandanten.

### User Story US-MVP-E5-07 – Owner: Anmeldungen zu Kursen einsehen

**Als** Owner **möchte ich** sehen, wer angemeldet ist, **damit** ich den Betrieb steuern kann.

**Akzeptanzkriterien**

- [ ] Anzeige nur für Kurse/Anmeldungen des eigenen Mandanten.
- [ ] Abgleich mit RLS aus E3.

### Epic E5 – Definition of Done (Epic-Ebene)

E5 ist erledigt, wenn **zwei Mandanten** auf DEV jeweils Kurse und Anmeldungen haben und **übergreifend** keine Daten sichtbar oder manipulierbar sind.

---

## Gesamt-Definition of Done (MVP-Produkt)

Das MVP ist erledigt, wenn ein Team **End-to-End** zeigen kann:

1. Neuen Tenant inkl. Owner anlegen (E4) — **ohne** gespeicherte Tenant-Typunterscheidung (E1).
2. Als Owner Kurse erstellen und verwalten (E5).
3. Als **user** (Teilnehmer) registrieren, Kurse sehen, anmelden (E5).
4. Mit zwei Mandanten: Daten **getrennt** (E3/E5).

Referenz für spätere Erweiterungen: [MULTI_TENANT_PRODUCT_BACKLOG.md](MULTI_TENANT_PRODUCT_BACKLOG.md).
