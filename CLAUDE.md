# Omlify — Projektkontext für Claude Code

Diese Datei wird bei jedem Start automatisch gelesen. Sie beschreibt das Produkt, die
Arbeitsweise und den aktuellen Stand. Halte sie aktuell, wenn sich etwas Grundlegendes ändert.

---

## Was Omlify ist

Multi-Tenant-SaaS für Yoga-Lehrende und -Studios im deutschen Markt. Jeder Tenant hat eine
eigene Subdomain, eigenes Branding und strikt getrennte Daten. Kernfunktionen heute:
Kursverwaltung, Buchungen, Teilnehmerverwaltung, Rollen, Nachrichten.

Langfristiges Zielbild: ein Betriebssystem für Yoga-Unternehmen, das operative und
administrative Arbeit abnimmt — Buchung ist nur der Anfang. AI kommt später und tief in die
Prozesse integriert, nicht als angeklebter Chatbot.

Zielgruppe zuerst: selbstständige Yoga-Lehrende, nicht große Studioketten.

## Wer hier arbeitet

Julius, Gründer. Kommuniziert auf Deutsch, Code-Bezeichner auf Englisch. Entwickelt
AI-assistiert — nicht jede Zeile im Repo ist von Hand geschrieben. Er will Architektur
verstehen, nicht nur fertigen Code bekommen.

## Wie hier gearbeitet wird

**Audit vor Umsetzung.** Bevor etwas geändert wird, wird die Ursache belegt. Keine
Vermutungen über Code, der nicht gelesen wurde.

**STOPP-Gates.** Größere Aufgaben laufen in nummerierten Schritten mit ausdrücklichen
Haltepunkten. An einem STOPP wird auf Freigabe gewartet, nicht weitergearbeitet.

**Nachweise statt Zusicherungen.** Build-Ausgaben, `grep`-Zählwerte und Screenshots im
Wortlaut. „Funktioniert wie erwartet" ohne Beleg zählt nicht.

**Unsicherheiten offenlegen.** Wenn bei einer Aufgabe eine Entscheidung selbst getroffen
wurde, gehört sie mit Datei, Zeile und Begründung in den Abschlussbericht.

**Nach jedem abgenommenen STOPP pushen.** `omlify-dev.de` baut aus Branch `Julius`.
Nicht gepusste Commits bedeuten, dass Julius auf dem Handy einen veralteten Stand bewertet —
das ist schon einmal passiert und hat Zeit gekostet.

**Widersprechen ist erwünscht.** Wenn eine Anweisung fachlich falsch ist oder ein Feature
sich in einen Design- oder Refactoring-Durchlauf einschleicht: sagen, nicht ausführen.

## Harte Grenzen

- Keine Datenbankmigration und kein Schemaeingriff ohne ausdrückliche Freigabe.
- Keine Änderung an Auth, RLS, Rollen oder Tenant-Auflösung ohne eigenen, angekündigten Auftrag.
- Keine neuen Abhängigkeiten ohne Rückfrage.
- Produktionsdaten werden nie verändert.
- Der Service-Role-Key bleibt serverseitig. Niemals in eine `VITE_`-Variable.
- Feature-Arbeit und Design-/Aufräumarbeit kommen nie in denselben Commit.

---

## Stack und Struktur

- React 18, Vite 7, TypeScript, Tailwind CSS 3.4
- Supabase (PostgreSQL, Auth, RPCs, Edge Functions)
- Cloudflare Pages, DEV baut aus Branch `Julius` → `omlify-dev.de`
- Geplant für Monat 3: native App mit Expo für den Teilnehmer-Fluss. Die Web-App bleibt
  für Backoffice und öffentliche Buchungsseite. Deshalb sind Design-Tokens
  plattformneutral gehalten.

**Wichtige Dateien**

- `src/design/tokens.ts` — einzige Farbquelle, wandert später in ein gemeinsames Paket
- `src/lib/format.ts` — Datum, Uhrzeit, Preis, Dauer. Formatierung passiert nirgendwo sonst.
- `src/lib/courseDateFilter.ts` — Filterlogik der Kursliste
- `src/lib/courseDateTime.ts` — `isRegistrationVisible` ist die einzige Regel, welche
  Anmeldungen angezeigt werden (Kurs nicht abgesagt wie in `register_for_course`,
  sichtbar bis Kursende); `hasCourseEnded`, `isCourseRunning`.
- `src/components/ui/AccentPill.tsx` — einzige Quelle für Safran-Status.
- `src/components/courses/CourseRow.tsx` — einzige Kurszeile (Dashboard, Kurse, Meine Anmeldungen).
- `src/lib/useCourseEnrollment.ts` und `src/components/courses/CourseEnrollmentDialogs.tsx` —
  einziger Weg für Selbstanmeldung im Client.
- `src/pages/CourseDetail.tsx` — `/course/:courseId`, einziger Ort für Anmelden/Abmelden.
- `canSelfEnrollInCourse` in `src/lib/userRoles.ts` — ob die Detailseite einen Anmeldeknopf zeigt.
- `src/lib/tenantSlug.ts` — einzige Quelle für den Studio-Slug (Host, in DEV `?tenant=`
  und `sessionStorage`). `src/lib/supabase.ts` hängt ihn als `x-omlify-tenant` an jeden
  Supabase-Request; die RLS-Policies hängen daran.
- `docs/DESIGNSYSTEM.md` — verbindliche Farben, Formregeln, Formatierungsregeln

**Datenmodell — Fallen**

- Die Nutzertabelle heißt `users`, nicht `profiles`. Chat liegt in `messages`,
  es gibt keine `conversations`.
- `courses.date` ist `date`, `courses.time` und `end_time` sind `time without time zone`.
  Alle drei kommen als **String** an (`"2026-05-14"`, `"16:15:00"`).
  **Diese Werte dürfen niemals durch `new Date()` laufen** — das verschiebt Uhrzeiten je
  nach Umgebung. `messages.created_at` und `registrations.registered_at` sind dagegen
  `timestamptz`, dort ist `Intl.DateTimeFormat` mit `Europe/Berlin` korrekt.
- **Login und Profil sind seit dem 11.09.2026 nicht mehr dasselbe.** `public.users.id` ist
  eine eigenständige Profil-ID mit `DEFAULT gen_random_uuid()`; der Login steht in
  `users.auth_user_id` (FK auf `auth.users`, `ON DELETE CASCADE`). Ein Login kann mehrere
  Profile besitzen, eines je Studio — erzwungen durch `UNIQUE (auth_user_id, tenant_id)`.
  Eine Membership-Tabelle gibt es weiterhin nicht; die Zeile in `users` **ist** die
  Mitgliedschaft. `users.tenant_id` bleibt `NOT NULL`.
- **`users.id` ist nicht `auth.uid()`.** Im Client darf ein Profil nie über
  `.eq('id', session.user.id)` geladen werden. Dafür gibt es `get_current_member()`.
- `users.email` ist **pro Tenant** eindeutig, nicht global: `users_tenant_email_unique
  UNIQUE (tenant_id, email)`, gesetzt in `20260426110000`, wo `users_email_key` fiel.
  Dieselbe Adresse kann also bei mehreren Studios liegen — die Mehrfachmitgliedschaft
  scheitert nicht daran.
- Rollen: `owner`, `admin`, `teacher`, `user`. Die Rolle hängt am Profil, nicht am Login —
  dieselbe Person kann in Studio A `owner` und in Studio B `user` sein.

**Tenant-Isolation (geprüft am 09.09.2026, umgebaut am 11.09.2026)**

RLS ist auf allen 12 Tabellen in `public` aktiv. Die Policies vergleichen durchgängig
`tenant_id = yogaflow_private.get_my_tenant_id()`, in `USING` und `WITH CHECK`. Anwendungs-
Queries filtern deshalb bewusst nicht selbst nach `tenant_id` — die Durchsetzung liegt in der
Datenbank. Helferfunktionen sind `SECURITY DEFINER` mit `SET search_path TO 'public'`.
`get_my_tenant_id()` liefert bei fehlendem Profil `NULL`, die Policy schlägt dann fehl.
Das ist fail-closed und soll so bleiben.

Seit Migration `20260911173000` beantworten Policies und Helfer die Frage „wer bin ich"
nicht mehr mit `auth.uid()`, sondern mit `yogaflow_private.get_my_member_id()`. Diese
Funktion löst Login **und** Studio auf:

- Studio kommt aus dem Request-Header `x-omlify-tenant`, gelesen von
  `yogaflow_private.request_tenant_slug()`. Der Slug muss `^[a-z0-9]{3,30}$` erfüllen,
  sonst liefert die Funktion `'#invalid'` und damit kein Treffer.
- Der Header wird clientseitig in `src/lib/supabase.ts` auf **jeden** Supabase-Request
  gesetzt, sobald `currentTenantSlug()` einen Slug kennt.
- **Übergangsregel:** Fehlt der Header, gilt das Profil des Logins, wenn es genau **eines**
  gibt — sonst `NULL`. Diese Regel ist bewusst befristet und wird entfernt, sobald PROD
  stabil mit Header läuft. Wer sie anfasst, muss vorher prüfen, ob alle Aufrufpfade den
  Header senden (Edge Functions inklusive).

**Selbst-Update auf `users` (Befund und Fix 11.09.2026)**

Die Policies verglichen `tenant_id`, aber `tenant_id` selbst war vom Client änderbar:
`users_update_own_profile` prüft nur `id = auth.uid()`, und `anon`/`authenticated` hatten
Tabellen-UPDATE auf alle Spalten. Eine Teilnehmerin konnte sich so in ein fremdes Studio
umschreiben und `email_verified` selbst setzen (auf DEV bewiesen, in PROD keine Spur einer
Ausnutzung). Seit Migration `20260911134500` (DEV und PROD) darf `authenticated` auf `users`
nur `first_name, last_name, email, phone, street, house_number, postal_code, city, role`
ändern, `anon` nichts.

- Neue Spalten auf `users` sind automatisch gesperrt. Eine Freigabe braucht einen Beleg aus
  dem Client-Code.
- `REVOKE … FROM PUBLIC` entzieht auf Supabase `anon` und `authenticated` nichts. Dort immer
  explizit entziehen.
- `email` ist nur vorläufig freigegeben und wird mit der Mehrfachmitgliedschaft Login-Sache.

**Mehrfachmitgliedschaft (Umbau vom 11.09.2026, nicht abgeschlossen)**

Ziel: ein Login, mehrere Studios. Der Umbau läuft in Stufen, jede als eigene Migration mit
Zweck, Rückweg und einem `DO $$`-Block, der sich selbst prüft und bei Abweichung abbricht.

| Migration | Stufe | Inhalt |
|---|---|---|
| `20260911151200` | 1 — Vorbereiten | Spalte `auth_user_id`, Backfill, `UNIQUE (auth_user_id, tenant_id)` |
| `20260911151300` | Diagnose | `debug_request_tenant_header()` — **in Stufe 4 zu entfernen** |
| `20260911173000` | 2 — Umschalten | `get_my_member_id()`, sieben `yogaflow_private`-Helfer, 14 Policies, drei Kurs-RPCs |
| `20260911182000` | 3a — Öffnen | `users.id` von `auth.users` entkoppelt, `join_tenant()`, `join_tenant_as_owner()` |
| `20260911185000` | 3b — Identität | `auth_tokens.user_id` zeigt auf den Login, Token-RPCs auf `auth_user_id` |
| `20260911192600` | 3c-A — Client | `get_current_member()` als einziger Weg zum eigenen Profil |

Was das für die Arbeit heißt:

- **Punkt ohne Rückweg:** Sobald ein Login ein zweites Profil besitzt, ist ein Rollback ohne
  Datenverlust nicht mehr möglich — eine UUID kann nicht gleichzeitig zwei Profilzeilen und
  `auth.users.id` sein. Solange `auth_user_id IS DISTINCT FROM id` null Zeilen zählt, sind
  die Rückwege in den Migrationsköpfen gültig.
- **Beitritt zu einem weiteren Studio** läuft seit `61d15f8` (13.09.) über `JoinStudio.tsx` →
  `join_tenant()`. `join_tenant_as_owner()` (eingeloggt ein eigenes Studio gründen) hat weiterhin
  keinen Aufruf im Client.
- Rückfallpunkt für das ganze Vorhaben: `supabase/snapshots/2026-09-11_pre_membership_dev.sql`.
- `update-user` schreibt seit `0e8bf0f` (3c-B2) nur noch Profilfelder, nie Login-E-Mail oder Passwort.
- **PROD:** Auf `main` liegt von diesen Migrationen keine, nur der Hotfix `20260911134500`.
  Die PROD-Datenbank vor dem Release mit `npm run db:status:prod` bestätigen.

---

## Designsystem

Maßgeblich ist `docs/DESIGNSYSTEM.md`. Das Wichtigste in Kürze:

- Kein Hex-Wert in einer Komponente. Nur semantische Tokens.
- Die Grünrampe heißt **`sage`**, nicht `green` — sonst würde Tailwinds eigenes Grün
  überschrieben.
- Hintergrund warmer Sand `#F5F3EF`, Marke Tief-Salbei `#2F5A4E`, Akzent Safran `#B87A2E`.
- Nur `--color-brand` und die vier zugehörigen Tokens sind später pro Tenant überschreibbar.
- Uhrzeit nie mit Sekunden, Datum ausgeschrieben, Preis als `18 €`.
- Gefüllt in `danger` ist nur ein Knopf, der sofort etwas Unwiderrufliches auslöst.
- Erfolg wird nie allein über Farbe signalisiert.

---

## Stand (14.09.2026)

**Release 2026-09 — offen.** `Julius` liegt 59 Commits und 9 Migrationen vor `main`, dazu kommen
Änderungen an allen 9 Edge Functions. Den Umfang nach Themen beschreibt `docs/RELEASE_2026-09.md`.
Umfang und Zeitpunkt des Schnitts werden am 15.09. besprochen. Bis zum Schnitt ist `Julius` die
Release-Linie. Fixes, Landingpage- und Design-Änderungen für das Release gehen dort hinein.
**Code aus der Geldkette kommt erst nach dem Schnitt und nach der Release-Abnahme auf DEV nach
`Julius`**, weil DEV nur eine Datenbank und eine Domain hat. Bis dahin liegt er auf dem eigenen
Branch `feature/geldkette` (committet und gepusht, aber nicht auf DEV, keine Migration in der
DEV-Datenbank). Der Branch `release/2026-09` entsteht erst am Tag des Schnitts als Kopie von `Julius`.

**Design — fertig:** Paket 1 (Tokens, Farbmigration, Grundflächen, Form), Paket 2 (Datum,
Uhrzeit, Preis, `tabular-nums`, Versalien) und Paket 3 vollständig: Kursliste und
Kursverwaltung nach Tagen (`85b9c44`, `a9991d5`), Teilnehmerliste nach Kurs (`b6387cf`),
Dashboard-Zeilen und Kennzahlen in einer Zeile (`a6f25e2`, `1ac8b8a`), Seitentitel im Kopf
(`468bcb3`), Hero-Karte „deine nächste Stunde" (`8605ede`). Wiederherstellungspunkt vor Beginn: Tag `pre-design-tokens` (`8cb4712`).

**Design-Durchlauf 14.09.:** Safran-Rampe, Hero + Danach, Noch Plätze frei, Datumsblock/Zeit-Chip,
AccentPill — siehe `docs/RELEASE_2026-09.md` Gruppe H.

**Kursdetail 14.09.:** Gemeinsame Kurszeile und Kursdetailseite mit Aktionsleiste — siehe
`docs/RELEASE_2026-09.md` Gruppe I. Anmeldeweg geändert: Anmelden, Warteliste und Abmelden gibt
es nur noch auf der Kursdetailseite, nicht mehr in der Kursliste.

**Datenmodell — Kern fertig auf DEV:** Mehrfachmitgliedschaft bis 3c-B2 (letzter Commit
`ed73a32`, 13.09.). Offen: Stufe 4 — `debug_request_tenant_header()` entfernen und die
befristete Übergangsregel ohne Header entfernen, sobald PROD stabil läuft.

**Geldkette 1a — geplant:** `docs/EPIC_GELDKETTE_1A.md` (Entwurf, Entscheidungen E1–E8 vom
14.09.). Startet mit Story 0.1 (Stripe-Dashboard, kein Code) und 0.2 nach dem Release-Schnitt.

**Danach — Paket 4:** destruktive Aktionen entschärfen, Tippziele 44 px, Leerzustände als
Einladung, Gedrückt-Zustand statt Hover.

**Notiert, bewusst nicht jetzt:**

- **Sicherheitsbefund `users` (Audit 14.09.):** Policy `users_select_participant_staff`
  (`20260519153000`; zuerst `20260519120000`) erlaubt Teilnehmenden SELECT auf jede Staff-Zeile
  im Tenant (`role IN ('teacher', 'admin', 'owner')`) — RLS ist zeilenweise, also E-Mail, Telefon,
  Adresse inklusive. `is_participant()` wurde in `20260911173000` auf `get_my_member_id()`
  umgestellt, die Policy selbst nicht. Auf DEV belegt, PROD ungeprüft. Vor PROD klären, eigener
  angekündigter Auftrag.
- `Dashboard.tsx` `getStatCards`, abschließendes `return []`: Fallback ist für alle vier Rollen unerreichbar, weil
  `teacher` vorher aus der Funktion springt. Toter Code, beim Dashboard-Umbau mitnehmen.
- `unregister_from_course` hat `pg_temp` im `search_path`, ohne temporäre Tabellen zu nutzen.
  Die Funktion wurde am 11.09. in `20260911173000` neu geschrieben, `pg_temp` steht dort in
  Zeile 454 weiterhin drin. Beim nächsten Anfassen entfernen.
- JS-Bundle 1.051 kB, gzip 276 kB (Build vom 14.09.2026 auf diesem Stand: `1,051.19 kB` /
  `275.83 kB`). Relevant, weil die Zielgruppe über Instagram aufs Handy kommt. Nach Paket 3
  angehen, zusammen mit der Frage, ob die Marketingseite aus der SPA gelöst wird.
- `close_past_course_registrations()` ist ohne jede Prüfung für `anon` aufrufbar, wirkt über
  alle Tenants und rechnet `date + time` als UTC statt `Europe/Berlin`. **Sie scheitert außerdem bei
  jedem Aufruf** (`NULLIF(c.time, '')` auf einer `time`-Spalte → `invalid input syntax for type time`,
  auf DEV belegt am 14.09.), unbemerkt, weil `registrationMaintenance.ts` das Ergebnis nicht auswertet.
  Geplant: entfernen statt reparieren (Geldkette Story 0.2).
- `ensure_public_user` schreibt noch in die entfernte Spalte `roles`. Der Rückfallpfad
  scheitert immer; der Normalfall kehrt vorher zurück.
- `Profile.tsx` ändert nur die Kopie `users.email`, nicht die Login-E-Mail. In PROD ist das
  bei einem Konto auseinandergelaufen.
- PROD: 2 Logins ohne Profil, 1 Studio ohne Profil.
- Supabase CLI lokal v2.77.0, aktuell v2.117.0.
- Kursliste der Kursleitung auf der Übersicht filtert abgesagte Kurse nicht
  (`Dashboard.tsx:83`, nur `isCourseUpcoming`).
- `canSelfEnrollInCourse` (`userRoles.ts:21-29`, genutzt in `CourseDetail.tsx:136`) prüft
  `status === 'active'`; der Server wertet `NULL` als aktiv (`coalesce(v_course_status, 'active')`
  in `register_for_course`, `20260911173000` Zeile 363 / `isCourseCancelled` in
  `courseDateTime.ts:84-90`) — ein Kurs mit `status` `NULL` zeigt auf der Detailseite keinen
  Anmeldeknopf.
- Kursliste blendet laufende Kurse ab Beginn aus (`isCourseUpcoming`, `Courses.tsx:52`, `:107`,
  `:168`), Übersicht und Meine Anmeldungen zeigen sie bis Kursende (`isRegistrationVisible`).
- Warteliste-Wortlaut: „Warteliste Pos. 3" Kursliste und Detailseite (`Courses.tsx:253`,
  `CourseDetail.tsx:286`), „Warteliste (Pos. 3)" Meine Anmeldungen (`EnrollmentCards.tsx:34`),
  „Warteliste 3" Teilnehmer mobil (`Participants.tsx:407`), „Warteliste (Pos. 3)" Teilnehmer
  Desktop (`Participants.tsx:525`).
- „Noch Plätze frei" lädt höchstens 30 Kandidaten, kein Nachladen (`Dashboard.tsx:95`).
- Kursverwaltung (`MyCourses.tsx:303-304`, `:330-331`) nutzt noch die alte Zeile mit Beschreibung.
- „Anmelden" ohne Ladezustand (`useCourseEnrollment.ts:68`, `CourseDetail.tsx:311-317`): kein
  `registering`-Flag, der Knopf wird nicht gesperrt; Doppeltipp löst zwei Anfragen aus.
- Anrede uneinheitlich — Anmeldemeldungen siezen (`useCourseEnrollment.ts:93`, `:119`:
  „Möchten Sie …"), Übersicht duzt (`Dashboard.tsx:479`); Titel „Anmeldung nicht moeglich"
  ohne Umlaut (`useCourseEnrollment.ts:83`). Entscheidung Du/Sie offen (Julius).
- `CourseDetail.tsx:57-60` / `:118-121` zeigt bei Ladefehler „Kurs nicht gefunden" statt der
  Fehlermeldung.
- `courses.duration` hat Default 60 (`20251105155932` Zeile 60) und ist unzuverlässig — Dauer
  aus `time`/`end_time` (`courseDurationMinutes` in `courseDateTime.ts:42-49`). `room` und
  `prerequisites` werden angezeigt (`CourseDetail.tsx:143`, `:149`, `:265-269`), aber von keinem
  Formular geschrieben (`CreateCourse.tsx` / `EditCourse.tsx`: kein Treffer für `room` oder
  `prerequisites`).
- `index.html:6` ohne `viewport-fit=cover`; `env(safe-area-inset-bottom)` in der Aktionsleiste
  (`CourseDetail.tsx:272`) ist daher meist 0.

---

## Was nicht hier entschieden wird

Produktstrategie, Positionierung, Preisgestaltung, Zielbild und die Frage, ob ein Feature
überhaupt gebaut werden soll, bespricht Julius in einem separaten Claude-Projekt, in dem die
Entscheidungsdokumente liegen. Wenn eine Aufgabe hier eine solche Frage aufwirft: benennen
und zurückspielen, statt sie nebenbei zu beantworten.
