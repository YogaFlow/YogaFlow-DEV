# Product Backlog: Mehrmandantenmodell (YogaFlow)

Living document: Es werden **Epic für Epic** User Stories ergänzt. **Epic E0–E12** sind im Dokument erfasst; bei neuen Anforderungen können weitere Stories oder Epics ergänzt werden.

## Produktziel (Referenz)

Eine gemeinsame technische Basis; pro Kunde eine **isolierte Plattform** (Tenant) mit eigener Domain (Subdomain oder Custom Domain), eigenem Branding und **strikttenant-getrennten** Daten. Keine globalen Nutzerkonten über Plattformgrenzen hinweg; ein Benutzer pro Tenant-Kontext.

## Leitprinzip: Ist-App als Funktionsbasis

Nach erfolgreichem Tenant-Onboarding (Registrierung und Setup als **Anbieter-Plattform**, ohne gespeicherten Tenant-Typ im Datenmodell — siehe Epic E1) soll die Anwendung **dieselbe Kernfunktionalität** wie die **aktuelle YogaFlow-Web-App in diesem Repository** bieten — jeweils **strikt im Mandanten-Kontext**. Es wird **kein paralleles oder bewusst vereinfachtes Ersatzprodukt** pro Mandant anvisiert; die Epics liefern **Mandantenfähigkeit** (Datenmodell, RLS, Kontext, Domains, Branding, Onboarding usw.) **auf** der bestehenden Feature-Basis.

Technisch bleiben es **eine** Codebasis und **eine** bereitgestellte Web-App; für Endnutzer wirkt es wie **viele getrennte Plattformen** auf gemeinsamer Infrastruktur.

## Zielbild Mehrmandantenmodell (kompakt, 1–12)

Kanonische Referenz für Produkt und Abnahme; die konkrete Umsetzung ist in den Epics **E0–E12** weiter unten aufgebrochen.

1. **Ziel pro Kunde:** Eigene Plattform (Web-App im Browser), eigenes Branding, eigene Domain, vollständig getrennte Daten.
2. **Grundprinzip:** Eine technische Anwendung; pro Kunde eine isolierte Plattform (Tenant) — fachlich wie viele getrennte Apps auf **gemeinsamer** technischer Basis.
3. **Tenant:** Entsteht, wenn sich ein Yoga-Lehrer oder ein Yoga-Studio registriert und das Setup durchläuft. **Im Datenmodell** gibt es **keine** unterscheidende Spalte „Studio vs. Lehrer“ auf `tenants` — jeder Tenant ist **eine** Plattform (MVP-/E1-Leitplanke; Details [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)). **Fachlich** bleiben Szenarien „mehrere Kursleiter im Studio“ vs. „einzelner Lehrer“ über **Rollen und UX** (**owner**, **admin**, **teacher**, **user**) abbildbar, nicht über `tenant_type`.
4. **Benutzer (final):** Alle Benutzer sind tenant-spezifisch; jeder gehört **genau einem** Tenant; **keine** globalen Accounts, **kein** plattformübergreifendes Login. Dieselbe Person kann mehrere **voneinander unabhängige** Accounts haben (z. B. Studio A, Studio B, eigener Anbieter-Tenant); dieselbe **E-Mail** darf in **verschiedenen** Tenants vorkommen, ist aber **innerhalb eines Tenants eindeutig** (`tenant_id`, `email`).
5. **Rollen innerhalb eines Tenants (kanonisch):** **owner** (Plattform-Inhaber, volle Kontrolle), **admin** (Inhalte und Nutzer verwalten, kein Ownership), **teacher** (Kurse erstellen/verwalten), **user** (normaler Teilnehmer). Neue Nutzer erhalten standardmäßig **user**; höhere Rollen vergibt der **owner** (UI/API-Logik außerhalb des schmalen Schema-Epics E2, siehe E6). Ein **einzelner Lehrer** ist typischerweise **owner** (und ggf. einziger **teacher**); ob und wann eine **Lehrer-/Rollen-Verwaltungs-UI** sinnvoll ist, ohne `tenant_type`-Feld zu speichern, regeln die Epics E5/E6 (z. B. nur für **owner**, mit eingeschränkter UX bei Ein-Personen-Mandanten).
6. **Nutzer- und Rollenverwaltung (Studio):** Das Studio legt Benutzer **nur innerhalb seines Tenants** an; **keine** Verbindung zu anderen Tenants. Ein Lehrer in mehreren Studios hat **mehrere getrennte Accounts** — spätere multitenant-fähige Modelle sind nicht Ziel dieses Backlogs, sofern nicht explizit neu beschlossen.
7. **Daten-Isolation:** Strikt tenant-getrennt; relevante Entitäten tragen `tenant_id` (u. a. Kurse, Teilnehmer, Buchungen, Wartelisten); kein Zugriff auf fremde Mandanten, keine gemeinsamen fachlichen Daten über Tenant-Grenzen.
8. **Teilnehmer:** Existieren nur innerhalb eines Tenants; Registrierung **pro Plattform**; sichtbar und buchbar sind nur Kurse **dieses** Tenants — **kein** globales Teilnehmerkonto, **keine** Plattform-Verknüpfung für Teilnehmer.
9. **Branding & Domains (Zielbild):** Pro Tenant u. a. Logo, Farben, Domain — **Subdomain** und/oder **eigene Domain** (Umsetzung v. a. Epics E7, E8).
10. **Nutzung & Buchung:** Kurse und Buchungen nur innerhalb eines Tenants; **keine** zentrale Marktplatz-/Plattformübersicht für Endnutzer über Mandanten hinweg.
11. **Onboarding (Zielablauf):** Registrierung (z. B. Landingpage), kurzer Setup (**Name**, **Slug**/Subdomain je nach Produktreife; **kein** Pflichtfeld `tenant_type` auf `tenants`), ggf. Branding/Domains später, Tenant wird erstellt, Nutzer wird Owner, Plattform ist nutzbar — im Sinne von Abschnitt **Leitprinzip** mit der **Ist-Feature-Basis** dieser Codebase.
12. **Akzeptanz (Gesamtbild):** Jeder Kunde erhält einen Tenant; Domain und Branding gemäß Zielbild; alle Daten strikt tenant-getrennt; alle Benutzer genau einem Tenant zugeordnet; kein globales Benutzerkonto; keine mandantenübergreifende Session-Aktivierung; Handeln nur innerhalb des eigenen Tenants; **owner** können Rollen **im** Mandanten verwalten (wo produktseitig vorgesehen, v. a. E6); **user** registrieren sich pro Plattform separat; Kurse und Buchungen nur tenant-lokal sichtbar; alle Tenants laufen in **einer** gemeinsamen technischen Infrastruktur (`tenant_id`-basiert).

## Planungsstruktur (Epics)

Die Komplexität wird **modular** in mehreren Epics abgearbeitet — für überschaubare Inkremente und Priorisierung statt eines einzigen undurchsichtigen Gesamt-Epics. **Verbindlicher Planungsrahmen** in diesem Dokument sind die Epics **E0–E12**. Sie decken dasselbe Zielbild wie eine grobe thematische Aufteilung in technisches Fundament und Datensicherheit, Identität und Rollen, Branding und Domains, Onboarding und mandantenreife Fachlogik ab — **ohne** verpflichtendes Tenant-Typ-Feld in der Datenbank (Abgleich MVP: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)).

---

## Epics (Übersicht)

| ID | Titel | Status |
|----|--------|--------|
| E0 | Discovery & Architektur-Spikes | Inhalt unten vollständig |
| E1 | Tenant-Kern (Datenmodell) | Inhalt unten vollständig |
| E2 | Tenant-gebundene Benutzer & Rollen | Inhalt unten vollständig |
| E3 | RLS & mandantensichere Zugriffsregeln | Inhalt unten vollständig |
| E4 | Tenant-Kontext in der App | Inhalt unten vollständig |
| E5 | Onboarding & Provisionierung | Inhalt unten vollständig |
| E6 | Studio: Lehrer-Verwaltung (`teacher`) | Inhalt unten vollständig |
| E7 | Domains & Routing | Inhalt unten vollständig |
| E8 | Branding | Inhalt unten vollständig |
| E9 | Fachlogik mandantenreif | Inhalt unten vollständig |
| E10 | Einstellungen & Sonderfälle | Inhalt unten vollständig |
| E11 | Qualität, Sicherheit, Betrieb | Inhalt unten vollständig |
| E12 | Migration Bestand (DEV/PROD) | Inhalt unten vollständig |

---

## Epic E0 – Discovery & Architektur-Spikes

**Ziel:** Vor größeren Schema- und Code-Änderungen sind Architektur und Betrieb für **Auth/Tenant** sowie **Domain/Hosting** geklärt und dokumentiert. Ergebnis sind Entscheidungen und Skizzen, die Epics E1 ff. tragen – noch keine produktreife Umsetzung aller Features.

**Abhängigkeiten:** Keine Vorgänger-Epics.

**Team-Notizen (während Spike ausfüllen):**

- Zeitbox Start / Ende: _________________
- Verantwortliche Person Dokumentation / ADR: _________________

### User Story US-E0-01 – Auth/Tenant-Architektur entscheiden

**Als** Entwicklungsteam **möchten wir** eine verbindliche Architektur für „jeder Benutzer gehört genau einem Tenant“ mit Supabase Auth in **einem** Projekt **festhalten**, **damit** Datenmodell (E1), Rollen (E2) und RLS (E3) konsistent aufsetzbar sind.

**Akzeptanzkriterien**

- [ ] Schriftliches Ergebnis (max. ca. 2–4 Seiten oder ein ADR): Herkunft und Bindung von `tenant_id` zu Lebenszyklus von `auth.users` und öffentlicher Profiltabelle (`public.users` o. Ä.).
- [ ] Klarstellung **E-Mail-Eindeutigkeit** im Supabase-Projekt vs. fachliches Modell („dieselbe Person kann in Tenant A und B verschiedene Accounts haben“) inkl. gewählter Strategie (z. B. technische Abbildung oder bewusste Einschränkung).
- [ ] **Eine** Leitlinie, wie RLS später den Tenant-Bezug herstellt (z. B. Claim in JWT vs. ausschließlich Lookup über Profilzeile zu `auth.uid()`); Abwägung in Stichpunkten.
- [ ] Kurzliste **nicht** gewählter Alternativen mit je einem Satz Begründung.

### User Story US-E0-02 – Registrierungs- und Login-Abläufe pro Tenant skizzieren

**Als** Team **möchten wir** die End-to-End-Abläufe für **owner**, **user** (Teilnehmer) und Einladung mit Rolle **teacher** (Kursleiter) an **Tenant gebundenen** Einstiegspunkten skizzieren, **damit** Onboarding (Epic E5) und Lehrer-Verwaltung (Epic E6) planbar sind.

**Akzeptanzkriterien**

- [ ] Beschrieben: Ablauf vom ersten Kontakt (z. B. Tenant-URL) bis bestehender Session mit eindeutigem Tenant-Kontext für mindestens **owner** und **user**.
- [ ] Beschrieben: grober Ablauf **Einladung eines Kursleiters** durch **owner** (Einladung, Annahme, Rolle **teacher** im gleichen Tenant).
- [ ] Randfälle genannt: Passwort-Reset, erneuter Login, Fehler wenn Host/Tenant nicht auflösbar (mindestens als Liste „muss in späterem Epic adressiert werden“).

### User Story US-E0-03 – Spike zeitlich begrenzen und Restarbeit zuordnen

**Als** Team **möchten wir** E0 **zeitboxen** und offene Punkte Epics zuordnen, **damit** die Planung nicht ohne Ende in Discovery stecken bleibt.

**Akzeptanzkriterien**

- [ ] Zeitbox dokumentiert (empfohlen: 2–5 Arbeitstage total für E0, nach Teamgröße anpassbar).
- [ ] Explizite Liste „**Weiter bei Epic …**“ für alles, was bewusst nicht in E0 gelöst wird.
- [ ] Liste **Risiken / Annahmen**, die bei E1–E4 überprüft werden müssen.

### User Story US-E0-04 – Domain / Hosting: Tenant-Erkennung und Betrieb (Skizze)

**Als** Team **möchten wir** klären, wie **Subdomains** und **eigene Domains** technisch und betrieblich zur YogaFlow-Web-App (Cloudflare) passen und wie daraus eine **Tenant-Zuordnung** aus dem HTTP-Host entstehen kann, **damit** Epic E7 und das Hosting nicht improvisiert werden.

**Akzeptanzkriterien**

- [ ] Kurzbeschreibung Zielbild: Wildcard-Subdomain (z. B. `{tenant}.yoga-app.com`) vs. Custom Domain pro Kunde; was ist **MVP** vs. **später**.
- [ ] Grober Ablauf: DNS / Cloudflare (Custom domains, ggf. Wildcard), TLS, und wo im Request die App den Host liest.
- [ ] Datenmodell-Voraussetzung genannt: welche Felder ein Tenant später braucht, um Host → Tenant aufzulösen (z. B. `slug`, `primary_host`, Flags); Detailimplementierung bleibt E1/E7 vorbehalten.
- [ ] Bekannte Einschränkungen oder offene Recherchepunkte (z. B. Caching, Redirects, `www`) als Bulletliste.

### User Story US-E0-05 – Abgleich mit bestehender Codebasis und Migrationsdisziplin

**Als** Team **möchten wir** die Spike-Ergebnisse mit dem **Ist-Stand** YogaApp2 und dem **Release-Prozess** abgleichen, **damit** spätere Epics keine Regeln aus [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) und [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md) verletzen.

**Akzeptanzkriterien**

- [ ] Kurz festgehalten: heute **eine** logische Plattform pro Supabase-Projekt; Multi-Tenant bedeutet Schema-Erweiterungen + RLS + App-Kontext (kein Parallel-Deploy pro Tenant nötig für MVP).
- [ ] Verweis: neue Migrationen nur unter `supabase/migrations/`, Benennung und DEV-first; PROD nur nach Checkliste.
- [ ] Falls relevant: Hinweis auf späteren Epic **Bestandsmigration** (Default-Tenant / Backfill) ohne bereits die Lösung zu implementieren.

---

### Epic E0 – Definition of Done (Epic-Ebene)

Epic E0 gilt als erledigt, wenn **alle** User Stories US-E0-01 bis US-E0-05 ihre Akzeptanzkriterien erfüllen und das Ergebnis für das Team **abrufbar** ist (Wiki, Repo-Doc, Issue-Anhang o. Ä.).

---

## Epic E1 – Tenant-Kern (Datenmodell)

**Ziel:** Es gibt eine persistierte Repräsentation eines **Tenant** (eigenständige Plattform eines Kunden) mit **technischer Identität** (`slug`), **Anzeigename** (`name`), Zeitstempeln und — in einer separaten Story — **Lebenszyklus/Status** sowie optionalen **Host-/Domain-Vorbereitungen** für Epic E7. **Kein** Feld für Tenant-Arten (`type`, `tenant_type` o. ä.); fachliche Szenarien „Studio vs. einzelner Lehrer“ werden über **Rollen und UX** (E2, E5, E6) abgebildet, nicht über eine Typ-Spalte auf `tenants`. Detaillierte Mindest-AN für das MVP: [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md) (Epic E1).

Umsetzung erfolgt über Datenbankmigration(en) nach Projektkonvention; RLS ist **Epic E3**.

**Abhängigkeiten:** Epic E0 (Architekturentscheide, insbesondere Host → Tenant und Auth-Modell).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________
- Ggf. Abweichungen von Spike E0 (kurz): _________________
- **Slug nach Anlage:** unveränderbar im MVP-Sinne (Produktregel); optional **zusätzlich** DB-seitig absichern (z. B. Trigger) — im PR dokumentieren.

**Explizit nicht Bestandteil von E1 (kann in späteren Epics folgen):** Rollen, User-Tenant-Zuordnung, RLS, App-Logik.

### User Story US-E1-01 – Tabelle `tenants` mit definierten Mindestfeldern

**Als** Produkt **möchten wir** eine zentrale Tabelle `tenants` mit klarem Mindestschema anlegen, **damit** Mandanten stabil gespeichert, eindeutig identifiziert und technisch referenziert werden können.

**Akzeptanzkriterien**

- [ ] Migration unter `supabase/migrations/`; **idempotent** wo sinnvoll; **versioniert und reproduzierbar**; **kein** Table Editor als Hauptquelle der Wahrheit.
- [ ] Migration enthält **nur Schema**; **keine** fachlichen Datenänderungen (kein INSERT/UPDATE/DELETE auf Bestandsdaten außerhalb klar abgegrenzter, dokumentierter Ausnahmen — siehe Projektregeln).
- [ ] Primärschlüssel **`id`** (`uuid`), automatisch generiert (z. B. `gen_random_uuid()`), eindeutig adressierbar.
- [ ] Mindestfelder: **`name`**, **`slug`**, **`created_at`**, **`updated_at`** — sinnvoll **`timestamptz`** gemäß übrigem Schema; optional Angleichung an bestehende **`updated_at`-Trigger** im Repo.
- [ ] **`name`:** `NOT NULL`; keine leeren Werte (z. B. `CHECK (name <> '')`).
- [ ] **`slug`:** `NOT NULL`; **systemweit eindeutig** (Unique-Constraint); nur **lowercase**; nur Zeichen **`[a-z0-9]`**; ungültige Werte werden abgelehnt; **im MVP nicht änderbar** (Produktregel; optional Trigger).
- [ ] **Keine Tenant-Typen im Datenmodell:** kein Feld `type` / `tenant_type` o. ä.

### User Story US-E1-02 – Optional: Host-/Domain-Vorbereitung für spätere Auflösung (E7)

**Als** Team **möchten wir** — sobald E0/E7 es verlangen — nullable Spalten oder dokumentierte Erweiterungspunkte vorsehen, **damit** Epic E7 Host → Tenant ohne Rückbau von E1 ergänzt werden kann.

**Akzeptanzkriterien**

- [ ] Migration idempotent; z. B. nullable `custom_domain`, `primary_host` o. Ä. **nur** wenn in E0/ADR vorgesehen — sonst Story bewusst übersprungen und in Team-Notiz vermerkt.
- [ ] Keine vollständige Custom-Domain-Logik in E1; nur Schema-Vorbereitung.

### User Story US-E1-03 – Lebenszyklus / Status des Tenants

**Als** Betrieb **möchten wir** den Zustand eines Tenants (z. B. aktiv, gesperrt, Testphase) modellieren können, **damit** spätere Epics Zugriff, Abrechnung oder Support steuern können.

**Akzeptanzkriterien**

- [ ] Feld für Status (Enum/Text mit dokumentierter Semantik) oder gleichwertige Modellierung; initiale Default-Werte für neue Zeilen definiert.
- [ ] Kurze Beschreibung in PR: was passiert bei gesperrtem Tenant **fachlich** (technische Durchsetzung kann E3/E4 sein).

### User Story US-E1-04 – Migration ausführen, Schema prüfen, Release-Pfad einhalten

**Als** Team **möchten wir** die E1-Migration(en) auf **DEV** anwenden, das Schema verifizieren und den Projektworkflow einhalten, **damit** PROD nicht versehentlich und ohne Checkliste berührt wird.

**Akzeptanzkriterien**

- [ ] `npm run db:push` bzw. Projektkommando gegen **verlinktes DEV**; Dokumentation beachtet (z. B. [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md), [PRE_START_CHECK.md](PRE_START_CHECK.md)).
- [ ] **Smoke-Test:** Tabelle `tenants` existiert; Spalten **`id`**, **`name`**, **`slug`**, **`created_at`**, **`updated_at`**; PK auf `id`; Unique auf `slug`; negative/positive INSERT-Checks zu `name`/`slug` wie im MVP-Backlog (Epic E1) beschrieben.
- [ ] Kein PROD-`db push` ohne Ablauf in [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md).
- [ ] Hinweis: Ohne RLS können manuelle Checks je nach DB-Rolle nötig sein — erwartbar bis E3.

---

### Epic E1 – Definition of Done (Epic-Ebene)

Epic E1 gilt als erledigt, wenn **alle** User Stories US-E1-01 bis US-E1-04 ihre Akzeptanzkriterien erfüllen (US-E1-02 kann nach E0-Ergebnis **bewusst entfallen**, dann in Team-Notizen begründen), die Migration(en) im Repo liegen und auf **DEV** erfolgreich angewendet und **geraucht** wurden. RLS- und App-weite Mandantenisierung sind **nicht** Teil des Epic-Abschlusses, sofern nicht explizit in einer Story genannt.

---

## Epic E2 – Tenant-gebundene Benutzer & Rollen

**Ziel:** Jeder Datensatz in `public.users` gehört **genau einem Tenant** (`tenant_id` mit Fremdschlüssel auf `tenants`). Zusätzlich existiert ein **einheitliches Rollenmodell** mit vier Werten: **owner**, **admin**, **teacher**, **user**. Neue Nutzer erhalten standardmäßig die Rolle **user**; höhere Rollen vergibt der **owner** (Produktumsetzung der Vergabe **nicht** Teil von E2). **Ohne** `tenant_type` auf `tenants` (Epic E1) werden Szenarien wie „einzelner Lehrer“ vs. „Studio mit mehreren Kursleitern“ über **Rollenbelegung und UX** (Epic E5/E6) abgebildet. Bestehende Rollenfelder aus dem Ist-Schema werden konsolidiert; **RLS und Berechtigungslogik** bleiben **Epic E3** bzw. spätere Epics.

**Grundregeln (Epic-weite Constraints)**

- Jeder User gehört **genau einem** Tenant; **keine** Mehrfachzuordnung zu mehreren Tenants.
- **Keine** mandantenübergreifenden Accounts; **keine** automatische Aktivierung einer Session über mehrere Tenants (Details auch **Epic E4**).
- **E-Mail** darf in **verschiedenen** Tenants mehrfach existieren; **innerhalb eines Tenants** ist die E-Mail **eindeutig**.

**Abhängigkeiten:** Epic E0 (Auth/E-Mail-Strategie), Epic E1 (`tenants` existiert).

**Explizit nicht Bestandteil von E2:** Rollenvergabe durch **owner** (UI/API), **RLS**, Berechtigungslogik in der App, allgemeine App-Logik jenseits der hier genannten Profil-/Signup-Anbindung.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________
- Gewählte E-Mail-Strategie (Link zu E0/ADR): _________________

### User Story US-E2-01 – `tenant_id` auf `users` mit Fremdschlüssel

**Als** Team **möchten wir** jede User-Profilzeile genau einem Tenant zuordnen, **damit** der Mandantenkontext systemweit eindeutig ableitbar ist.

**Akzeptanzkriterien**

- [ ] Spalte `tenant_id` (`uuid`) auf `users` vorhanden; **NOT NULL**; jeder User hat genau einen Tenant.
- [ ] Fremdschlüssel `REFERENCES tenants(id)` (ON DELETE gemäß Teamentscheidung, im PR beschrieben); nur Verweise auf existierende Tenants.
- [ ] Index auf `tenant_id` für Standard-Queries.
- [ ] **Keine Backfill-Logik erforderlich**, sofern keine produktiven Bestandsdaten betroffen sind; bestehende DEV-/Testaccounts dürfen im Rahmen der Umstellung gelöscht und bei Bedarf neu angelegt werden (sonst Backfill-Strategie im PR und Abgleich mit **Epic E12**).

### User Story US-E2-02 – E-Mail-Eindeutigkeit **pro Tenant** in `public.users`

**Als** Produkt **möchten wir** innerhalb eines Tenants keine doppelte E-Mail, **damit** Accounts fachlich eindeutig sind — bei weiterhin gültigem Modell „gleiche E-Mail in **anderem** Tenant erlaubt“ (E0).

**Akzeptanzkriterien**

- [ ] Unique-Constraint auf `(tenant_id, email)` (oder die tatsächlich genutzte Profil-E-Mail-Spalte); globale `UNIQUE(email)` wird entfernt oder bewusst ersetzt, **ohne** Widerspruch zu E0 (falls technisch weiterhin globale Eindeutigkeit in `auth.users` nötig ist → Lösung aus E0 im PR referenziert).
- [ ] Registrierung mit doppelter E-Mail **im selben** Tenant: **klare** Fehlermeldung (UI und/oder API).

### User Story US-E2-03 – Rollenmodell: owner, admin, teacher, user

**Als** Produkt **möchten wir** ein einheitliches Rollenmodell definieren, **damit** App, Logik und RLS dieselbe Grundlage nutzen.

**Akzeptanzkriterien**

- [ ] Zentrale Speicherung der Rolle (z. B. `role`-Spalte oder Enum + Spalte); **genau eine** Rolle pro User.
- [ ] Erlaubte Werte: **owner**, **admin**, **teacher**, **user**.
- [ ] Default bei Registrierung: **user**.
- [ ] Semantik (MVP): **owner** → Plattform-Inhaber (volle Kontrolle); **admin** → verwaltet Inhalte und Nutzer (kein Ownership); **teacher** → erstellt/verwaltet Kurse; **user** → normaler Teilnehmer.

### User Story US-E2-04 – Migration bestehender Rollen zum kanonischen Modell

**Als** Team **möchten wir** bestehende Rollen aus dem Ist-System konsolidieren, **damit** es nur **eine** eindeutige Rollenquelle gibt.

**Akzeptanzkriterien**

- [ ] Migrationslogik in der Migration beschrieben; **Beispiel-Mapping:** Admin → **admin**, Lehrer/Teacher → **teacher**, Teilnehmer/Student → **user**; bei Unklarheit **fallback = user** (im PR festhalten).
- [ ] Nach Migration: alte Rollenfelder **entfernt** oder **nicht mehr genutzt**; keine doppelte Rollenlogik; Trigger, Views und Policies, die alte Felder nutzen, identifiziert und angepasst oder für E3 als Todo gelistet.

### User Story US-E2-05 – Owner-Profil bei Tenant-Erstellung

**Als** Team **möchten wir** bei Erstellung eines Tenants ein korrektes **owner**-Profil erzeugen, **damit** der Tenant sofort nutzbar ist.

**Akzeptanzkriterien**

- [ ] Neuer **owner** erhält: `tenant_id` des neu erstellten Tenants; Rolle **owner**.
- [ ] Umsetzung über Trigger, **RPC** oder bestehendes Auth-Muster (E0/E5); bei Fehler kein dauerhafter Zustand „Tenant ohne Owner“, sofern der Flow atomar gefordert ist.
- [ ] **DEV-Test:** User-Profil stimmt mit Tenant überein.

### User Story US-E2-06 – User-Profil bei Signup (Teilnehmer)

**Als** Team **möchten wir** Teilnehmer beim Signup korrekt zuordnen, **damit** sie im richtigen Tenant agieren.

**Akzeptanzkriterien**

- [ ] Signup erfolgt im Tenant-Kontext (z. B. Host/URL → Tenant); neuer Teilnehmer erhält `tenant_id` aus dem aktuellen Tenant und Rolle **user**.
- [ ] **DEV-Test:** Profil entspricht dem Host-Tenant.
- [ ] Anbindung an E0/E4/E5: fehlender oder unauflösbarer Host → kein stiller Fallback auf falschen Tenant (Fehlerpfad dokumentiert).

---

### Epic E2 – Definition of Done (Epic-Ebene)

Epic E2 gilt als erledigt, wenn **alle** User Stories US-E2-01 bis US-E2-06 erfüllt sind, **jeder** User genau einem Tenant zugeordnet ist, Rollen **eindeutig und konsistent** gespeichert sind, die Default-Rolle **user** bei Registrierung korrekt gesetzt wird und **keine** parallele Rollen- oder Tenant-Logik aus Alt-Feldern verbleibt. Vollständige **RLS**, **Rollenvergabe durch owner** in der UI und übrige Produkt-UI sind **nicht** Teil von E2 (E3, E6 ff.).

---

## Epic E3 – RLS & mandantensichere Zugriffsregeln

**Ziel:** Alle **mandantenrelevanten** Tabellen sind über `tenant_id` (oder ableitbare Tenant-Kette, z. B. über FK zu `courses`) **logisch getrennt**. **Row Level Security (RLS)** verhindert Lesen, Schreiben und Löschen über Tenant-Grenzen hinweg. Hilfsfunktionen und **SECURITY DEFINER**-RPCs folgen der in **E0** festgelegten Tenant-Leitlinie (JWT-Claim vs. Lookup über `public.users`). Tabellen, die **echt global** bleiben (z. B. bestimmte Einstellungen), werden in **Epic E10** explizit benannt; bis dahin keine stillschweigenden Cross-Tenant-Leaks.

**Abhängigkeiten:** Epic E0 (RLS-Leitlinie), Epic E1 (`tenants`), Epic E2 (`users.tenant_id` und Rollen).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Migration-Dateiname(n): _________________
- Gewähltes RLS-Muster (Link E0/ADR): _________________

### User Story US-E3-01 – `tenant_id` (oder äquivalente Tenant-Kette) auf allen fachlichen Tabellen

**Als** Team **möchten wir** sicherstellen, dass jede geschäftsrelevante Entität **einem Tenant** zugeordnet ist oder ausschließlich über FKs innerhalb desselben Tenant auflösbar ist, **damit** RLS und App-Queries einheitlich filtern können.

**Akzeptanzkriterien**

- [ ] Migration(en): `tenant_id` auf mindestens **`courses`**, **`registrations`**, **`messages`** (und weiteren Tabellen, die bereits Kurse/Nutzer referenzieren) gemäß Ist-Schema in `supabase/migrations/`; Konsistenz **registrations.tenant_id** mit **courses.tenant_id** und ggf. Denormalisierung statt teurer JOINs in Policies – im PR begründet.
- [ ] Backfill: bestehende DEV-Zeilen erhalten `tenant_id` aus schlüssigen Quellen (z. B. `teacher_id` → `users.tenant_id` für Kurse); keine PROD-Datenänderung außerhalb der vereinbarten PROD-Freigabe.
- [ ] Ausnahmen explizit: Tabellen ohne Mandantenbezug benannt und (**Epic E10**) zur Klärung „global vs. tenant-scoped“ routiert.

### User Story US-E3-02 – Hilfsfunktion: Tenant des aktuellen authentifizierten Nutzers

**Als** Team **möchten wir** **eine** stabile SQL-Hilfsfunktion (oder das in E0 beschlossene Äquivalent), **damit** Policies lesbar bleiben und nicht an zig Stellen duplizieren.

**Akzeptanzkriterien**

- [ ] Funktion z. B. `current_user_tenant_id()` o. Ä. (Name im Team vereinheitlicht), `STABLE`, mit klar dokumentierter Quelle (`auth.uid()` → `users`, oder JWT-Claim laut E0).
- [ ] `search_path` der Funktion **fest gesetzt** („security invoker“/Ownership gemäß Supabase-Best Practices); keine rekursiven Policy-Fallen (bekannte Falle aus YogaApp2-Historie vermeiden oder dokumentieren).

### User Story US-E3-03 – RLS-Policies: mandantenscharf für Kern-Tabellen

**Als** Produkt **möchten wir**, dass authentifizierte Nutzer **nur** Daten **ihres** Tenants sehen und mutieren, **sofern** ihre Rolle es erlaubt, **damit** die Mandantentrennung technisch durchgesetzt ist.

**Akzeptanzkriterien**

- [ ] Für `users`, `courses`, `registrations`, `messages` (mindestens): bestehende Policies **überarbeitet oder ersetzt**; kein `USING (true)` / uneingeschränkter Lesezugriff für `authenticated` ohne Tenant-Filter auf mandantenrelevanten Daten.
- [ ] **owner / admin / teacher / user:** Rechte spiegeln das in E2 definierte Modell wider (z. B. Kursverwaltung nur im eigenen Tenant für **teacher**/**owner**/**admin** je nach Regelwerk; **user** nur eigene Buchungen **innerhalb** des Tenants); Feinjustierung darf in späteren Stories nachgezogen werden, **Cross-Tenant** bleibt verboten.
- [ ] Policies idempotent ablegbar (`DROP POLICY IF EXISTS` …), passend zur bisherigen Migrationspraxis im Repo.

### User Story US-E3-04 – SECURITY DEFINER-Funktionen und Trigger tenant-aware

**Als** Team **möchten wir** alle privilegierten Datenbankfunktionen (z. B. atomare Anmeldung, Warteliste, Zähler) auf **Tenant-Konsistenz** prüfen, **damit** RPCs nicht als Umgehung von RLS missbraucht werden können.

**Akzeptanzkriterien**

- [ ] Inventar der betroffenen Funktionen im PR (aus bestehenden Migrationen); jede Funktion: explizite Prüfung oder sicherer Kontext, sodass keine Aktion über Tenant-Grenzen möglich ist (Parameter + Abgleich mit `tenant_id` der betroffenen Zeilen).
- [ ] `search_path` bei **SECURITY DEFINER** gesetzt; keine unsicheren Delegationen.

### User Story US-E3-05 – Mandanten-Isolation verifizieren (DEV) und Release-Prozess

**Als** Team **möchten wir** nachweisen, dass **Tenant A** keine Daten von **Tenant B** lesen oder schreiben kann, **damit** Epic E3 abnahmefähig ist.

**Akzeptanzkriterien**

- [ ] Testmatrix (manuell oder automatisiert): mindestens zwei Tenants auf DEV, repräsentative SELECT/INSERT/UPDATE-Versuche mit zwei Nutzern; erwartetes Ergebnis dokumentiert (Screenshot, SQL-Log oder Testliste im PR).
- [ ] Migrationen nur gegen **DEV** eingespielt; PROD nur nach [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md).

---

### Epic E3 – Definition of Done (Epic-Ebene)

Epic E3 gilt als erledigt, wenn **alle** User Stories US-E3-01 bis US-E3-05 erfüllt sind, RLS für die genannten Kernbereiche **mandantensicher** ist und die Verifikation auf **DEV** dokumentiert wurde. **App-seitiger** Tenant-Kontext (Host, Routing) kann **Epic E4** ergänzen; E3 stellt die **DB-Durchsetzung** sicher.

---

## Epic E4 – Tenant-Kontext in der App

**Ziel:** Die React/Vite-Web-App ermittelt zuverlässig den **aktuellen Tenant** aus dem **HTTP-Host** (Subdomain oder später Custom Domain gemäß E0/E7) und hält diesen Kontext für Navigation, Datenabruf und Auth durchgängig konsistent. Nutzer agieren **nur innerhalb „ihrer“ Plattform**; es gibt keine UI, die Mandanten vermischt. Vollständiges **Onboarding-Provisioning** (Erstanlage Tenant) bleibt **Epic E5**; E4 liefert die **Laufzeit-Schicht** (Auflösung, State, Fehlerfälle, lokale Entwicklung).

**Abhängigkeiten:** Epic E0 (Host → Tenant, JWT falls nötig), Epic E1 (Tenant-Daten inkl. Slug/Host-Feldern), Epic E2 (Nutzer gehört zu Tenant), Epic E3 (RLS – technische Absicherung auch ohne perfekte App).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Gewählte Auflösungsstrategie (öffentlicher Read / RPC / Edge): _________________
- Lokaler DEV-Hostname / Workaround: _________________

### User Story US-E4-01 – Tenant aus `window.location.host` auflösen

**Als** Nutzer **möchte ich** die App unter der **URL meines Studios bzw. Lehrers** öffnen und korrekt der zugehörigen Plattform zugeordnet werden, **damit** ich nie aus Versehen eine andere Mandanteninstanz sehe.

**Akzeptanzkriterien**

- [ ] Beim App-Start wird der **Host** (oder die in E0 definierte Quelle) ausgewertet und in eine **`tenant_id`** (oder eindeutiges Tenant-Objekt) übersetzt – gemäß E0/E1 (z. B. Slug aus Subdomain, Match auf `tenants`, später Custom Domain in E7).
- [ ] Unbekannter oder ungültiger Host: **klare** Nutzer-Fehlerseite oder Redirect-Konzept (kein stilles Fallback auf „falschen“ Tenant).
- [ ] Kein hartcodierter Produktions-Host ohne Konfiguration; Umgebungsvariablen / `import.meta.env` wo sinnvoll (siehe US-E4-05).

### User Story US-E4-02 – `TenantProvider` / zentraler Kontext in der React-App

**Als** Entwicklungsteam **möchten wir** einen **einheitlichen** Tenant-Kontext (React Context o. Ä.), **damit** Seiten und Hooks nicht jedes Mal den Host parsen und keine inkonsistenten Zwischenzustände entstehen.

**Akzeptanzkriterien**

- [ ] Wiederverwendbarer Hook oder Context (z. B. `useTenant()`): liefert mindestens `tenantId`, Status (loading/ready/error) und Basis-Metadaten, die für die UI nötig sind.
- [ ] Während Tenant noch lädt: sinnvolles Loading-UI; nach Fehler: US-E4-01/Abbruchpfad.

### User Story US-E4-03 – Abgleich Session-Tenant vs. Host-Tenant

**Als** Produkt **möchten wir** verhindern, dass eine gültige Session **für Tenant B** auf **Host von Tenant A** genutzt wird, **damit** es kein Cross-Tenant-Arbeiten in der UI gibt (zusätzlich zu RLS).

**Akzeptanzkriterien**

- [ ] Nach erfolgreichem Login bzw. beim App-Resume: wenn `users.tenant_id` (aus Profil) **nicht** mit dem aus dem Host aufgelösten Tenant übereinstimmt → definiertes Verhalten (z. B. Abmelden + Hinweis, Link zum korrekten Host).
- [ ] Verhalten im PR kurz beschrieben und auf **DEV** mit zwei Test-Tenants überprüft.

### User Story US-E4-04 – Routen und Supabase-Client nutzen Tenant-Kontext

**Als** Team **möchten wir** sicherstellen, dass **zentrale** Datenabfragen und Navigation den Tenant-Kontext **implizit** respektieren, **damit** später keine Seite „ohne Tenant“ eingeführt wird.

**Akzeptanzkriterien**

- [ ] Bestehende Haupt-Routen / Layout-Wrapper: Zugriff nur, wenn Tenant-Kontext **ready** (oder bewusste öffentliche Ausnahme wie Landing **Epic E5** dokumentiert).
- [ ] Wo die App heute globale Filter setzt oder Annahmen über „eine Instanz“ trifft: angepasst oder als technische Schulden mit Verweis auf spätere Stories listen; **keine** neuen Queries ohne Tenant-Bezug dort.

### User Story US-E4-05 – Lokale Entwicklung ohne Wildcard-DNS

**Als** Entwickler **möchte ich** lokal und auf Preview-Umgebungen den Tenant-Kontext **simulieren**, **damit** die Arbeit nicht von produktionsnahem DNS abhängt.

**Akzeptanzkriterien**

- [ ] Dokumentiert in README oder [PRE_START_CHECK.md](PRE_START_CHECK.md) / verlinktem Dev-Doc: z. B. `hosts`-Datei, `VITE_*`-Variable für Standard-Tenant/Slug, oder Query-Parameter **nur in DEV** – mit Sicherheitshinweis, dass dieser Weg **nicht** produktiv exponiert wird.
- [ ] Team kann zwei Tenants lokal unterscheidbar testen (z. B. zwei Host-Einträge oder zwei Ports gemäß eurer Vite-Konfiguration).

---

### Epic E4 – Definition of Done (Epic-Ebene)

Epic E4 gilt als erledigt, wenn **alle** User Stories US-E4-01 bis US-E4-05 erfüllt sind, die App auf **DEV** mit mindestens **zwei** Mandanten über **unterschiedliche Hosts** (oder das dokumentierte DEV-Äquivalent) bedienbar ist und Session/Tenant-Mismatch sauber behandelt wird. **Branding** (Epic E8), **volles Onboarding** (Epic E5) und **Custom Domains** (Epic E7) können die Oberfläche erweitern, ohne E4 zurückzubauen.

---

## Epic E5 – Onboarding & Provisionierung

**Ziel:** Ein neuer Kunde (**Anbieter**, z. B. Studio oder einzelner Lehrer) kann sich über eine **Landingpage** oder einen vergleichbaren **öffentlichen Einstieg** registrieren, ein kurzes **Setup** (**Name**, **Slug**/Subdomain gemäß E1 — **lowercase**, **`[a-z0-9]`**; minimales Branding je nach Produktreife) durchlaufen und erhält danach einen **neuen Tenant** sowie den ersten Account mit Rolle **Owner**. **Kein** gespeichertes Tenant-Typ-Feld auf `tenants` (konsistent Epic E1 / [MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md](MVP_PRODUCT_BACKLOG_MEHRMANDANTEN.md)). Die Plattform ist unter der neuen Tenant-URL **unmittelbar nutzbar** (Login/Kernflows). **Custom Domains**, vollständiges Branding und **Cloudflare/DNS-Feinheit** sind **Epic E7** bzw. **Epic E8**; E5 liefert die **fachliche und technische Erstanlage** konsistent mit E0–E4.

**Abhängigkeiten:** Epic E0 (Flows, E-Mail), Epic E1–E2 (Schema), Epic E3 (sichere Policies bei öffentlichen/Edge-Schreibwegen), Epic E4 (Host-Kontext nach Redirect).

**Team-Notizen (bei Umsetzung ausfüllen):**

- URL-Konzept Landing (Marketing-Host vs. zentral): _________________
- Technik Provisionierung (Edge Function / RPC / App-only): _________________

### User Story US-E5-01 – Öffentlicher Einstieg: Landing & Start „Neue Plattform“

**Als** Interessent **möchte ich** von einer verständlichen Seite aus das Onboarding starten, **damit** ich ohne bestehenden Tenant eine eigene Plattform anlegen kann.

**Akzeptanzkriterien**

- [ ] Einstiegspunkt (Route/Seite) ist **ohne** vorherigen Tenant-Kontext nutzbar – gemäß E0 (z. B. eigener Marketing-Host oder ausdrücklich dokumentierte Ausnahme in E4).
- [ ] Klare CTAs zum Start des Setups (**US-E5-02**); **keine** Auswahl, die ein `tenant_type` o. ä. in der Datenbank speichert (konsistent E1).
- [ ] Barrierefreiheit und Texte product-ready auf MVP-Niveau.

### User Story US-E5-02 – Setup-Formular: Name, Slug/Subdomain, minimales Branding

**Als** Interessent **möchte ich** Namen und **technische Adresse** (Subdomain-Slug) sowie **minimale** Branding-Angaben festlegen, **damit** meine Plattform erkennbar und erreichbar ist.

**Akzeptanzkriterien**

- [ ] Pflichtfelder: Anzeigename des Tenants; **Slug** gemäß E1 (**lowercase**, nur **`[a-z0-9]`**, Länge teamseitig); optional/minimal: Primärfarbe oder Logo-Upload-Stub – volles Theme **Epic E8**.
- [ ] Client- und serverseitige Validierung: erlaubte Zeichen, Länge, reservierte Slugs; **Konflikt** bei bereits vergebenem Slug mit verständlicher Meldung.
- [ ] DSGVO-/Consent-Felder wie in bestehender App-Pflicht fortgeführt, falls Registrierung personenbezogene Daten erfasst.

### User Story US-E5-03 – Provisionierung: Tenant + Owner-Account atomar

**Als** System **möchte ich** Tenant-Zeile, **Auth-Nutzer** und **Profil** mit `tenant_id` und Rolle **owner** **konsistent** anlegen, **damit** kein Zustand „Tenant ohne Owner“ oder „User ohne Tenant“ entsteht.

**Akzeptanzkriterien**

- [ ] Technische Umsetzung gemäß E0 (SignUp, ggf. Service Role nur serverseitig abgesichert); keine Secrets im Client.
- [ ] Bei Fehler in einem Teilschritt: definiertes Verhalten (Rollback, erneuter Versuch, Support-Hinweis); auf **DEV** Happy Path und mindestens ein Fehlpfad demonstrabel.
- [ ] RLS/Policies: Schreibrechte für diesen Flow explizit geprüft (z. B. dedizierte **Edge Function** oder **RPC** mit Auditing).

### User Story US-E5-04 – Abschluss: Redirect, erste Nutzung, Dokumentation

**Als** neuer Owner **möchte ich** nach dem Setup auf **meiner** Plattform-URL landen und arbeiten können, **damit** der Onboarding-Wert sofort spürbar ist.

**Akzeptanzkriterien**

- [ ] Redirect zur Tenant-URL gemäß E4/E7-MVP (z. B. `https://{slug}.{basisdomain}`); in **DEV** gemäß dokumentiertem Workaround aus US-E4-05.
- [ ] Smoke-Test auf **DEV**: neuer Tenant, Login als Owner, eine Kernfunktion (z. B. Kursliste/Dashboard) sichtbar ohne Cross-Tenant-Daten.
- [ ] Kurze Anleitung für das Team (README-Aufzählung oder Link): „Neuen Mandanten auf DEV anlegen“.

---

### Epic E5 – Definition of Done (Epic-Ebene)

Epic E5 gilt als erledigt, wenn **alle** User Stories US-E5-01 bis US-E5-04 erfüllt sind und ein **End-to-End-Durchlauf** auf **DEV** von Landing bis erster Nutzung unter dem neuen Tenant dokumentiert ist. **Einladungen mit Rolle teacher** (Kursleiter) bleiben **Epic E6**; **Custom Domain** **Epic E7**.

---

## Epic E6 – Studio: Lehrer-Verwaltung (Rolle **teacher**)

**Ziel:** Der **owner** kann Nutzer **innerhalb desselben Tenants** anlegen oder einladen und ihnen die Rolle **teacher** zuweisen oder entziehen (Höherstufen zu **admin** o. Ä. kann später ergänzt werden; kanonisches Modell **E2**). Es gibt **keine** technische oder fachliche Verknüpfung zu anderen Mandanten; dieselbe Person in mehreren Mandanten hat **mehrere unabhängige Accounts**. **Ohne** `tenant_type`-Feld (Epic E1) steuert das Team **Sichtbarkeit und Nutzen** der Lehrer-Verwaltung über Produktregeln (z. B. nur für **owner**; bei Ein-Personen-Mandanten eingeschränkte oder leere UI — im PR dokumentiert). Verwaltung reiner **user** kann sich mit bestehenden Flows überschneiden; Fokus von E6 ist die Rolle **teacher** unter **owner**.

**Abhängigkeiten:** Epic E2 (Rollen), Epic E3 (RLS), Epic E4 (Kontext), Epic E5 (Owner existiert); Einladungs-/E-Mail-Mechanik gemäß E0.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Einladung: Magic Link vs. Passwort-Setzen vs. manuelle Anlage: _________________

### User Story US-E6-01 – UI: Lehrer-Verwaltung für **owner**

**Als** owner **möchte ich** eine dedizierte Verwaltung für **Kursleiter (Rolle teacher) meines Mandanten** sehen, **damit** ich Kursleitungen zentral steuern kann.

**Akzeptanzkriterien**

- [ ] Menü/Seite nur sichtbar für Nutzer mit Rolle **owner** (E2); **kein** Check auf `tenant_type` (existiert nicht auf `tenants`). Optional: Produktregel „Oberfläche ausblenden oder minimieren, wenn fachlich nur der owner als Kursleiter agiert“ — im PR dokumentiert, ohne Schema-Erweiterung E1.
- [ ] Liste der Nutzer im eigenen Tenant mit Rolle **teacher** (und ggf. Filter); keine Daten anderer Tenants.

### User Story US-E6-02 – Kursleiter hinzufügen: Einladung oder Anlage im eigenen Tenant

**Als** owner **möchte ich** neue Kursleiter **in meinem Mandanten** aufnehmen, **damit** sie Kurse **in diesem** Mandanten führen können.

**Akzeptanzkriterien**

- [ ] Flow gemäß E0: Einladung per E-Mail und/oder direkte Benutzeranlage mit `tenant_id` des Mandanten; erster Login landet auf **derselben** Tenant-URL (E4).
- [ ] Neu angelegte bzw. angenommene Nutzer erhalten Rolle **teacher**; **user** bleibt für reine Teilnehmer reserviert.
- [ ] Kollisionen: E-Mail bereits im **gleichen** Tenant → verständliche Fehlermeldung (E2-Eindeutigkeit).

### User Story US-E6-03 – Rolle **teacher** ändern oder Zugriff entziehen

**Als** owner **möchte ich** Kursleiter **herabstufen**, **entfernen** oder **sperren** (je nach Produktentscheid), **damit** ich die Plattform schützen kann.

**Akzeptanzkriterien**

- [ ] owner kann Nutzer mit Rolle **teacher** z. B. auf **user** setzen oder Benutzer deaktivieren (konkretes Modell im PR dokumentiert); **Self-Lockout** des letzten **owner** verhindern.
- [ ] Alle Änderungen wirken nur auf Nutzer mit **gleicher** `tenant_id`; Bestätigungsdialog bei destruktiven Aktionen auf MVP-Niveau.

### User Story US-E6-04 – RLS und API: Nur **owner** verwaltet **teacher** im Tenant

**Als** Team **möchten wir** sicherstellen, dass **nur berechtigte** owner Mutations ausführen können, **damit** **teacher** oder **user** keine fremden Rollenzuweisungen vornehmen.

**Akzeptanzkriterien**

- [ ] Policies und/oder **RPC** prüfen: aufrufender Nutzer ist **owner** im **Ziel-Mandanten**; `tenant_id` der Zielnutzer stimmt überein.
- [ ] Negative Tests auf **DEV**: **teacher**/**user** kann die Verwaltungs-Endpoints nicht erfolgreich aufrufen; kein Cross-Tenant.

### User Story US-E6-05 – Abnahme und Dokumentation

**Als** Team **möchten wir** den Flow abgesichert dokumentieren, **damit** Support und Onboarding klar kommunizieren können.

**Akzeptanzkriterien**

- [ ] Kurzbeschreibung im PR oder Wiki: „So nimmt ein owner Kursleiter (Rolle **teacher**) im Mandanten auf“ + Grenzen (kein mandantenübergreifendes Konto).
- [ ] DEV: Zwei Mandanten, derselbe E-Mail-Kontext nur wenn E0-Strategie das erlaubt; sonst zwei verschiedene Adressen testen.

---

### Epic E6 – Definition of Done (Epic-Ebene)

Epic E6 gilt als erledigt, wenn **alle** User Stories US-E6-01 bis US-E6-05 erfüllt sind und **owner** auf **DEV** Kursleiter (Rolle **teacher**) **nur** innerhalb ihres Tenants verwalten können. **Domains** (E7) und erweitertes **Branding** (E8) sind nicht Teil von E6.

---

## Epic E7 – Domains & Routing

**Ziel:** Jeder Tenant ist unter einer **eigenen erreichbaren Adresse** nutzbar: **MVP** typischerweise **Wildcard-Subdomain** (`{slug}.basisdomain`); **danach** (oder parallel nach Spike E0) **eigene Domain** (Custom Domain) mit DNS-/Cloudflare-Konfiguration und **TLS**. Die App löst den **HTTP-Host** wie in **E4** beschrieben zuverlässig in `tenant_id` auf; Datenhaltung in `tenants` (E1) wird um domainbezogene Felder/Status ergänzt, soweit noch nicht vorhanden. Keine Produktions-Secrets oder PROD-Domain-Keys im Repo (siehe [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md)).

**Abhängigkeiten:** Epic E0 (Domain-Skizze), Epic E1 (Slug/Host-Felder), Epic E4 (Host-Auswertung), Epic E5 (Slug aus Onboarding); optional Zusammenspiel mit **E8** (Links in Mails mit korrektem Host).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Basisdomain Produktion / Preview: _________________
- Cloudflare: Wildcard-Domain aktiviert (Datum): _________________

### User Story US-E7-01 – Produktions-MVP: Wildcard-Subdomain & TLS

**Als** Betrieb **möchten wir** eine **Wildcard-Subdomain** auf die Cloudflare-Site legen und gültiges **TLS** erhalten, **damit** alle Mandanten unter `{slug}.<Basisdomain>` erreichbar sind.

**Akzeptanzkriterien**

- [ ] DNS + Cloudflare: Wildcard (z. B. `*.yoga-app.com`) dokumentiert; nach Deployment testbar mit mindestens **zwei** Slugs auf **Production** oder vereinbarter Staging-Umgebung.
- [ ] Keine Warnungen in Browsern bei HTTPS für die Test-Subdomains; Ablauf **dokumentiert** für das Team (nicht nur „funktioniert bei mir“).

### User Story US-E7-02 – Host → Tenant: Auflösungsreihenfolge und Datenbankfelder

**Als** Team **möchten wir** festlegen und implementieren, wie **exakter Host** (inkl. Kleinbuchstaben/`www`) auf genau **einen** Tenant zeigt, **damit** E4 und Backend konsistent sind.

**Akzeptanzkriterien**

- [ ] Regel dokumentiert und umgesetzt: z. B. zuerst **Custom Domain** exakter Match, sonst **Subdomain-Slug** aus erstem Label; Doppelbelegung ausgeschlossen (Unique-Constraints/Validierung).
- [ ] Migration falls nötig: Spalten wie `custom_domain`, `custom_domain_verified_at`, Normalisierung (ohne `https://`, lowercase) – idempotent; **DEV** zuerst.

### User Story US-E7-03 – Custom Domain: DNS-Anleitung und Verifizierung

**Als** Tenant-Owner **möchte ich** meine **eigene Domain** nutzen können, **damit** meine Plattform unter meiner Marke erreichbar ist.

**Akzeptanzkriterien**

- [ ] Schritt-für-Schritt für Kunden: DNS-Einträge (CNAME/ANAME o. Ä. je nach Cloudflare), erwartete Propagierungszeit, was wir **nicht** automatisieren (MVP zulässig).
- [ ] Technische Verifizierung: Domain ist korrekt zugeordnet, bevor die App sie akzeptiert (z. B. Cloudflare-Status auswerten oder manueller Check mit dokumentiertem Prozess).

### User Story US-E7-04 – UI / Owner-Einstellungen: Domain anzeigen und Status

**Als** Owner **möchte ich** in den Einstellungen **Subdomain** und optional **Custom Domain** mit **Status** sehen, **damit** ich Support-Probleme eingrenzen kann.

**Akzeptanzkriterien**

- [ ] Lesbare Anzeige: aktuelle Basis-URL, eingerichtete Custom Domain, Verifizierungsstatus (Pending/Active/Fehler); kein Leak fremder Tenants.
- [ ] Aktionen nur **owner**; Schreiboperationen tenant-sicher (E3).

### User Story US-E7-05 – Redirects, `www` und Betriebshandbuch

**Als** Team **möchten wir** häufige Domain-Randfälle abfangen und **betrieblich** dokumentieren, **damit** weniger „Seite leer“-Tickets entstehen.

**Akzeptanzkriterien**

- [ ] Entscheidung + Umsetzung oder Cloudflare-Redirect: `www` → kanonische Host-Form (oder umgekehrt), dokumentiert.
- [ ] Kurzes **Betriebshandbuch** im Repo oder verlinkt: neue Basisdomain, Kunden-DNS-Issues, was in Cloudflare vs. Supabase vs. DNS zu prüfen ist.

---

### Epic E7 – Definition of Done (Epic-Ebene)

Epic E7 gilt als erledigt, wenn **alle** User Stories US-E7-01 bis US-E7-05 erfüllt sind, **Subdomain-MVP** produktionsfähig ist und der **Custom-Domain**-Weg nachvollziehbar für mindestens einen Testfall funktioniert. **Branding** (Logo/Farben tiefer) bleibt **Epic E8**.

---

## Epic E8 – Branding

**Ziel:** Jeder Tenant kann **Logo**, **Farben** (mindestens Primär-/Akzentfarben) und ggf. weitere sichtbare Markenelemente **selbst pflegen**; die Web-App wendet sie **konsistent** in Shell/Navigation und zentralen Oberflächen an (über Tenant-Kontext E4). Speicherung erfolgt **mandantengekoppelt** (DB und/oder Supabase **Storage** mit passenden RLS-Policies). Onboarding **E5** kann weiterhin „minimal“ starten; **E8** vertieft Pflege und Darstellung. E-Mails/Vorlagen mit Branding können auf vorhandene Systeme verweisen (z. B. [EMAIL_SYSTEM_DOCUMENTATION.md](../EMAIL_SYSTEM_DOCUMENTATION.md)) und in E8 nur wo nötig ergänzt werden.

**Abhängigkeiten:** Epic E1 (`tenants`), Epic E3 (RLS/Storage-Policies), Epic E4 (`useTenant` / Metadaten), Epic E7 (korrekte öffentliche URLs für Assets, falls absolute Links).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Storage-Bucket-Name / Zugriffsregeln: _________________
- Design-Tokens (CSS-Variablen vs. Theme-Provider): _________________

### User Story US-E8-01 – Datenmodell: Branding-Felder am Tenant

**Als** Produkt **möchten wir** Branding-Daten **pro Tenant** persistieren, **damit** App und ggf. Serverfunktionen eine **einzige Quelle** nutzen.

**Akzeptanzkriterien**

- [ ] Migration (idempotent): Felder z. B. `primary_color`, `accent_color`, `logo_storage_path` oder `logo_url`, optional `favicon_*` – genaue Namen im Team vereinheitlicht; **DEV** zuerst.
- [ ] Sinnvolle Defaults, wenn Felder leer; keine Breaking Changes für bestehende Tenants ohne manuelle Nachpflege (Fallback sichtbar).

### User Story US-E8-02 – Logo-Upload über Supabase Storage (mandantensicher)

**Als** Owner **möchte ich** mein **Logo** hochladen, **damit** es in der App und ggf. in Kommunikation genutzt werden kann.

**Akzeptanzkriterien**

- [ ] Bucket/Struktur z. B. `{tenant_id}/…`; RLS/Policies: **nur** Nutzer des Tenants dürfen schreiben/lesen (Owner/Admin-Rolle gemäß E2); Öffentlichkeit nur wenn bewusst über **öffentliche URL** oder signierte URLs – Entscheidung dokumentiert.
- [ ] Validierung: Dateityp, Max-Größe; sinnvolle Fehlermeldungen; altes Logo bei Ersetzung aufräumen oder Versionierung (Teamentscheid).

### User Story US-E8-03 – App: Theme aus Tenant-Kontext anwenden

**Als** Nutzer **möchte ich** beim Besuch einer Plattform **Farben und Logo** des Tenants sehen, **damit** ich mich auf der richtigen Marke befinde.

**Akzeptanzkriterien**

- [ ] Nach Auflösung des Tenants (E4): CSS-Variablen oder Theme-Provider setzen **primary**/**accent**; Logo in Header/Sidebar o. Ä.; **Favicon** wenn Feld gesetzt.
- [ ] Kein Flackern langfristig akzeptabel: Ladezustand oder Default-Theme bis Daten da sind (E4-Lade-UX).

### User Story US-E8-04 – Owner-UI: Branding bearbeiten und Vorschau

**Als** Owner **möchte ich** Branding in den **Einstellungen** anpassen, **damit** ich ohne Entwickler auskomme.

**Akzeptanzkriterien**

- [ ] Formular: Farbauswahl (Picker o. Ä.), Logo-Upload, Speichern/Rücksetzen auf Defaults; nur **owner** (E3).
- [ ] Kurze **Vorschau** oder Live-Update der Shell-Komponenten auf MVP-Niveau.

### User Story US-E8-05 – Qualität: Kontrast, zwei Tenants, Doku

**Als** Team **möchten wir** Branding **qualitäts- und mandantensicher** abliefern, **damit** keine unsichtbaren Buttons oder Cross-Tenant-Leaks entstehen.

**Akzeptanzkriterien**

- [ ] Kurz prüfen: Kontrast Primärtext/Hintergrund (WCAG-Ziel im Team festlegen, mind. manuell zwei Farbsets); keine harten Annahmen „weißer Hintergrund überall“, wenn Tenant dunkle Farben wählt.
- [ ] **DEV:** zwei Tenants mit unterschiedlichem Branding parallel sichtbar unter verschiedenen Hosts (E7/E4); kurzer Abschnitt in README oder Dev-Doc „Branding testen“.

---

### Epic E8 – Definition of Done (Epic-Ebene)

Epic E8 gilt als erledigt, wenn **alle** User Stories US-E8-01 bis US-E8-05 erfüllt sind, Owner ihr Branding **in der App sichtbar** haben und Mandantentrennung bei Storage/Metadaten gewahrt bleibt. Tiefe **fachliche** UI-Umgestaltung aller Screens kann in Folge-Tasks erfolgen; E8 liefert **Kern-Sichtbarkeit** und **Pflege**.

---

## Epic E9 – Fachlogik mandantenreif

**Ziel:** Die **gesamte sichtbare Produktlogik** der YogaFlow-Web-App arbeitet **konsistent** im Mandanten-Kontext: Kurse, Buchungen, Wartelisten, Nachrichten, Serien/Wiederholungen und alle darauf aufbauenden **RPCs**, Trigger und Zähler. Wo **E3** bereits `tenant_id` und RLS geliefert hat, stellt E9 sicher, dass **Frontend-Queries**, **Filter**, **Auswahllisten** (z. B. Lehrer für ein neues Kursdatum) und **Edge Cases** keine Daten aus anderen Tenants anzeigen oder fälschlich verknüpfen. **Epic E10** klärt globale Einstellungen separat; E9 fokussiert den **Kern-Fachteil** des bestehenden YogaApp2.

**Abhängigkeiten:** Epic E3 (Schema/RLS-Basis), Epic E4 (Tenant-Kontext), Epic E2 (Rollen); optional E6 für Auswahl von Kursleitern (**teacher**) innerhalb eines Studios.

**Team-Notizen (bei Umsetzung ausfüllen):**

- Betroffene Screens/APIs (kurz): _________________
- Bekannte Altlasten / Follow-ups: _________________

### User Story US-E9-01 – Kurse: Erstellung, Bearbeitung, Listen und Lehrerbezug im Tenant

**Als** Team **möchten wir** die Kursfunktion **vollständig** im Mandanten-Kontext ausführen, **damit** Plattformen sich nicht gegenseitig Kurse oder Kursleiter „ansehen“.

**Akzeptanzkriterien**

- [ ] Alle relevanten Views/APIs (z. B. Kursliste, Dashboard, Kursdetails): Daten **nur** aus dem aktuellen `tenant_id` (über RLS und/oder explizite Filter).
- [ ] Auswahl des **Kursleiters** / `teacher_id`: nur Nutzer **desselben** Tenants mit geeigneter Rolle (**teacher** / **owner** / **admin** je nach Regelwerk); keine Foreign-Key-Zuordnung zu Nutzern fremder Tenants.
- [ ] **Serien** / `series_id` / wiederholende Logik: alle abgeleiteten Kurse bleiben im **gleichen** Tenant wie die Serie; Migration falls nötig dokumentiert.

### User Story US-E9-02 – Buchungen, Warteliste und Teilnehmer-Flows

**Als** Teilnehmer **möchte ich** nur Kurse **meiner** Plattform buchen; **Als** Kursleitung **möchte ich** nur Anmeldungen **meines** Tenants sehen.

**Akzeptanzkriterien**

- [ ] Anmeldung, Abmeldung, Wartelisten-Status, Promotion: UI und Serverpfade nutzen konsistent `tenant_id` (bzw. abgeleitete Kurs-Tenant-Kette); **atomare** oder privilegierte Funktionen (z. B. Registrierung) erneut auf Tenant-Kohärenz geprüft.
- [ ] Seiten wie „Meine Kurse“: keine Buchungen aus fremden Mandanten; Randfälle (abgelaufene Sessions) sauber.

### User Story US-E9-03 – Nachrichten (Messages) mandantenreif

**Als** Nutzer **möchte ich** nur Nachrichten **innerhalb** der Communication meines Tenants senden und lesen.

**Akzeptanzkriterien**

- [ ] `messages`-Bezug zu `courses` respektiert implizit/explizit den Tenant; UI listet keine fremden Threads.
- [ ] Broadcast-/Kursleiter-Fälle: Empfänger- und Absenderregeln mit E3-Policies abgestimmt; Negative Tests auf DEV.

### User Story US-E9-04 – Hilfsfunktionen, Trigger, Zähler und Randtabellen

**Als** Team **möchten wir** **alle** Datenbank-Hilfsmittel inventarisieren, die Kurse, Anmeldungen oder Nutzer berühren, **damit** keine technische Umgehung der Mandantenisierung existiert.

**Akzeptanzkriterien**

- [ ] Inventar im PR: Funktionen (Teilnehmerzahlen, Validierungen, Waitlist-Promotion, Cron-ähnliche Logik falls vorhanden), relevante Trigger; jeder Eintrag: **tenant-safe** oder mit Ticket für E10/E12 versehen.
- [ ] `global_settings` und ähnliche Tabellen: in E9 **nicht** neu erfunden – wenn App sie noch nutzt, Verhalten dokumentiert und **Epic E10** für tenant/global-Spaltung eingeplant.

### User Story US-E9-05 – Regression: zwei Mandanten, Kernflows, Release-Hinweise

**Als** Team **möchten wir** Epic E9 **abnahmefähig** machen mit wiederholbarem Testvorgehen.

**Akzeptanzkriterien**

- [ ] Checkliste (manuell oder Testdoku): mindestens zwei Tenants auf **DEV** – parallel Kurse anlegen, buchen, Nachricht senden, Kursteilnehmerliste – **ohne** Datenlecks.
- [ ] PR/Release-Notes: welche Screens geändert; Hinweis auf Migrationen und [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) bei go-live.

---

### Epic E9 – Definition of Done (Epic-Ebene)

Epic E9 gilt als erledigt, wenn **alle** User Stories US-E9-01 bis US-E9-05 erfüllt sind und die **Kern-YogaFlow-Funktionen** mandantensicher auf **DEV** nachweisbar laufen. Feintuning einzelner Sonderfälle kann als Follow-up Tickets geführt werden, wenn im PR benannt.

---

## Epic E10 – Einstellungen & Sonderfälle

**Ziel:** Konfigurationswerte, die heute in **`global_settings`** (oder vergleichbaren Key/Value-Strukturen) zentral liegen, werden **fachlich** in **tenant-spezifische** und optional **wirklich globale** (plattformweite) Einstellungen **getrennt**. Tenant-Owner können dort pflegen, was pro Plattform Sinn ergibt (z. B. Standard-Max-Teilnehmer, Stornierungsfristen, ggf. Textbausteine – je nach bestehender Nutzung im Repo). **Plattform-weite** Sonderfälle (z. B. Wartung, zentrales Feature-Flagging) werden explizit benannt; wird **kein** Betreiber-Backoffice benötigt, bleiben globale Keys minimal und nur für Entwicklung/Betrieb. **RLS** stellt sicher, dass Mandanten **nur** ihre eigenen Settings lesen/schreiben. Anknüpfung an E-Mail-/Vorlagen-Doku optional über [EMAIL_SYSTEM_DOCUMENTATION.md](../EMAIL_SYSTEM_DOCUMENTATION.md).

**Abhängigkeiten:** Epic E1 (`tenants`), Epic E3 (RLS-Muster), Epic E4 (Tenant-Kontext in der App), Epic E9 (Inventar aus US-E9-04).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Liste der Keys: tenant vs. global (Anhang PR): _________________
- Entscheidung „Plattform-Admin“-Rolle (ja/nein; falls nein: nur Owner pro Tenant): _________________

### User Story US-E10-01 – Inventar: bestehende Settings-Keys klassifizieren

**Als** Team **möchten wir** alle relevanten Konfigurationsschlüssel und ihre Verwendung in Code/DB **erfassen**, **damit** keine versehentliche Globallogik in der Multi-Tenant-Welt hängen bleibt.

**Akzeptanzkriterien**

- [ ] Tabelle/Matrix im PR oder angehängtes Doc: Key → aktuelle Semantik → Klassifikation **tenant** | **global (Plattform)** | **deprecated**; Verweise auf betroffene Dateien/Funktionen.
- [ ] Abstimmung Produkt/PO: welche Werte **Owner** ändern darf vs. nur lesen vs. nur Betrieb.

### User Story US-E10-02 – Datenmodell: tenant-bezogene Einstellungen persistieren

**Als** Team **möchten wir** tenant-spezifische Konfiguration **normalisiert** speichern, **damit** Abfragen und Policies einheitlich bleiben.

**Akzeptanzkriterien**

- [ ] Migration (idempotent): z. B. `tenant_settings (tenant_id, key, value jsonb, …)` **oder** Erweiterung bestehender Struktur mit `tenant_id` **nur** für tenant-scoped Rows; globale Keys in separater Tabelle oder markiert – im PR begründet.
- [ ] Backfill von bisherigen `global_settings`-Werten: sinnvoller Default **pro bestehendem Tenant** (z. B. Kopie aktueller Werte auf DEV); PROD nur nach Freigabe.

### User Story US-E10-03 – RLS und Zugriffsregeln für Einstellungen

**Als** Team **möchten wir** mandantensichere Policies für Einstellungen, **damit** weder **user** noch fremde Tenants Werte lesen oder ändern können.

**Akzeptanzkriterien**

- [ ] **Tenant-Settings:** SELECT/INSERT/UPDATE/DELETE nur für berechtigte Rollen (**owner**, ggf. **admin** / **teacher** read-only je nach Matrix) und nur mit passender `tenant_id`.
- [ ] **Globale Settings** (falls beibehalten): Zugriff eingeschränkt auf **Service Role** oder explizit definierte Betriebsrolle – kein Breach über `authenticated`-Policies.

### User Story US-E10-04 – App & Serverlogik: Lesen und Schreiben über Tenant-Kontext

**Als** Produkt **möchte ich**, dass die App **immer** die Einstellungen **des aktuellen Tenants** verwendet, **damit** Fristen und Defaults pro Plattform stimmen.

**Akzeptanzkriterien**

- [ ] Alle bisherigen Leser von `global_settings`, die fachlich tenant-sind, auf neue Quelle umgestellt oder übergangsweise mit Fallback dokumentiert.
- [ ] Schreibpfade (Owner-UI oder API) setzen `tenant_id` zuverlässig; keine Client-übergreifende Caches ohne Tenant-Schlüssel.

### User Story US-E10-05 – Owner-Oberfläche (optional MVP) und Betriebs-Doku

**Als** Owner **möchte ich** (zumindest für Kernparameter) Einstellungen **ohne SQL** anpassen; **Als** Betrieb **möchte ich** globale Sonderfälle dokumentiert haben.

**Akzeptanzkriterien**

- [ ] UI oder administrativer Prozess für die in US-E10-01 als **owner-editierbar** markierten Keys – mindestens ein End-to-End-Beispiel auf **DEV**; wenn UI später: explizit „Phase 2“ mit Datum/Ticket.
- [ ] Kurzabschnitt in Doku: Was ist **global**, was **tenant**; wie Support globale Änderungen anfragt (ohne PROD-Secrets im Repo).

---

### Epic E10 – Definition of Done (Epic-Ebene)

Epic E10 gilt als erledigt, wenn **alle** User Stories US-E10-01 bis US-E10-05 erfüllt sind, tenant-relevante Konfiguration **nicht mehr unausgewiesen global** in der fachlichen Wirkung liegt und auf **DEV** mit zwei Tenants **unterschiedliche** Einstellungswerte nachweisbar sind (wo produktseitig vorgesehen).

---

## Epic E11 – Qualität, Sicherheit, Betrieb

**Ziel:** Multi-Tenant wird **nachweislich** sicher und **betreibbar**: wiederholbare Prüfungen (manuell oder automatisiert), **Security-Review** der sensiblen Stellen, Baselines für Performance und ein **minimaler** Betriebsrahmen (wer reagiert wie bei Verdacht auf Mandantenvermischung oder Schema-Problemen). E11 ist ein **Querschnitts-Epic** und wird typischerweise **kontinuierlich** bis zum Go-Live und danach gepflegt; die User Stories bündeln die „Pflicht vor erstem PROD-Cutover“ vs. „laufend“.

**Abhängigkeiten:** Epic E3, E7, E9 mindestens weitgehend umgesetzt; Verweise auf [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md), [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md), [SCHEMA_ROLLBACK_WORKFLOW.md](SCHEMA_ROLLBACK_WORKFLOW.md).

**Team-Notizen (bei Umsetzung ausfüllen):**

- Datum letzter **Mandanten-Isolation-Review**: _________________
- Verantwortliche für Security-Checkliste: _________________

### User Story US-E11-01 – Testpaket: Mandanten-Isolation (regressionsfähig)

**Als** Team **möchten wir** ein **wiederholbares** Testpaket für „Tenant A darf nichts von Tenant B“, **damit** Regressions nach Features erkennbar sind.

**Akzeptanzkriterien**

- [ ] Dokumentierte Schrittfolge oder automatisierte Tests: Kernflows (Kurse, Buchungen, Messages, Settings) mit **zwei** Tenants und zwei Nutzerkonten; erwartetes Ergebnis pro Schritt.
- [ ] Ablageort benannt (Repo-Datei, Wiki, Test-Tool); bei rein manueller Liste: Review-Zyklus vereinbart (z. B. vor jedem Major-Release).

### User Story US-E11-02 – Security-Review: RLS, Storage, RPCs, Auth-Kanten

**Als** Team **möchten wir** eine zweite Person (oder externes Review) die **kritischen** Mandanten-Grenzen prüfen lassen, **damit** keine bekannten Anti-Patterns übersehen werden.

**Akzeptanzkriterien**

- [ ] Checkliste abgearbeitet: `tenant_id`-Lücken, Policies mit zu breitem `USING`, `SECURITY DEFINER` ohne Tenant-Check, öffentliche Storage-URLs, JWT/Session-Mismatch (E4).
- [ ] Ergebnis dokumentiert: OK / Nacharbeit mit Tickets; keine Blocker für PROD ohne Entscheidung.

### User Story US-E11-03 – Performance-Baseline für mandantenbezogene Abfragen

**Als** Team **möchten wir** typische Queries mit **tenant-Filter** nicht erst in PROD entdecken, **damit** die UX stabil bleibt.

**Akzeptanzkriterien**

- [ ] Index-Review auf `tenant_id` (und häufige Verbund-Keys) mit den in E3/E9 genutzten Pfaden; nachziehen wo messbar sinnvoll.
- [ ] Kurznotiz im PR oder Doc: „Smoke mit Datenvolumen X“ (auch wenn künstlich), Schwellen nur grob.

### User Story US-E11-04 – Betrieb: Eskalation und Logging-Hinweise

**Als** Betrieb **möchte ich** wissen, **was** bei Verdacht auf Datenvermischung oder Auth-Problemen zu tun ist.

**Akzeptanzkriterien**

- [ ] Ein Absatz „Playbook“: erste Diagnose (falscher Host, Session, Policy), wann [ROLLBACK.md](ROLLBACK.md) vs. [SCHEMA_ROLLBACK_WORKFLOW.md](SCHEMA_ROLLBACK_WORKFLOW.md).
- [ ] Optional: welche Log- oder Audit-Signale in Supabase/Cloudflare genutzt werden können – ohne Implementierungspflicht, wenn nicht vorhanden.

### User Story US-E11-05 – Release-Disziplin und wiederkehrende Prüfung

**Als** Team **möchten wir** sicherstellen, dass **Schema-Releases** und **PROD-Pushes** den YogaFlow-Workflows folgen, **damit** Multi-Tenant nicht durch Ausnahmen unterlaufen wird.

**Akzeptanzkriterien**

- [ ] Verweis im Team-Onboarding: Branch `Julius`, PR nach `main`, Migration nur nach [WORKFLOW_CHEATSHEET.md](WORKFLOW_CHEATSHEET.md) bzw. verlinkten Docs.
- [ ] Vor großem PROD-Cutover (E12): E11-Checkliste erneut kurz durchgehen.

---

### Epic E11 – Definition of Done (Epic-Ebene)

Epic E11 gilt für einen **Meilenstein** als erledigt, wenn **US-E11-01 bis US-E11-05** für die zum Zeitpunkt relevanten Releases abgenommen sind und die **Security-Review-Dokumentation** vorliegt. Laufende Wiederholung der Tests bleibt **Betriebssache**, nicht „einmalig Epic schließen“.

---

## Epic E12 – Migration Bestand (DEV/PROD)

**Ziel:** Bestehende **PROD**-Daten und -Nutzer werden **ohne** Mandantenbruch auf das Multi-Tenant-Modell gehoben: Strategie für **Default-Tenant** oder Aufteilung, **Backfill** aller `tenant_id`-Pflichtfelder, **geordnete** Anwendung der Migrationen auf PROD nach der Projektkultur ([DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md), [SCHEMA_RELEASE_WORKFLOW.md](SCHEMA_RELEASE_WORKFLOW.md)). E12 ist **koordinierend**: konkrete SQL-Schritte hängen vom Ist-Stand zum Migrationszeitpunkt ab und werden im PR/Runbook festgehalten – **keine** ad-hoc-Änderungen an PROD-Daten ohne Freigabe.

**Abhängigkeiten:** Epics **E1–E3** und **E9** fachlich stabil auf **DEV**; Epic **E11** Security-Baseline vor PROD-Schritt.

**Team-Notizen (bei Umsetzung ausfüllen):**

- PROD-Fenster / Verantwortliche: _________________
- Name Default-Tenant / Rechtemapping: _________________

### User Story US-E12-01 – Migrationsstrategie und Risikoabschätzung (Runbook)

**Als** Team **möchten wir** ein **schriftliches Runbook** für den PROD-Cutover, **damit** alle Beteiligten dieselbe Reihenfolge und Rollback-Erwartung haben.

**Akzeptanzkriterien**

- [ ] Beschreibung: Default-Tenant für Legacy-Daten **oder** explizite Aufteilung (wenn nicht zutreffend: begründen); Auswirkungen auf URLs/E4/E7.
- [ ] Risiken, Downtime-Erwartung, Kommunikation an Stakeholder; Verweis auf [DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md](DATABASE_WORKFLOW_SCHRITT_FÜR_SCHRITT.md) wenn genutzt.

### User Story US-E12-02 – Generalprobe auf DEV (Datenstand nahe PROD-Struktur)

**Als** Team **möchten wir** die **gesamte** Migrationskette auf **DEV** mit realistischem Umfang testen, **damit** Überraschungen auf PROD minimiert werden.

**Akzeptanzkriterien**

- [ ] Alle relevanten Migrationen von „vor Multi-Tenant“ bis „Zielschema“ auf frischer oder kopiennaher DEV-DB durchgespielt; Smoke der App.
- [ ] Abweichungen zu PROD (Datenvolumen, Sonderzeilen) dokumentiert.

### User Story US-E12-03 – PROD: Backup, Fenster, `db push` / Schema-Anwendung

**Als** Team **möchten wir** PROD-Schemaänderungen **nur** nach Checkliste anwenden.

**Akzeptanzkriterien**

- [ ] Pre-PROD-Checkliste aus [DEV_PROD_SAFETY_WORKFLOW.md](DEV_PROD_SAFETY_WORKFLOW.md) abgehakt; Backup-Zeitpunkt notiert.
- [ ] Migrationen in der vereinbarten Reihenfolge angewendet; **danach** Live-Checks (Login, Buchung, zwei Tenants wenn schon produktiv getrennt).

### User Story US-E12-04 – Nach dem Cutover: Verifikation und Kommunikation

**Als** Produkt **möchte ich** bestätigen, dass Live **mandantensicher** und nutzbar ist.

**Akzeptanzkriterien**

- [ ] Abnahme-Script kurz: kritische Pfade auf **PROD**; kein offenes Severity-High ohne Ticket.
- [ ] „Grün“-Kommunikation an Team/Partner; bekannte Follow-ups gelistet.

### User Story US-E12-05 – Umgebung zurück auf DEV-Arbeits-Standard

**Als** Team **möchten wir** nach PROD-Arbeit wieder **DEV** als Standard-Link für die lokale CLI haben, **damit** Folge-`db push` nicht versehentlich PROD trifft.

**Akzeptanzkriterien**

- [ ] Wie in den Projektregeln: nach PROD wieder mit **DEV** verlinken (`supabase link` / `npm run supabase:link`); im Runbook erwähnt.

---

### Epic E12 – Definition of Done (Epic-Ebene)

Epic E12 gilt als erledigt, wenn **alle** User Stories US-E12-01 bis US-E12-05 erfüllt sind und **PROD** nach dem Multi-Tenant-Cutover **verifiziert** ist. Einzelne **Nach-Migrationen** können als normale Feature-PRs folgen, ohne E12 erneut zu öffnen, solange das Runbook aktualisiert wird.

---

## Backlog-Status

Alle in dieser Planung vorgesehenen Epics **E0–E12** sind beschrieben. Neue geschäftliche Anforderungen können als **weitere Epics** (E13+) oder **Stories unter bestehenden Epics** ergänzt werden.

---

## Abstimmung nach den Epics im Backlog

Nach E10: Abgleich mit **Support/Produkt** (welche Defaults neu anlegen). **Epic E11** idealerweise parallel zur Endphase von E9/E10 starten. **Epic E12** nur nach Freigabe Runbook und E11-Security-Check. Abschließend: **Stakeholder-Freigabe** „Multi-Tenant Programm MVP abgeschlossen“, wenn E0–E12 für euren Meilenstein erfüllt sind.

(E4: UX-Review Kurz – Fehlerseiten, Loading – idealerweise vor Start der E5-Umsetzung abgeschlossen.)
