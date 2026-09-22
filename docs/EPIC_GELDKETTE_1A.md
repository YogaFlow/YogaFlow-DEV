# Scrum Epic: Geldkette 1a — Kurs online buchen und bezahlen

**Stand:** 22.09.2026 · Story 0.2 live auf PROD seit 22.09.2026 (Release 2026-09b, Merge `da19a0d`). **Status: ENTWURF.** E1–E8 am 14.09. entschieden (Abschnitt 4). Offen: E9 (Strategie-Projekt), E10–E12 (Termin mit André am 15.09.).
**Branch:** `Julius`. `feature/geldkette` ist nicht der Arbeitsbranch (korrigiert 22.09.2026; die Entscheidung vom 14.09. galt bis zum Release-Schnitt). Story 0.1 braucht keinen Code. · **Basis:** `Omlify_Epic_Geldkette_1a_Cursor_Briefing.md` (14.09.2026), gegen das Repo geprüft
**Verbindlich daneben:** `CLAUDE.md` (Harte Grenzen), `docs/DESIGNSYSTEM.md`, `docs/SCHEMA_RELEASE_WORKFLOW.md`, `docs/DEV_PROD_SAFETY_WORKFLOW.md`

---

## 1. Epic-Ziel

Eine Teilnehmerin bucht in einem Studio mit aktivierter Online-Zahlung einen kostenpflichtigen Kurstermin
und bezahlt direkt. Das Geld geht über Direct Charges auf das Stripe-Konto des Studios. Das Studio sieht die
Zahlung, kann erstatten und erfasst Barzahlungen im selben System. Jede Zahlung ist lückenlos
nachvollziehbar: Stripe-Ereignis → Omlify-Event → Zahlung → Beleg → Buchungszeile.

**Fertig heißt:** Der gesamte Ablauf läuft auf DEV (`omlify-dev.de`) im Stripe-Testmodus. Die Testfälle aus
Story 5.2 sind grün und belegt. Erst dann wird über PROD gesprochen (Abschnitt 7).

---

## 2. Repo-Befunde, die das Briefing korrigieren

Das Briefing sagt selbst, dass Abschnitt 1 aus der Doku stammt. Geprüft am 14.09.2026 auf Stand `626f6ea`.

| # | Briefing sagt | Repo sagt | Beleg | Folge |
|---|---|---|---|---|
| K1 | `registrations` hat `active/waitlist/cancelled` | Enum hat nur `registered` und `waitlist`. Abmelden **löscht die Zeile**. | `20260321120000_fix_register_for_course_status_and_enum.sql:6`; `DELETE FROM registrations` in `unregister_from_course`, `20260911173000_…:499` | Eine bezahlte Buchung darf nicht per DELETE verschwinden. Der Buchungsstatus muss erweitert werden (Schema-Eingriff, Story 2.1). |
| K2 | Unklar, ob `courses` Serie und Termin mischt | Eine Zeile je Termin, Serie nur über `series_id` gruppiert | `CreateCourse.tsx:351-378` | **Geklärt:** `courses.id` ist die stabile Termin-ID. Es gibt aber kein Produkt „Serie als Ganzes buchen“, also auch keine Blockreihe als ein Kauf. |
| K3 | S0: prüfen, ob ein Trainer zwei Studios angehören kann | Gibt es seit dem 11.09.: eine `users`-Zeile je Studio | `20260911182000_membership_decouple_and_join.sql` | **Geklärt.** Folge: Stripe-Kunde hängt am **Profil** (`users.id`), nicht am Login. Bei Direct Charges liegt der Kunde ohnehin auf dem Konto des Studios, das passt. |
| K4 | DEV läuft auf `yogaflow-dev.pages.dev` | DEV ist `omlify-dev.de` und `*.omlify-dev.de`. Der **PROD**-Worker heißt `yogaflow-dev`. | `wrangler.jsonc:8-9`, `docs/ENVIRONMENTS.md:10` | Gefährliche Verwechslung bei Apple-Pay-Domains und Webhook-URLs. Im Epic gilt nur `omlify-dev.de`. |
| K5 | Sentry-Scrubbing konfigurieren | Sentry gibt es nicht | kein Treffer für `sentry` in `src/` und `package.json` | I10 gilt trotzdem, aber für das, was es gibt: Logs der Edge Functions, Cloudflare Observability (`wrangler.jsonc`, `observability.enabled`) und `console.error` im Client. |
| K6 | Webhooks an `localhost:54321` | Es gibt keinen lokalen Supabase-Stack. Gearbeitet wird gegen das entfernte DEV-Projekt. | `package.json` Skripte `db:push:dev`, `functions:dev` | Der Webhook-Endpoint ist die Function-URL des DEV-Projekts. `stripe listen` ist optional. |
| K7 | (nicht erwähnt) | `tenants` hat nur `name` und `slug`. AGB und Datenschutz sind ein globaler Platzhalter. | `20260408120000_create_tenants_table.sql:3-9`, `LegalPage.tsx:28-33` | Für Beleg, Impressum und Preisangabe fehlen Studio-Stammdaten komplett. Das ist eine eigene Story (1.1), kein Nebensatz. |
| K8 | „~11 Edge Functions, 60+ Migrationen“ | 9 Functions, 97 Migrationen | `supabase/functions/`, `supabase/migrations/` | kosmetisch |
| K9 | (nicht erwähnt) | Es gibt keinen Test-Runner | `package.json` ohne `test`-Skript | „Ein Test belegt…“ braucht erst eine Grundlage. Vorschlag in Entscheidung E6. |

### Lücken im Briefing: bestehende Schwächen, die mit Geld zu echten Schäden werden

| # | Befund | Beleg | Warum es jetzt zählt |
|---|---|---|---|
| L1 | **Überbuchung möglich.** `register_for_course` zählt die Plätze und fügt danach ein, ohne Sperre. | `20260911173000_…:384-390` | Zwei gleichzeitige Zahlungen für den letzten Platz → einer muss erstattet werden. Heute passiert das fast nie, mit Checkout-Wartezeit wird es wahrscheinlicher. |
| L2 | **Kurs löschen löscht die Buchungen mit.** Der Client löscht `courses` direkt, `registrations.course_id` hat `ON DELETE CASCADE`. | `MyCourses.tsx:128-141`, `20260106130707_…:30` | Bezahlte Teilnehmende verschwinden spurlos, keine Erstattung. |
| L3 | **Lehrerprofil löschen löscht alle Kurse** (`courses.teacher_id … ON DELETE CASCADE`) und damit die Buchungen. | `20260106130631_…:34` | wie L2 |
| L4 | **Nachrücken von der Warteliste** geschieht automatisch beim Abmelden. | `unregister_from_course`, `20260911173000_…:488-510` | Wer nachrückt, hat einen Platz, aber nicht bezahlt. Die Regel fehlt (E2). |
| L5 | **Manuelle Anmeldung durch das Studio** umgeht jeden Bezahlweg. | `Users.tsx:305` (`admin_register_user_for_course`) | Muss als „offen / bar“ erfasst werden können (Story 3.3). |
| L6 | **Abmeldung durch die Teilnehmerin und Kursabsage durch das Studio** kommen im Briefing nicht vor. Nur die Erstattung durch das Studio. | Briefing S8 | Das ist der häufigste Erstattungsfall im Yoga-Alltag. |
| L7 | `close_past_course_registrations()` ist für `anon` aufrufbar, wirkt über alle Tenants und rechnet in UTC. | `CLAUDE.md`, „Notiert“ | Die Funktion ändert Buchungszustände. Bevor Zahlungen daran hängen, muss sie sicher sein. |
| L8 | Ein Studio löschen (`delete_tenant_complete`) und das Löschen des letzten Profils (Login wird gelöscht) laufen als Kaskade. | `20260503120000_…`, Memory M6 | Belege unterliegen Aufbewahrungsfristen. Eine Kaskade darf sie nicht löschen. |
| L9 | Der Preis ist `numeric(10,2)` in Euro. Die Grenze von 1.000 € prüft nur der Client. | `CreateCourse.tsx:275-281`, `velvet_sunset.sql:33` | Der Server rechnet in Cent und liest `courses.price` zum Zeitpunkt der Zahlung. Der Betrag wird in `payments` festgeschrieben, weil Lehrende den Preis später ändern können. |
| L10 | Das Payment Element zeigt automatisch alle Zahlungsarten, die im Stripe-Konto des Studios aktiv sind. | Stripe-Verhalten | Die Zahlungsarten müssen explizit aus den Capabilities in der DB gesetzt werden (Port-Regel 4.2.4), sonst taucht z. B. Klarna ungefragt auf. |
| L11 | Apple Pay braucht die Registrierung **jeder Domain je verbundenem Konto**. Omlify hat eine Subdomain je Studio. | Briefing S2 | Beim Onboarding wird `<slug>.omlify-dev.de` bzw. `<slug>.omlify.de` registriert, nicht eine Plattform-Domain. |

### Punkte im Briefing, die ich fachlich anders sehe

1. **Hauptbuch mit Kontonummern widerspricht Abschnitt 9.2.** Das Briefing verlangt `ledger_entries` mit Konto und
   Steuerschlüssel, verbietet dem Agenten aber, Konten festzulegen, und SKR03/04 ist beim Steuerberater offen.
   **Vorschlag:** logische Konten (`receivables`, `revenue_standard`, `revenue_small_business`, `vat_output`,
   `psp_clearing`, `psp_fees`, `bank`, `cash`), die in 1b über eine historisierte Tabelle auf SKR-Nummern
   abgebildet werden. Die vier Buchungsschritte aus 5.5 lassen sich damit vollständig darstellen, der Export
   bleibt ein Mapping.
2. **B2C-Rechnung ist in Deutschland keine Pflicht.** § 14 Abs. 2 UStG verpflichtet gegenüber Unternehmern und
   bei Grundstücksleistungen, nicht gegenüber Privatpersonen. Gebraucht wird ein **Buchungsbeleg**. Eine
   Kleinbetragsrechnung ist gutes Produkt, aber nicht Voraussetzung für den ersten Euro. Das ist eine Frage für
   Julius und den Steuerberater (E4), nicht für den Agenten.
3. **SEPA gehört nach 1b.** Das Briefing begründet SEPA selbst mit Abos, Karten und bekannten Teilnehmenden,
   also mit Produkten aus 1b. Für einen Drop-in empfiehlt es Karte. SEPA bringt in 1a den schwierigsten Teil
   der Kette (T+6, Widerspruch bis 13 Monate, Erstattung erst nach Settlement), ohne dass es in 1a ein Produkt
   gibt, das davon profitiert. Die Zustandsautomaten werden trotzdem **asynchron** gebaut (3DS ist es auch),
   damit SEPA später nur ein weiterer Weg ist (E1).
4. **Gläubiger-ID bei Stripe prüfen, bevor sie in den Onboarding-Fluss wandert.** Bei Stripe-SEPA ist offen,
   ob die Mandate unter der Gläubiger-ID des Studios oder unter der von Stripe laufen. Im Stripe-Dashboard bzw.
   beim Support prüfen. Mit E1 = 1b betrifft das 1a nicht mehr.
5. **Das Feld `terminiert` braucht in 1a keine Produkttabelle.** In 1a gibt es nur Kurstermine, und die sind
   immer terminiert. Die Zahlung verweist generisch auf ihren Gegenstand (`subject_type = 'course_booking'`,
   `subject_id`), die Einordnung ergibt sich aus dem Typ. Das Feld entsteht mit dem ersten nicht terminierten
   Produkt in 1b. Nachpflegen muss man dann nichts, weil alle Bestandszahlungen vom Typ `course_booking` sind.
6. **I12 und Webhooks:** Ein Webhook hat keinen Nutzer und muss serverseitig mit erhöhten Rechten schreiben.
   Das ist zulässig, weil der Tenant über I7 aufgelöst wird und nicht über eine Session. Für Anfragen von
   Nutzern gilt: Die Edge Function ruft die DB mit dem JWT des Nutzers und dem Header `x-omlify-tenant` auf,
   damit RLS greift. `service_role` bekommt nur, wer keine Session haben kann (Webhook, nächtlicher Abgleich).

---

## 3. Architektur-Vorschläge (zur Freigabe)

| # | Vorschlag | Begründung |
|---|---|---|
| A1 | **Serverseitige Zahlungslogik in Supabase Edge Functions**, nicht im Cloudflare Worker | Nah an der DB, Secrets und Deploy-Weg (`db.mjs functions dev`) gibt es schon, der Worker liefert heute nur Assets aus. Die Laufzeitgrenzen werden in Story 0.3 gemessen, bevor die erste Zahlungsfunktion entsteht. |
| A2 | **Zustandsänderungen an Buchung und Zahlung nur über `SECURITY DEFINER`-RPCs** in `yogaflow_private`, aufgerufen von Edge Functions | Gleiches Muster wie bei den Kurs-RPCs. Die Tabellen `payments`, `ledger_entries` usw. bekommen für `authenticated` nur SELECT (mit RLS), kein INSERT/UPDATE. |
| A3 | **Beträge als `integer` in Cent**, Währung als eigene Spalte (`EUR`) | Keine Rundungsfehler, entspricht Stripe. Umrechnung aus `courses.price` in SQL, nicht in JS. |
| A4 | **Platz-Reservierung mit Ablauf** statt „erst zahlen, dann Platz“ | Details in Story 2.1, Dauer in E2. |
| A5 | **Referenzen qualifiziert** (`provider` + `provider_ref`), Zahlungsarten provider-frei (`card`, `sepa_debit`, `paypal`, `cash`, `bank_transfer`, `paypal_manual`) | Port-Regeln 4.2.2 und 4.2.5. Bezeichner englisch, Anzeige deutsch. |
| A6 | **Hauptbuch mit logischen Konten**, SKR-Mapping in 1b | Siehe Abschnitt 2, Punkt 1 |
| A7 | **Stripe.js wird nur auf Checkout- und Onboarding-Routen geladen** (dynamischer Import) | Bundle ist jetzt schon 1.039 kB (`CLAUDE.md`). Stripe.js kommt von `js.stripe.com` und darf nicht gebündelt werden. |

---

## 4. Entscheidungen

| # | Frage | Entscheidung | Stand |
|---|---|---|---|
| **E1** | SEPA in 1a oder in 1b? | **1b.** 1a = Karte samt Apple Pay / Google Pay über das Payment Element. | entschieden 14.09. |
| **E2** | Wie lange hält eine Reservierung, und was passiert beim Nachrücken von der Warteliste in einem Bezahlkurs? | Reservierung **15 Min.** Nachrücken bei Bezahlkursen: Die Person wird benachrichtigt und bekommt einen Zahlungslink mit Frist (12 Std., höchstens bis 2 Std. vor Kursbeginn), sonst rückt die nächste nach. | entschieden 14.09. |
| **E3** | Abmeldung durch die Teilnehmerin: bis wann kostenlos, und wird dann automatisch erstattet? | **Eine Stornofrist je Studio** (Standard 24 Std. vor Beginn). Innerhalb der Frist automatische Vollerstattung, danach keine. Kursabsage durch das Studio erstattet immer voll. Die Frist gehört in die AGB des Studios. | entschieden 14.09. |
| **E4** | Echte Rechnung oder zunächst Zahlungsbeleg? | Nummernkreis und Unveränderlichkeit **in 1a**, als **Kleinbetragsrechnung**. Datenmodell ZUGFeRD-fähig, PDF zunächst schlicht. Steuerberater sieht es vor PROD. | entschieden 14.09. |
| **E5** | Wer sieht Zahlungen? | `owner` und `admin` sehen alle. `teacher` sieht nur „bezahlt / offen“ bei den eigenen Kursen, keine Beträge. `user` sieht die eigenen. | entschieden 14.09. |
| **E6** | Test-Grundlage | **Deno-Tests** für die Edge Functions und **SQL-Selbstprüfungen** als `DO $$`-Blöcke. Kein Vitest in 1a. | entschieden 14.09. |
| **E7** | Neue Abhängigkeiten | Freigegeben: `@stripe/stripe-js`, `@stripe/react-stripe-js`, `@stripe/connect-js`, `@stripe/react-connect-js` (Frontend), `npm:stripe` (Edge, Import in Deno). Eingebaut wird jede erst in der Story, die sie braucht. | freigegeben 14.09. |
| **E8** | Reihenfolge | Story 0.2 (Buchungskern härten) **vor** allem anderen. **Nachtrag 22.09.:** Vor Story 0.3 steht Epic Konto und Zugang (`docs/EPIC_KONTO_ZUGANG.md`, K1/K2). Membership Stufe 4 ist unabhängig. **Nachtrag 14.09.:** Die Commits für Paket 3 (`85b9c44`, `a9991d5`, `b6387cf`, `1ac8b8a`, `a6f25e2`, `468bcb3`) liegen schon auf `Julius`. Die befürchtete Kollision mit der Kursliste gibt es damit nicht. Der Abschnitt „Als Nächstes — Paket 3“ in `CLAUDE.md` ist veraltet. | entschieden 14.09., ergänzt 22.09. |
| **E9** | Nimmt Omlify eine Gebühr je Zahlung (`application_fee_amount`)? | **Offen, gehört ins Strategie-Projekt.** Technisch in 1a: keine Gebühr, der Port lässt das Feld offen. | offen |
| **E10** | B5–B7 (Stripe, Port, PayPal) | Nach der Besprechung mit André am 15.09. bestätigen. Das Epic hängt davon nur im Adapter ab. | offen bis 15.09. |
| **E11** | Dashboard der Studios: Express oder vollständig? | **Offen.** *Vollständig:* Das Stripe-Konto gehört dem Studio und bleibt beim Wechsel bestehen. Das Studio kann aber bei Stripe direkt erstatten und eigene Zahlungen anlegen, Webhooks müssen das erkennen, zuordnen oder ignorieren. *Express:* Geld zurück läuft über Omlify, die Buchhaltung bleibt sauber, die Bindung an Omlify ist höher. Voraussetzung: Nachweis, dass Express **ohne Plattformhaftung** möglich ist (Ergebnis 0.1). Bindung und Mitnahme sind eine Positionierungsfrage → André / Strategie-Projekt. Unveränderlich je Konto. | offen bis 15.09. |
| **E12** | Vertragspartner des Stripe-Plattformkontos | **Offen.** Einzelunternehmen, GbR oder GmbH. Gibt die Live-Verifizierung und die Erklärungen im Plattform-Profil ab, nachträglich nur mühsam änderbar. | offen bis 15.09. |

---

## 5. Scope

**In 1a:** Voraussetzungen und Härtung des Buchungskerns · Fundament (Events, Audit, Service-Gerüst) ·
Studio-Stammdaten und Steuerstatus · Provider-Port · Connect-Onboarding (embedded) · Webhooks ·
Buchungs- und Zahlungsstatus · Checkout mit Karte und Wallets · Zahlungsübersicht Studio · Erstattung
(Studio, Stornofrist, Kursabsage) · manuelle Zahlungserfassung · Hauptbuch (logische Konten) · Beleg /
Kleinbetragsrechnung · Lösch- und Aufbewahrungskonzept · Rechtstexte im Checkout · nächtlicher Abgleich ·
Testsuite · PROD-Freigabe-Gate.

**Nicht in 1a:** SEPA (E1) · Guthabenkarten · Mitgliedschaften · Mahnwesen · Auszahlungsabstimmung ·
DATEV-Export und SKR-Mapping · USt-Schwellen-Monitoring · PayPal-Adapter · Serie als Ganzes buchen ·
alles aus Briefing 6.3 · Online-Zahlung wieder abschalten und nachträgliche
Kontosperre durch Stripe mit offenen bezahlten Buchungen (entschieden 14.09.: 1b).

**Nie vorgesehen:** Buchung ohne Konto (entschieden 14.09., Julius: „Ein Nutzer braucht immer ein Konto“).

---

## 6. Stories nach Sprints

Jede Story endet mit einem **STOPP**. Weiter geht es erst nach Freigabe, danach wird gepusht. Migrationen
laufen nur über `scripts/db.mjs`, jede mit Zweck, Rückweg und selbstprüfendem `DO $$`-Block. Feature-Commits
und Design-Commits bleiben getrennt.

### Sprint 0 — Voraussetzungen (noch keine Stripe-Zeile im Code)

#### 0.1 Stripe-Konto und DEV-Testumgebung einrichten
*Als Gründer möchte ich eine Stripe-Testumgebung, die von Live strikt getrennt ist, damit wir auf DEV
vollständig testen können, während die Verifizierung läuft.*

- Stripe-Plattformkonto: Connect im **Testmodus** aktivieren, Platform Profile ausfüllen
- **Verifizierung für Live parallel starten**, sie läuft Tage
- Im Dashboard prüfen und mit Screenshot belegen: Accounts v2 + Express-Dashboard +
  `losses_collector = stripe` + Stripe-verwaltete Preise in DE — produktiv oder Preview?
- Das Stripe-Plugin in Cursor nutzt **nur Test-Schlüssel**
- Secrets: `STRIPE_SECRET_KEY` (`sk_test_…`) und `STRIPE_WEBHOOK_SECRET` nur als Supabase-Secret im
  DEV-Projekt. `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) in der Cloudflare-DEV-Umgebung — der Publishable
  Key ist öffentlich und darf in eine `VITE_`-Variable, der Secret Key nie
- Prüfen, dass `.env*` mit Stripe-Werten in `.gitignore` steht

**Akzeptanz:** Screenshot Platform Profile (Test), Liste der Secret-Namen je Umgebung (ohne Werte),
Ergebnis der Preview-Prüfung schriftlich.
**Wer:** Julius im Dashboard, Claude prüft. **STOPP.**

**Ergebnis 14.09.2026 (Sandbox „Omlify Sandbox"):**
- Einrichtung der Plattform: Direct Charges · `losses_collector: stripe` · `fees_collector: account` ·
  `dashboard: full` · Onboarding „gehostet oder eingebettet". Das Plattform-Profil ist laut Stripe nur eine
  historische Angabe. Verbindlich ist, was der Code beim Anlegen eines Kontos setzt (Sprint 1).
- Ein von Stripe erzeugtes Beispielkonto (`testaccount@example.com`, Beispielzahlung „Testing Blueprints")
  hat Standardwerte, darunter Dashboard **Vollständig**. Es ist keine Referenz.
- **Befund:** Der Dialog „Anerkennung der Haftung für Negativsalden" im Plattform-Profil beschreibt
  **Plattformhaftung** (Rückstellungen auf dem Omlify-Konto, Prüfung und Risikoüberwachung der Studios,
  Radar Pro zu 0,09 € je geprüfter Transaktion und 4,25 € je verbundenem Konto), obwohl `losses_collector:
  stripe` eingetragen ist. **Nicht bestätigt**, weder in der Sandbox noch live. Ungeklärt, ob der Dialog
  allgemein ist oder ob Stripe Plattformhaftung für bestimmte Kombinationen (z. B. Express) verlangt.
- **Preview-Prüfung geändert:** Statt eines Dashboard-Labels harter Beleg per API in der Sandbox — ein
  v2-Konto mit `dashboard: express` + `losses_collector: stripe` anlegen, Antwort dokumentieren. Alternativ
  Anfrage beim Stripe-Support. Muss vor Story 1.x und vor E11 vorliegen.
- Live-Verifizierung und beide Bestätigungen im Plattform-Profil warten auf die Frage, **wer Vertragspartner
  bei Stripe ist** (Termin 15.09.).
- Secrets: `STRIPE_SECRET_KEY` (`sk_test_`) im Supabase-DEV-Projekt gesetzt (`supabase secrets list
  --project-ref mufxhtctutfpzklwqnze` zeigt den Namen). PROD: keine Stripe-Secrets.
- `VITE_STRIPE_PUBLISHABLE_KEY` bewusst in die erste Frontend-Story verschoben (liest bis dahin niemand).
  `STRIPE_WEBHOOK_SECRET` entsteht mit dem Webhook-Endpunkt in Sprint 1.

#### 0.2 Buchungskern härten
*Als Studio möchte ich, dass ein Kursplatz nie doppelt vergeben wird und Buchungen nicht stillschweigend
verschwinden, bevor Geld daran hängt.*

- `register_for_course` und `admin_register_user_for_course`: Kurszeile mit `FOR UPDATE` sperren, bevor gezählt wird (L1)
- Kurs löschen: DB-seitig verhindern, solange aktive Buchungen bestehen. Stattdessen „absagen“ (`status`).
  Die UI in `MyCourses.tsx` zeigt dann einen Hinweis (L2)
- `courses.teacher_id ON DELETE CASCADE` → `RESTRICT` (L3). Vorher prüfen, welche Pfade Profile löschen
- `close_past_course_registrations()`: `anon` entziehen, auf den eigenen Tenant beschränken,
  `Europe/Berlin` statt UTC (L7)
- `pg_temp` aus `unregister_from_course` (notiert in `CLAUDE.md`)

**Akzeptanz:** SQL-Nachweis mit zwei parallelen Sessions (zweite Buchung landet auf der Warteliste). Löschen
eines Kurses mit Buchung schlägt fehl. `anon` bekommt beim Aufruf von `close_past…` einen Fehler.
**Schema-Eingriff → ausdrückliche Freigabe nötig. STOPP.**

**Ergänzungen aus der Durchsprache 14.09.2026 (mit Julius):**
- **L1 präzisiert:** Die Überbuchung wird mit Zahlungen nicht häufiger, aber teurer (eine Erstattung). Betrifft
  `register_for_course` (`20260911173000:385-440`) und `admin_register_user_for_course` (`:595-637`).
- **L2 entschieden:** In 0.2 wird das Löschen eines Kurses mit aktiven Anmeldungen nur **gesperrt**, Hinweis
  „erst Teilnehmende abmelden“. `courses.status` kennt `canceled` schon (`src/types/index.ts:31`), aber keine
  Oberfläche setzt es. Echtes Absagen mit Benachrichtigung und Erstattung kommt in **3.2**.
- **L3 entschieden:** `RESTRICT` auf `courses.teacher_id`. Eine Lehrerin mit kommenden Kursen kann nicht
  entfernt werden. Das Entfernen führt über **„übergeben oder absagen“** (Story 3.2). Das Profil bleibt für
  vergangene Kurse und Belege bestehen (4.3). Übergabe je Kurs gibt es schon (`EditCourse.tsx:451-469`).
  Nebenbefund: Wird eine Lehrerin auf `user` zurückgestuft, bleiben ihre Kurse ihr zugeordnet. Der Trigger
  reagiert nur auf Hochstufung (`20260907153100:16-17`).
- **L7 — Befund: `close_past_course_registrations()` scheitert bei jedem Aufruf und hat nie gewirkt.**
  `NULLIF(c.time, '')` wandelt `''` in den Typ `time` um. Beleg im DEV-SQL-Editor (14.09.):
  `SELECT NULLIF(TIME '10:00', '');` → `ERROR: 22007: invalid input syntax for type time: ""`. Die Spalte ist
  seit `20250804174537` vom Typ `time`, der Fehler besteht also seit `20260505113046`. Unbemerkt, weil
  `registrationMaintenance.ts:14` das Ergebnis des RPC nicht auswertet. Der Browser löst den Aufruf auf vier
  Seiten aus (`Courses`, `Dashboard`, `MyRegistrations`, `Participants`). PROD vermutlich identisch (gleiche
  Migration), dort nicht geprüft.
- **L7 — Vorschlag statt Reparatur:** Vergangene Anmeldungen **nicht** mehr mit `cancellation_timestamp`
  stempeln — der Stempel bedeutet „storniert“ und würde mit Zahlungen Stornoregeln und Belege verfälschen.
  „Vergangen“ ergibt sich aus `courses.date` und `courses.time`. Deshalb Funktion und Client-Aufruf entfernen,
  statt sie zu reparieren (**entschieden 14.09.**). Falls doch eine Wartungsaufgabe nötig ist: `pg_cron`,
  nie aus dem Browser.
- **0.3 offene Frage:** `audit_log.before/after` würde Personendaten im Klartext speichern und kollidiert mit
  Art. 17 (Story 4.3). Vorschlag: nur IDs und Namen geänderter Felder bei Personendaten. Auch Frage für den Anwalt.

**Erledigt auf DEV, 22.09.2026.** Commits `5ed6664` (Migrationen), `7ac04bb` (Client und `delete-user`),
`9ff03ee` (Race-Skript), `b00c3c7` (Löschdialog), `1b414fd` (tenant_id der Nachrück-Nachricht).
Race-Test `scripts/test/overbooking_race.mjs`: vorher 2/20, nachher 0/20 in beiden Fällen.

**Live auf PROD seit 22.09.2026 (Release 2026-09b, Merge `da19a0d`). Offene PROD-Migrationen: 0.**
- Vor PROD: FK-Namen prüfen — erledigt. Namen wie DEV.
- `messages` mit `tenant_id` NULL zählen — erledigt. 0 Zeilen.

**Vor 0.3:** Epic Konto und Zugang (`docs/EPIC_KONTO_ZUGANG.md`). K2 schreibt ins
`audit_log`, sobald diese Story steht.

#### 0.3 Fundament: Events, Audit, Service-Gerüst
*Als Plattform möchte ich einen serverseitigen Ort für Geschäftslogik mit Event- und Audit-Protokoll, damit
Zahlungen nicht aus React-Komponenten heraus entstehen.*

- Migration `events` (`id`, `tenant_id`, `type`, `subject_type`, `subject_id`, `payload jsonb`, `occurred_at`,
  `causation_id`) und `audit_log` (`tenant_id`, `actor_member_id`, `action`, `table_name`, `row_id`, `before`,
  `after`, `at`). RLS aktiv, nur SELECT für `owner`/`admin`, append-only (UPDATE/DELETE für alle Rollen entzogen)
- Edge-Function-Gerüst `_shared/service.ts`: JWT prüfen, Tenant-Slug aus Header, Supabase-Client **mit dem
  JWT des Nutzers**, einheitliche Fehlerform ohne Details nach außen, Log-Helfer, der Beträge, E-Mails,
  `pm_`/`cus_`-Referenzen und IBAN-Muster maskiert (I10)
- Beispielfunktion `service-ping`: schreibt je eine Zeile in `events` und `audit_log` über ein RPC
- Laufzeitgrenzen der Edge Functions für den Plan des DEV-Projekts dokumentieren

**Akzeptanz:** Aufruf mit Token aus Studio A schreibt in A. Derselbe Token mit Header von Studio B schlägt
fehl (curl-Ausgabe). Deno-Test für den Log-Maskierer.
**Schema-Eingriff → Freigabe. STOPP.**

### Sprint 1 — Studio wird zahlungsfähig

#### 1.1 Studio-Stammdaten und Steuerstatus
*Als Studio-Owner möchte ich meine rechtlichen Angaben und meinen Steuerstatus einmal hinterlegen, damit
Belege, Impressum und Preisangaben stimmen.*

- Tabelle `tenant_legal_profiles`: Name bzw. Firma, Anschrift, Vertretung, Kontakt, Steuernummer und/oder
  USt-IdNr. — **historisiert** mit `valid_from`, nie UPDATE
- Tabelle `tenant_tax_settings`: `regular` / `small_business` (§ 19 UStG), Steuersatz, `valid_from`
- Einstellungsseite für `owner`. Pflicht erst beim Aktivieren der Online-Zahlung (Story 1.3)
- Impressum je Subdomain liest daraus (Route `/legal/impressum`)

**Akzeptanz:** Eine Änderung erzeugt eine neue Zeile, die alte bleibt. Die Abfrage „gültig am Datum X“ liefert
die richtige Version. **Schema → Freigabe. STOPP.**

**Entschieden 14.09.2026:** Stammdaten und Impressum je Subdomain wandern ins **Epic „Rechtliche
Grundlagen“** und werden dort **vorgezogen umgesetzt** (Julius: „muss unbedingt jetzt aktiv mit umgesetzt
werden“). Die Geldkette hängt davon ab und nutzt die Tabellen mit. Beim Umsetzen beachten:
- `tenants` ist per `USING (true)` öffentlich lesbar (`20260426120000:67-69`). Die neuen Tabellen trennen
  öffentliche Impressumsangaben von internen Angaben (z. B. Steuernummer nur `owner`/`admin`). Was öffentlich
  sein muss, klärt der Anwalt.
- **Frage an den Steuerberater:** Gilt der Steuerstatus je Studio oder kann er je Kurs abweichen (z. B.
  zertifizierte Präventionskurse)? Wenn ja, muss das Modell es von Anfang an können.

#### 1.2 Provider-Port, Stripe-Adapter, Provider-Tabellen
*Als Entwickler möchte ich eine Zahlungsschnittstelle ohne Stripe-Typen in der Domäne, damit ein zweiter
Anbieter nur einen Adapter braucht.*

- `supabase/functions/_shared/payments/port.ts` (Interface aus Briefing 4.1, ohne `createOffSessionPayment`,
  `listPayouts` und `listFees` in 1a → als `NotImplemented` markiert), `stripe/adapter.ts`
- Migrationen: `provider_accounts` (`tenant_id`, `provider`, `provider_ref`, `onboarding_status`,
  `livemode boolean`), `provider_capabilities` (eine Zeile je Zahlungsart), `provider_customers`
  (`member_id` → `users.id`, `provider`, `provider_ref`), `provider_events_raw` (`provider`, `event_id`,
  `account_ref`, `type`, `payload`, `received_at`, `processed_at`, `processing_error`,
  `UNIQUE (provider, event_id)`)
- `livemode` wird bei jedem Event gegen die Umgebung geprüft. Ein Live-Event auf DEV wird abgelehnt.

**Akzeptanz:** Deno-Test: die exportierten Typen des Adapters enthalten keinen Import aus `stripe`
(Prüfung über das Modulgraph bzw. `grep` im CI). **Schema + neue Abhängigkeit → Freigabe. STOPP.**

#### 1.3 „Online-Zahlung aktivieren“ und Embedded Onboarding
*Als Studio-Owner möchte ich vorher wissen, was ich brauche und was es kostet, und das Onboarding dann in
Omlify erledigen, ohne weitergeleitet zu werden.*

- Fünf Zustände als eigene Screens: **nicht aktiviert · in Bearbeitung · in Prüfung bei Stripe · aktiv ·
  Unterlagen nachgefordert**. Zustände zuerst festlegen, dann gestalten (Briefing 12)
- Vorab-Screen: benötigte Unterlagen, Dauer, Kostenbeispiel, überspringbar. **Kostenbeispiel in Euro für einen
  typischen Kurspreis, nicht als Prozent** (entschieden 14.09.): Stripe DE laut stripe.com/de/pricing, abgerufen
  14.09.2026 — Standard-EWR-Karte 1,5 % + 0,25 € (18 € → 0,52 € = 2,9 %; 12 € → 0,43 € = 3,6 %), Premium-EWR
  2,8 % + 0,25 €, international 3,15 % + 0,25 €. Werte beim Bauen erneut prüfen, nicht fest im Code verdrahten
- **Abhängigkeit:** E11 (Dashboard-Typ) muss vor dieser Story entschieden sein, er ist je Konto unveränderlich
- Edge Function `payments-onboarding`: legt das Connected Account an (idempotent je Tenant), erzeugt die
  Account Session für die Embedded Components
- Nach „aktiv“: Payment-Method-Domain `<slug>.omlify-dev.de` für das Konto registrieren (L11)
- Nur `owner` darf aktivieren

**Akzeptanz:** Ein Test-Studio auf `omlify-dev.de` durchläuft das Onboarding mit Stripe-Testdaten vollständig
in der Omlify-Oberfläche. Screenshots aller fünf Zustände. **STOPP.**

#### 1.4 Webhook-Empfang
*Als Plattform möchte ich jedes Stripe-Ereignis sicher und genau einmal annehmen, auch wenn es doppelt oder
in falscher Reihenfolge kommt.*

- Edge Function `payments-webhook` (`verify_jwt = false` in `config.toml`), **zwei** Stripe-Endpoints im
  Testmodus: Plattform-Events und Events auf verbundenen Konten
- Ablauf: Signatur prüfen → roh in `provider_events_raw` (Konflikt auf `(provider, event_id)` = 200 zurück,
  nichts weiter) → Tenant aus `account` auflösen; nicht auflösbar → `processing_error`, nicht verarbeiten (I7)
  → Verarbeitung über RPC → `processed_at`
- Erstes verarbeitetes Event: `account.updated` → `provider_accounts.onboarding_status` und Capabilities
- Verarbeitung liest den **aktuellen Zustand bei Stripe** nach, statt aus der Reihenfolge der Events zu schließen
- **Offen, geht ins Rechts-Epic (14.09.):** `provider_events_raw.payload` enthält später Personendaten (Name,
  E-Mail, letzte vier Kartenziffern). Aufbewahrungsfrist bzw. Kürzen nach Verarbeitung festlegen

**Akzeptanz:** Dasselbe Event zweimal gesendet → eine Zeile. Ein Event mit unbekanntem Konto → protokolliert,
keine Wirkung. Falsche Signatur → 400. **STOPP.**

### Sprint 2 — Karte bezahlen, Ende zu Ende

#### 2.1 Buchungsstatus und Zahlungsstatus als zwei Zustandsautomaten
*Als Studio möchte ich, dass ein Platz verlässlich reserviert, bestätigt oder freigegeben wird, unabhängig
davon, wie lange eine Zahlung braucht.*

- **Buchung** (`registrations`): `registered`, `waitlist` + neu `pending_payment` (reserviert, mit `hold_expires_at`),
  `cancelled` (Soft-Cancel mit Grund statt DELETE, sobald eine Zahlung existiert)
- **Zahlung** (`payments`): `initiated → processing → succeeded | failed | canceled`, danach
  `refunded_partial`, `refunded`, `disputed`. Zeitstempel je Übergang, `expected_settlement_at` getrennt
  von `settled_at` (für SEPA in 1b vorbereitet)
- Übergänge nur als erlaubte Paare in einem RPC. Unerlaubte Übergänge werden protokolliert, nicht ausgeführt
- Regeln: `pending_payment` zählt als belegter Platz. Abgelaufene Reservierung → Platz frei (Ablauf beim
  nächsten Zugriff und per `pg_cron`). Späte erfolgreiche Zahlung auf abgelaufene Reservierung → Platz noch
  frei: bestätigen; sonst automatisch erstatten und Event `payment.refund_required`
- Nachrücken von der Warteliste gemäß E2
- Kostenlose Kurse (`price = 0`) und Studios ohne Online-Zahlung laufen **unverändert** wie heute

**Akzeptanz:** SQL-Tests mit **gesetzten Zeitstempeln** statt Testmodus-Timing (Briefing 8.5.3) für: Ablauf,
späte Zahlung, doppelte Zahlung, Nachrücken. Die bestehende Buchung eines kostenlosen Kurses bleibt
unverändert. **Schema (Enum-Erweiterung) → Freigabe. STOPP.**

**Ergänzungen aus der Durchsprache 14.09.2026 (mit Julius, alle entschieden):**
- **Befund A — Einmal-Regel:** `registrations` hat `UNIQUE(course_id, user_id)`
  (`20260106130707_…red_mountain.sql:34`), in keiner Migration entfernt. Mit Soft-Cancel könnte niemand nach
  Stornierung oder abgelaufener Reservierung erneut buchen. → In 2.1 durch eine eindeutige Regel **nur für
  aktive Zeilen** ersetzen (partieller Unique-Index).
- **Befund B — Nachrücken hängt am DELETE:** Trigger `promote_waitlist_after_registered_delete` feuert
  `AFTER DELETE` (Schnappschuss `2026-09-11_pre_membership_dev.sql:1674`). Ohne DELETE hört das Nachrücken für
  **alle** Kurse still auf, auch für kostenlose. → In 2.1 neu bauen, ausgelöst durch Stornierung. Bezahlkurse
  nach E2.
- **Befund C — Benachrichtigung:** Nachrücken erzeugt heute nur eine Chat-Nachricht im Namen der Lehrerin
  (`promote_from_waitlist`, Schnappschuss `:1229-1250`), keine E-Mail. → Nachrücken in Bezahlkursen (E2,
  12-Std.-Frist) **per E-Mail**, in der späteren App zusätzlich **per Push-Benachrichtigung**.
- `pg_cron` wird im Projekt noch nicht genutzt (kein Treffer in `supabase/`). Einschalten auf DEV und PROD ist
  Teil dieser Story.
- **Korrektur L9:** Die 1.000-€-Grenze prüft auch die DB — `courses_price_range_check`
  (`20260106132659:54-55`).

#### 2.2 Checkout Karte
*Als Teilnehmerin möchte ich einen Kurs auswählen, sehen, was er kostet, und mit Karte, Apple Pay oder
Google Pay zahlungspflichtig buchen.*

- Client sendet **nur** `course_id`. Edge Function `payments-checkout`: Mitgliedschaft prüfen, Platz reservieren
  (2.1), Preis aus `courses.price` in Cent, Steuer aus `tenant_tax_settings`, Zahlung anlegen, PaymentIntent
  als Direct Charge mit Idempotency-Key = Reservierungs-ID, `payment_method_types` aus
  `provider_capabilities` (L10), Metadaten nur mit Omlify-IDs
- Payment Element auf eigener Route, Stripe.js per dynamischem Import (A7)
- Preisangabe „inkl. 19 % USt“ bzw. Kleinunternehmer-Hinweis. Button **„zahlungspflichtig buchen“**
- Nach dem Absenden: Wartezustand, bis der Webhook `succeeded` gesetzt hat (Polling auf den Zahlungsstatus).
  Die Client-Rückmeldung bestätigt nichts (I4)
- Bestätigungs-E-Mail über das bestehende `send-email`, ausgelöst vom Event `payment.settled`
- Testkarten aus Briefing 8.3: Erfolg, 3DS, abgelehnt, keine Deckung

**Akzeptanz:** Alle vier Testkarten mit Screenshot und DB-Auszug. Manipulierter Request mit `amount` im Body
→ Feld wird ignoriert, Betrag stimmt (curl). Letzter Platz, zwei Browser gleichzeitig → eine Reservierung,
eine Wartelistenmeldung. **STOPP.**

**Ergänzungen 14.09.2026:**
- **Ohne Konto kein Kauf — dauerhaft** (Julius): Ein Nutzer braucht immer ein Konto. Gastbuchung ist nicht
  „später“, sondern nicht vorgesehen.
- **Lehrende zahlen bei fremden Kursen wie alle anderen** (Julius). In eigene Kurse können sie sich gar nicht
  eintragen (`register_for_course`, `20260911173000:342-345`; `admin_register_user_for_course`, `:569-570`),
  die Frage „zahlen sie dort?“ stellt sich also nicht.
- **Owner und Admins können sich heute für überhaupt keinen Kurs anmelden** („Owner und Admins können sich nicht
  für Kurse anmelden.“, `20260911173000:326`). Julius' Aussage „Admins zahlen bei anderen Kursen normal“ setzt
  voraus, dass sie buchen dürfen. **Entschieden 14.09.: bleibt so** — Owner und Admins nehmen vorerst an keinen
  Kursen teil, zahlen also auch nicht. Gilt „wie alle anderen“ damit nur für Lehrende.
- Buchen ist heute ein Klick mit Dialog in der Kursliste (`Courses.tsx:210-255`). Bei Bezahlkursen führt der
  Klick auf eine eigene Bezahlseite → Design vorab planen.
- **Stripe erstattet bei Rückerstattungen die Gebühren nicht** („Die Bearbeitungsgebühren von Stripe aus der
  ursprünglichen Transaktion werden nicht zurückerstattet“, docs.stripe.com/refunds, abgerufen 14.09.). Jede
  kostenlose Stornierung, Kursabsage und späte Zahlung kostet das Studio die Gebühr.
- **Option für Sprint 3 / E3 (notiert 14.09.):** Bei der Buchung nur autorisieren, nach Ablauf der Stornofrist
  erfassen (manuelle Autorisierung und Erfassung). Stornierung in der Frist wäre dann kostenlos. Grenze: Wie
  lange eine Autorisierung gilt, vor der Entscheidung prüfen — hilft vermutlich nur bei kurzfristigen Buchungen.

#### 2.3 Zahlungsstatus für die Teilnehmerin
*Als Teilnehmerin möchte ich unter „Meine Anmeldungen“ sehen, ob mein Platz bezahlt ist, und eine
abgebrochene Zahlung fortsetzen können, solange die Reservierung gilt.*

**Akzeptanz:** Zustände „reserviert — Zahlung offen (noch 12 Min.)“, „bezahlt“, „erstattet“ sichtbar.
Erfolg nicht allein über Farbe. **STOPP.**

### Sprint 3 — Studio-Sicht und Geld zurück

#### 3.1 Zahlungen im Backoffice
*Als Owner/Admin möchte ich alle Zahlungen mit Status, Zahlungsart und Beleg sehen und filtern.*
Sichtbarkeit gemäß E5. Nur Anzeigedaten (Kartenmarke, letzte 4). **STOPP.**

#### 3.2 Erstattung, Stornofrist, Kursabsage
*Als Studio möchte ich voll oder teilweise erstatten. Als Teilnehmerin möchte ich innerhalb der Frist
kostenlos stornieren. Wenn das Studio absagt, will ich mein Geld automatisch zurück.*

- Edge Function `payments-refund`: nur `owner`/`admin`, Betrag ≤ erstattbarer Rest (serverseitig), Idempotenz
- Teilnehmer-Abmeldung: innerhalb der Stornofrist (E3) automatische Vollerstattung, außerhalb keine. Die UI
  sagt vorher, was passiert
- Kursabsage: alle bezahlten Buchungen werden erstattet, jede als eigener Vorgang mit eigenem Event
- Kursabsage in der Oberfläche: `courses.status = 'canceled'` statt Löschen, Teilnehmende werden benachrichtigt
- **Lehrerin entfernen** (entschieden 14.09.): Hinweis „{Name} hat noch N kommende Kurse“ mit zwei Wegen je Kurs
  oder gesammelt — **übergeben** an eine andere Lehrkraft oder **absagen** (Benachrichtigung + Erstattung).
  Solange kommende Kurse offen sind, ist das Entfernen gesperrt. Das Profil wird deaktiviert, nicht gelöscht (4.3)
- `charge.refunded` / `refund.updated` per Webhook als Wahrheit
- **„Erstattung ausstehend“ anzeigen** (entschieden 14.09.): Stripe zieht Erstattungen bei Direct Charges vom
  verfügbaren Guthaben des Studios ab und hält Kartenerstattungen zurück, bis es reicht (docs.stripe.com/refunds,
  abgerufen 14.09.). Teilnehmende und Studio sehen diesen Zustand, statt ihn für einen Fehler zu halten

**Akzeptanz:** Voll-, Teil- und Doppelerstattung (zweite wird abgelehnt). Kursabsage mit drei bezahlten
Buchungen → drei Erstattungen, drei Events. Refund fehlgeschlagen → sichtbarer Status. **STOPP.**

#### 3.3 Manuelle Zahlungserfassung
*Als Studio möchte ich Bar-, Überweisungs- und PayPal-Zahlungen erfassen, damit sie denselben Beleg und
dieselbe Buchungszeile bekommen wie eine Online-Zahlung.*

- Bei manueller Anmeldung (`admin_register_user_for_course`, L5) und nachträglich an jeder Buchung
- Zahlungsarten `cash`, `bank_transfer`, `paypal_manual`, `provider = 'manual'`
- Funktioniert **auch ohne** aktivierte Online-Zahlung (B2, B3)

**Akzeptanz:** Eine Barzahlung erzeugt Zahlung, Event, Beleg und Buchungszeilen wie eine Kartenzahlung
(DB-Auszug nebeneinander). **STOPP.**

### Sprint 4 — Beleg und Hauptbuch

#### 4.1 Hauptbuch mit logischen Konten
*Als Studio möchte ich, dass jede Zahlung, Gebühr und Erstattung als unveränderliche Buchungszeile entsteht,
damit mein Steuerberater später eine vollständige Kette bekommt.*

- `ledger_entries` append-only (kein UPDATE/DELETE für irgendeine Rolle, Trigger als zweite Sperre),
  `account` = logischer Schlüssel (A6), `debit_cents`/`credit_cents`, `tax_code`, `event_id`,
  `booking_date`, `UNIQUE (event_id, account, …)` gegen Doppelbuchung
- Erzeugt ausschließlich aus Events. Stornos als Gegenbuchung
- Stripe-Gebühr aus der Balance Transaction als eigene Zeile

**Akzeptanz:** Doppelter Webhook → Buchungszeilen genau einmal. Summe Soll = Summe Haben je Event
(SQL-Prüfung). Die vier Schritte aus Briefing 5.5 für eine Testzahlung als Tabelle belegt (Auszahlung simuliert).
**Schema → Freigabe. STOPP.**

#### 4.2 Beleg / Kleinbetragsrechnung
*Als Teilnehmerin möchte ich nach der Zahlung einen korrekten Beleg bekommen.*

- `invoices` + `invoice_lines` gemäß E4. Nummernkreis je Tenant und Jahr, lückenlos, vergeben in derselben
  Transaktion wie die Ausstellung (Sperre auf Zähler-Zeile)
- Unveränderlich ab Ausstellung (Trigger), Korrektur nur als Storno + Neuausstellung (`cancels_invoice_id`)
- Stammdaten **als Kopie** in die Rechnung (nicht per FK auf die aktuelle Version)
- Leistungsdatum = `courses.date`, getrennt vom Rechnungsdatum. Steuersatz je Position
- Kleinunternehmer: keine USt, Hinweis § 19 UStG
- **Vollständige Rechnung wird mitgebaut** (entschieden 14.09.): Kleinbetragsrechnung nach Kenntnisstand nur bis
  250 € brutto, Kurspreise dürfen laut `courses_price_range_check` bis 1.000 € gehen. Oberhalb der Grenze braucht
  es Name und Anschrift der Kundin — die Registrierung fragt die Adresse heute nicht ab. Grenze und Pflichtangaben
  bestätigt der Steuerberater
- PDF erzeugen und mit SHA-256-Hash speichern. Ort (Supabase Storage mit RLS) in der Story festlegen

**Akzeptanz:** Zwei Studios vergeben unabhängig `2026-00001`. Paralleles Ausstellen erzeugt keine Lücke und
keine Dublette. UPDATE auf eine ausgestellte Rechnung schlägt fehl. **Schema → Freigabe. STOPP.**

#### 4.3 Löschen und Aufbewahren
*Als Studio möchte ich Personen und Kurse entfernen können, ohne dass Belege verloren gehen.*

- FKs von `payments`, `invoices`, `ledger_entries` auf `users`/`courses`/`tenants`: `RESTRICT`, nie `CASCADE`
- Konzept Art. 17 gegen Art. 18: Profil wird bei vorhandenen Belegen **eingeschränkt** statt gelöscht
- Prüfen und anpassen: `delete-user`, `delete_tenant_complete`, Regel M6 (letztes Profil → Login weg) (L8)

**Akzeptanz:** Löschversuch Profil mit Beleg → Einschränkung statt Löschung, Beleg bleibt lesbar.
**Berührt Rollen-/Löschlogik → eigener, angekündigter Auftrag laut `CLAUDE.md`. STOPP.**

### Sprint 5 — Absicherung und PROD-Reife

#### 5.1 Nächtlicher Abgleich
Edge Function per `pg_cron`: Zahlungen und Erstattungen der letzten 72 Std. je verbundenem Konto gegen die
Stripe-API. Abweichung → Event `reconciliation.mismatch`, sichtbar im Backoffice. Fehlende Events werden über
denselben Verarbeitungsweg nachgezogen.
**Akzeptanz:** Webhook bewusst verworfen → der Abgleich findet und korrigiert ihn. **STOPP.**

#### 5.2 Testsuite für die Fälle, die weh tun
Doppelter Webhook · Webhook in falscher Reihenfolge · abgelaufene Reservierung mit später Zahlung · letzter
Platz parallel · Rückbuchung (Dispute) nach besuchtem Kurs · Teilerstattung · Storno einer Rechnung ·
Cross-Tenant-Zugriff auf `payments`, `invoices`, `ledger_entries`, `provider_events_raw` · Live-Event auf DEV ·
Betragsmanipulation. Jeder Fall mit Nachweis im Abschlussbericht. **STOPP.**

#### 5.3 Rechtliche Pflichten im Checkout
AGB je Studio (inkl. Stornofrist aus E3) · Datenschutzhinweis je Studio, der Stripe als eigenständig
Verantwortlichen nennt · Impressum je Subdomain (aus 1.1) · Preisangaben · Button · Bestätigung in Textform.
Für terminierte Kurstermine kein Widerrufsbutton, Hinweis auf § 312g Abs. 2 Nr. 9 BGB.
**Blocker für PROD, nicht für DEV. Texte liefert ein Anwalt, nicht der Agent. STOPP.**
**Entschieden 14.09.:** Die Inhalte wandern ins Epic „Rechtliche Grundlagen“. Frage an den Anwalt dort: Gilt der
Ausschluss des Widerrufsrechts auch für Kursreihen, Ausbildungen und Online-Kurse, oder nur für einzelne Termine?

---

## 7. DEV-Test und PROD-Gate

**DEV (ab Sprint 1):**

| Was | Wo |
|---|---|
| Stripe | Testmodus des Plattformkontos, nur `sk_test_`/`pk_test_` |
| Webhook-Ziel | `https://<DEV-Ref>.supabase.co/functions/v1/payments-webhook`, zwei Endpoints (Plattform, Connect) |
| Frontend | `<slug>.omlify-dev.de`, z. B. `demoalpha` |
| Testdaten | `npm run seed:dev` bekommt ein Studio mit aktivierter Online-Zahlung (Onboarding-Testdaten) und eines ohne |
| Voraussetzung | Supabase-CLI auf dem jeweiligen Rechner angemeldet (`npx supabase login`), sonst scheitert `db.mjs functions dev`. PC: angemeldet (14.09.), Laptop: nicht angemeldet (13.09.) |

**PROD erst, wenn alles zutrifft:**

1. Alle Stories grün auf DEV, Testsuite 5.2 belegt
2. **Mehrfachmitgliedschaft (Stufen 1–3c) ist auf PROD.** Zahlungen hängen an `get_my_member_id()` und
   Profil-IDs. PROD hat heute nur Stufe 0. Ohne diesen Merge kann das Epic nicht nach PROD
3. Stripe-Verifizierung live abgeschlossen, Platform Profile auch im Live-Modus konfiguriert
4. Live-Webhook-Endpoints angelegt, Secrets nur im PROD-Projekt
5. Story 5.3 abgeschlossen, Texte anwaltlich geprüft
6. Steuerberater hat Beleg und Buchungslogik gesehen
7. AVV-Vorlage für Studios liegt vor (Briefing 11, parallel)
8. Probelauf auf einer PROD-Kopie, dann Migrationen nach `SCHEMA_RELEASE_WORKFLOW.md`
9. Erste Live-Zahlung: ein echtes Studio, ein kleiner Betrag, sofortige Erstattung, Kette bis zur Buchungszeile geprüft
