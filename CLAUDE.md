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
- `src/design/brand.ts` — Farbableitung, Kontrastregel, Voreinstellungen; plattformneutral (Expo).
- `src/lib/brandTheme.ts` — setzt die Brand-Variablen zur Laufzeit, Cache pro Studio.
- `src/lib/studioBranding.ts` — einziger Weg für Logo-URL, Logo-Upload und Speichern von Name/Design.
- `src/lib/documentBranding.ts` — Tab-Titel und Favicon.
- `src/components/branding/StudioMark.tsx` — einzige Stelle „Logo oder Name".
- `src/components/settings/StudioDesignSection.tsx` — Einstellungen „Studio & Design", nur Owner.
- `src/lib/format.ts` — Datum, Uhrzeit, Preis, Dauer. Formatierung passiert nirgendwo sonst.
- `src/lib/courseDateFilter.ts` — Filterlogik der Kursliste
- `src/lib/courseDateTime.ts` — `isRegistrationVisible` ist die einzige Regel, welche
  Anmeldungen angezeigt werden (Kurs nicht abgesagt wie in `register_for_course`,
  sichtbar bis Kursende); `hasCourseEnded`, `isCourseRunning`.
- `src/components/ui/AccentPill.tsx` — einzige Quelle für Safran-Status.
- `src/components/courses/CourseRow.tsx` — einzige Kurszeile (alle Kurslisten).
- `src/lib/useCourseEnrollment.ts` und `src/components/courses/CourseEnrollmentDialogs.tsx` —
  einziger Weg für Selbstanmeldung im Client.
- `src/lib/useCourseDeletion.ts` und `src/components/courses/CourseDeleteDialog.tsx` —
  einziger Weg, Kurse zu löschen (nur Owner/Admin, nur kommende Termine, Personenzahl
  geprüft, Anzahl gelöschter Zeilen geprüft).
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
- Ein von RLS still verhindertes DELETE/UPDATE liefert keinen Fehler, sondern 0
  Zeilen. Schreibende Aufrufe mit `.select()` ausführen und die Zeilenzahl prüfen.
- `fetchCourseParticipantCounts` liefert bei Fehler `{}`. Die RPC gibt für jeden
  existierenden Kurs eine Zeile zurück; fehlt eine ID, ist die Zählung gescheitert.
- `tenants` hat seit `20260915082415` `brand_color`, `tagline`, `logo_path`,
  `logo_in_sidebar`, `logo_on_auth`, `sidebar_show_name`. Seit `20260915115057`
  `default_max_participants` (1–50). `tenants` ist für `anon` lesbar — dort nichts
  Internes ablegen. Schreiben nur über `update_studio_branding` und `set_studio_logo`
  (nur Owner, `SECURITY DEFINER`) bzw. `update_booking_settings` (Owner und Admin).
  `anon`/`authenticated` haben auf `tenants` nur SELECT — direktes Schreiben liefert
  42501. `brand_color` hat einen CHECK mit `yogaflow_private.is_brand_color_allowed`;
  jede Rolle, die in `tenants` schreibt, braucht EXECUTE darauf. Bucket
  `studio-branding`: Pfad `<tenant_id>/logo-<ms>.<png|jpg|webp>`; direktes Löschen in
  `storage.objects` blockt Supabase — nur über die Storage-API.

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

**Plattformtabellen `system_settings` und `admin_emails` (Hotfix 15.09.2026)**

Owner/Admin jedes Studios durften `system_settings` lesen und schreiben (Policies ohne
Studio-Bezug). Jedes Login durfte `admin_emails` lesen (`USING true`). `anon` und
`authenticated` hatten Tabellen-ALL. Seit Migration `20260915104222` (DEV und PROD)
dürfen nur `postgres` und `service_role` auf die Tabellen; je Tabelle nur die Policy
`*_service_role_all`. App und Edge Functions lesen die Tabellen nicht (`grep` in `src/`
und `supabase/functions/`: 0 Treffer). `ensure_public_user` bleibt `SECURITY DEFINER`
(Eigentümer postgres) und darf `admin_emails` intern weiter lesen.

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
- **PROD:** Auf `main` liegt von diesen Mehrfachmitgliedschaft-Migrationen keine. Hotfixes
  auf `main` und PROD: `20260911134500` (Spaltenrechte `users`) und `20260915104222`
  (Plattformtabellen). Die PROD-Datenbank vor dem Release mit `npm run db:status:prod`
  bestätigen.

---

## Designsystem

Maßgeblich ist `docs/DESIGNSYSTEM.md`. Das Wichtigste in Kürze:

- Kein Hex-Wert in einer Komponente. Nur semantische Tokens.
- Die Grünrampe heißt **`sage`**, nicht `green` — sonst würde Tailwinds eigenes Grün
  überschrieben.
- Hintergrund warmer Sand `#F5F3EF`, Marke Tief-Salbei `#2F5A4E`, Akzent Safran `#B87A2E`.
- `--color-brand` und die vier zugehörigen Tokens sind pro Studio überschreibbar (eine Markenfarbe,
  abgeleitet in `brand.ts`).
- Text auf `brandSoft` nur in `brandOnSoft`.
- Uhrzeit nie mit Sekunden, Datum ausgeschrieben, Preis als `18 €`.
- Gefüllt in `danger` ist nur ein Knopf, der sofort etwas Unwiderrufliches auslöst.
- Erfolg wird nie allein über Farbe signalisiert.
- Anrede immer ‚du', kleingeschrieben — auch in Mails, Edge Functions und RPC-Meldungen.

---

## Stand (15.09.2026)

**Release 2026-09 — offen.** `Julius` liegt 84 Commits und 13 Migrationen vor `main`, dazu kommen
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
es nur noch auf der Kursdetailseite, nicht mehr in der Kursliste. Teilnehmerzahl (`n/max Plätze`)
steht nur auf der Detailseite, nicht in den Kurszeilen — siehe Gruppe P. Meta-Zeile bricht
um (höchstens zwei Zeilen) statt mit `…` abzuschneiden — siehe Gruppe Q.

**Kursverwaltung und Löschen:** Zeilen ohne Aktionen, gemeinsame `CourseRow`, Löschen nur auf
der Detailseite für Owner/Admin bei kommenden Terminen — siehe `docs/RELEASE_2026-09.md` Gruppe J.

**Anrede du 15.09.:** App, Mails, Edge Functions und Anmelde-RPCs duzen durchgängig —
siehe `docs/RELEASE_2026-09.md` Gruppe K. RPC-Migration `20260915003628` (Rückweg:
`supabase/snapshots/2026-09-15_pre_du_enrollment_rpcs_dev.sql`).

**Tenant-Branding 15.09.:** Owner stellen Name, Markenfarbe, Kurzbeschreibung und Logo ein — siehe
`docs/RELEASE_2026-09.md` Gruppe L. Migrationen `20260915082415`, `20260915090020`.

**Hotfix Plattformtabellen 15.09.:** `system_settings` und `admin_emails` nur noch
`service_role` — siehe `docs/RELEASE_2026-09.md` Gruppe M. Migration `20260915104222`
(auf Julius `8d3dbdc`, auf `main` `e0c4b86` / Merge `267f87f`; DEV und PROD).

**Buchungseinstellungen 15.09.:** Standard-Teilnehmerzahl pro Studio, Stornofrist-Feld
entfernt, Härtung `tenants`/`global_settings` — siehe `docs/RELEASE_2026-09.md` Gruppe O.
Migration `20260915115057` (`ad0d25a`, `2e30a05`).

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
  Die Funktion wurde am 11.09. in `20260911173000` neu geschrieben (`:454`) und am 15.09. in
  `20260915003628` erneut (`:183`); `pg_temp` steht an beiden Stellen weiterhin drin. Beim
  nächsten Anfassen entfernen.
- JS-Bundle 1.072 kB, gzip 282 kB (Build vom 15.09.2026 auf diesem Stand: `1,071.56 kB` /
  `282.47 kB`). Relevant, weil die Zielgruppe über Instagram aufs Handy kommt. Nach Paket 3
  angehen, zusammen mit der Frage, ob die Marketingseite aus der SPA gelöst wird.
- `close_past_course_registrations()` ist ohne jede Prüfung für `anon` aufrufbar, wirkt über
  alle Tenants und rechnet `date + time` als UTC statt `Europe/Berlin`. **Sie scheitert außerdem bei
  jedem Aufruf** (`NULLIF(c.time, '')` auf einer `time`-Spalte → `invalid input syntax for type time`,
  auf DEV belegt am 14.09.), unbemerkt, weil `registrationMaintenance.ts` das Ergebnis nicht auswertet.
  Geplant: entfernen statt reparieren (Geldkette Story 0.2).
- `ensure_public_user` weicht DEV/PROD ab: auf PROD schreibt die Funktion noch in die
  entfernte Spalte `roles`. Der Rückfallpfad scheitert immer; der Normalfall kehrt
  vorher zurück. Die DEV-Funktion (`20260911185000`) schreibt nicht mehr in `roles`,
  setzt `is_admin` aber ungenutzt.
- `Profile.tsx` ändert nur die Kopie `users.email`, nicht die Login-E-Mail. In PROD ist das
  bei einem Konto auseinandergelaufen.
- PROD: 2 Logins ohne Profil, 1 Studio ohne Profil.
- Supabase CLI lokal v2.77.0, aktuell v2.117.0.
- Kursliste der Kursleitung auf der Übersicht filtert abgesagte Kurse nicht
  (`Dashboard.tsx:83`, nur `isCourseUpcoming`).
- `canSelfEnrollInCourse` (`userRoles.ts:21-29`, genutzt in `CourseDetail.tsx:154`) prüft
  `status === 'active'`; der Server wertet `NULL` als aktiv (`coalesce(v_course_status, 'active')`
  in `register_for_course`, `20260915003628` Zeile 92 / `isCourseCancelled` in
  `courseDateTime.ts:84-90`) — ein Kurs mit `status` `NULL` zeigt auf der Detailseite keinen
  Anmeldeknopf.
- Kursliste blendet laufende Kurse ab Beginn aus (`isCourseUpcoming`, `Courses.tsx:52`, `:107`,
  `:168`), Übersicht und Meine Anmeldungen zeigen sie bis Kursende (`isRegistrationVisible`).
- Warteliste-Wortlaut: „Warteliste Pos. 3" Kursliste und Detailseite (`Courses.tsx:253`,
  `CourseDetail.tsx:326`), „Warteliste (Pos. 3)" Meine Anmeldungen (`EnrollmentCards.tsx:34`),
  „Warteliste 3" Teilnehmer mobil (`Participants.tsx:407`), „Warteliste (Pos. 3)" Teilnehmer
  Desktop (`Participants.tsx:525`).
- „Noch Plätze frei" lädt höchstens 30 Kandidaten, kein Nachladen (`Dashboard.tsx:95`).
- „Anmelden" ohne Ladezustand (`useCourseEnrollment.ts:68`, `CourseDetail.tsx:343-357`): kein
  `registering`-Flag, der Knopf wird nicht gesperrt; Doppeltipp löst zwei Anfragen aus.
- Tabelle `email_templates` (Seed `20250804174553` / `20260106130712`) enthält gesiezte
  Vorlagen, wird von App und Functions nicht gelesen (`grep email_templates` in `src/` und
  `supabase/functions/`: 0 Treffer) — Altbestand. Jeder Manager darf global schreiben
  (Policies ohne Studio-Bezug) — beim Entfernen des Altbestands mitnehmen.
- Bestätigungsmail-HTML doppelt in `request-verification-email` (`index.ts:110-124`) und
  `send-verification-email` (`index.ts:114-128`).
- `CourseDetail.tsx:60-64` / `:136-144` zeigt bei Ladefehler „Kurs nicht gefunden" statt der
  Fehlermeldung.
- `courses.duration` hat Default 60 (`20251105155932` Zeile 60) und ist unzuverlässig — Dauer
  aus `time`/`end_time` (`courseDurationMinutes` in `courseDateTime.ts:42-49`). `room` und
  `prerequisites` werden angezeigt (`CourseDetail.tsx:161`, `:256-259`, `:167`, `:295-298`), aber von keinem
  Formular geschrieben (`CreateCourse.tsx` / `EditCourse.tsx`: kein Treffer für `room` oder
  `prerequisites`).
- `index.html:6` ohne `viewport-fit=cover`; `env(safe-area-inset-bottom)` in der Aktionsleiste
  (`CourseDetail.tsx:312`) ist daher meist 0.
- Löschen kaskadiert Anmeldungen (`registrations.course_id`, `20250804174545` Zeile 24) und
  Kurs-Chat (`messages.course_id`, `20251105155932` Zeile 132) ohne Benachrichtigung;
  „Absagen statt Löschen" offen (Strategie).
- Trigger `promote_waitlist_after_registered_delete` (`20260907153100` Zeilen 50–59) läuft in
  der Löschkaskade und ruft `promote_from_waitlist` auf; ob kurz eine Nachricht „Du hast Glück …"
  entsteht (`20260907113107` Zeile 384), ist ungeprüft.
- Owner/Admin sehen in „Kurse verwalten" nur eigene Kurse (`MyCourses.tsx:38`,
  `teacher_id` = self); fremde erreichen sie über „Kurse" und die Detailseite.
- `global_settings` nur-lesend seit `20260915115057`, nach dem Release entfernen.
- `Users.tsx:679` / `:440` rechnet `new Date(c.date)` auf `courses.date` — verstößt gegen die Datumsregel.
- Karte „Systeminformationen" in `Settings.tsx` zeigt „Datenbankstatus: Verbunden" als festen Text ohne Prüfung.
- Kein Admin-Login auf DEV.
- `anon`/`authenticated` haben auf den `public`-Tabellen Tabellen-TRUNCATE; RLS gilt dafür nicht, PostgREST bietet es
  nicht an. Schreiben auf `tenants` seit `20260915115057` gesperrt (42501); `MAINTAIN` (PG17 `m`) bleibt für 7c.
- `scripts/db.mjs`: Windows-Hänger behoben und belegt (`ca6fe70`). Node warnt `DEP0190` (`spawnSync` mit `shell: true`;
  die DB-URL läuft durch cmd) — beim nächsten Anfassen ohne Shell aufrufen. PROD-Push braucht voraussichtlich `--include-all`.

---

## Was nicht hier entschieden wird

Produktstrategie, Positionierung, Preisgestaltung, Zielbild und die Frage, ob ein Feature
überhaupt gebaut werden soll, bespricht Julius in einem separaten Claude-Projekt, in dem die
Entscheidungsdokumente liegen. Wenn eine Aufgabe hier eine solche Frage aufwirft: benennen
und zurückspielen, statt sie nebenbei zu beantworten.
