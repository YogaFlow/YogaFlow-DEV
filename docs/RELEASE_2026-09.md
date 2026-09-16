# Release 2026-09 — Umfang DEV → PROD

**Stand:** 15.09.2026 · Grundlage für den Termin am 15.09. · **wächst bis zum Schnitt**
**Vergleich:** `origin/main` (`267f87f`, 15.09.) gegen `origin/Julius` (`2e30a05`, 15.09.)
**Gemeinsamer Vorfahr:** `4d43ad6` (07.09.)

| | |
|---|---|
| Commits auf `Julius`, nicht auf `main` | 84 |
| Dateien | 114 geändert, +13.567 / −2.695 Zeilen |
| Migrationen nur auf DEV | 13 |
| Edge Functions geändert | alle 9 plus `_shared/studio_slug_for_user.ts` |
| Nicht im Release | Geldkette 1a (`docs/EPIC_GELDKETTE_1A.md`), Stufe 4 der Mehrfachmitgliedschaft |

---

## A — Kurse, Warteliste, Lehrende (07.–08.09.) · 7 Commits

| Commit | Inhalt | Migration |
|---|---|---|
| `a9a49ac` | Wartelistenplätze werden nach einer Abmeldung lückenlos nachnummeriert | `20260907113107` |
| `8c352a2` | Lehrende können sich in fremde Kurse eintragen, Wartelisten-Plätze rücken automatisch nach | `20260907153100` |
| `90bfa45` | Dashboard Lehrende: eigene Anmeldungen und korrekte Restplätze | |
| `618c7f6` | Dashboard Lehrende: geleitete Kurse vor eigenen Anmeldungen | |
| `0e10845` | Lehrende sehen andere Kursleitungen auf Kurskarten | `20260907164800` |
| `2daab7a` | Lehrerfilter auf der Kursseite (`matchesCourseTeacherFilter` in `Courses.tsx`) | |
| `8cb4712` | Kursverwaltung und Anmeldungen getrennt | |

## B — Design Paket 1 + 2: Tokens, Farben, Form, Formatierung (09.–10.09.) · 8 Commits

`6c77d85` Tokens · `5131bcd` semantische Farben · `b9178fb` Grundflächen · `5cb3122` Form und Abstände ·
`be31c44` Korrekturen Rollen/Signale/Radien · `9270058` Datum, Uhrzeit, Preis zentral · `da7d715` Umlaute im
Seed, Abmeldebestätigung, toter Code · `6ee3481` Fix ISO-Datum im Kursfilter

## C — Design Paket 3: Layout (10.–11.09.) · 6 Commits

| Commit | Paket-3-Punkt |
|---|---|
| `85b9c44` | 9 — Kursliste nach Tagen mit Zeitspalte |
| `a9991d5` | 9 — Kursverwaltung ebenso |
| `b6387cf` | 10 — Teilnehmerliste nach Kurs gruppiert |
| `a6f25e2` | 11 — Dashboard-Kurskarten als Zeilen |
| `1ac8b8a` | 11 — Kennzahlen in einer Zeile mit Trennern |
| `468bcb3` | 13 — Seitentitel im Kopfbereich |
| — | 12 — Hero-Karte „deine nächste Stunde": am 11.09. offen, umgesetzt am 14.09. → Gruppe H (`8605ede`) |

## D — Landingpage und Marketing (11.09.) · 2 Commits

`d12a58d` Showcase-Seed für Marketing-Screenshots (nur Skript, läuft nicht auf PROD) ·
`2760082` Handy-Ansicht im Hero der Landingpage

## E — Sicherheit `users` (11.09.) · 1 Commit

`4b942fa` Spaltenrechte auf `users`. **Liegt als `ac38406` schon auf `main` und PROD** (Hotfix). Die
Migrationsdatei `20260911134500` ist in beiden Branches identisch (kein Unterschied im Diff).

## F — Mehrfachmitgliedschaft (11.–13.09.) · 12 Commits

| Commit | Inhalt | Migration |
|---|---|---|
| `809b123` | CORS erlaubt `x-omlify-tenant` | |
| `b890fa0` | Slug-Auflösung nach `tenantSlug.ts`, ohne Verhaltensänderung | |
| `8691794` | Header `x-omlify-tenant` an jedem Supabase-Request | |
| `cce793e` | Stufe 1: `auth_user_id` + Diagnose-RPC | `20260911151200`, `20260911151300` |
| `7634e13` | Stufe 2: `get_my_member_id()`, Policies, Kurs-RPCs | `20260911173000` |
| `1373edd` | Stufe 3a: `users.id` entkoppelt, `join_tenant()` | `20260911182000` |
| `adc260c` | Stufe 3b: Tokens, Verifizierung, Löschen auf Login-Ebene | `20260911185000` |
| `00ae765` | Stufe 3c-A: `get_current_member()` | `20260911192600` |
| `61d15f8` | 3c-B1: Beitritt zu einem weiteren Studio (UI) | |
| `34f0077` | 3c-B2 A: Studio ändert nur Profildaten | |
| `0e8bf0f` | 3c-B2 B: `update-user` schreibt nie Login-E-Mail/Passwort | |
| `ed73a32` | Login-Fehlermeldung „E-Mail oder Passwort ist falsch“ | |

## G — Doku und Tooling · 7 Commits

`e9873b7` Projektkontext + Designsystem · `a16d950` Befund Spaltenrechte · `7d0663d` Schema-Snapshot ·
`dfc9101` Kontext Mehrfachmitgliedschaft · `4891b18` Claude-Code-Berechtigungen · `626f6ea` `seed:dev` repariert ·
`8d82362` Projektstand 14.09., Release-Linie und Geldkette-Branch-Regel

## H — Design-Durchlauf Übersicht (14.09.)

| Commit | Inhalt |
|---|---|
| `8605ede` | Hero-Karte und „Danach“ für Teilnehmende |
| `dd1e39b` | Sichtbarkeitsregel für Anmeldungen (Dashboard und Meine Anmeldungen) |
| `360aa9b` | „Noch Plätze frei“ statt Schnellzugriff |
| `b5dd608` | linke Spalte nur mit Inhalt |
| `0fa141c` | Safran-Rampe und `accent-text` (WCAG AA) |
| `5acd485` | Datumsblock |
| `1a19150` | Zeit-Chip |
| `dc5fe79` | Safran-Status als Pill |

## I — Kursdetailseite und Kurszeilen (14.09.)

| Commit | Inhalt |
|---|---|
| `5de0004` | Anmeldelogik als Hook (`useCourseEnrollment`) |
| `e6a0c5e` | Detailseite `/course/:id`, alle Kurszeilen verlinken dorthin |
| `683e0a1` | Aktionsleiste mobil fest |
| `2ce3bd0` | Aktionsleiste gestaltet |
| `cfd2ec8` | Anmelden nur noch in der Detailseite |
| `aaa048b` | gemeinsame Kurszeile ohne Beschreibung |
| `6d1e8a0` | Titel zweizeilig |

**Anmeldeweg geändert: Anmelden, Warteliste und Abmelden gibt es nur noch auf der Kursdetailseite, nicht mehr in der Kursliste.**

## J — Kursverwaltung und Löschen (14.–15.09.)

| Commit | Inhalt |
|---|---|
| `1e4446f` | Löschen kommender Kurse von der Detailseite (Owner und Admin) |
| `a9e3691` | Löschdialog nur mit geprüfter Teilnehmerzahl |
| `2c25e8a` | Kursverwaltung: Zeilen öffnen die Detailseite, keine Zeilenaktionen |
| `73e9b6f` | Kursverwaltung nutzt die gemeinsame `CourseRow` |
| `ebf2554` | Erfolgsbanner nach Anlegen oder Bearbeiten eines Kurses |

**Löschen gibt es nur noch auf der Kursdetailseite, nur für Owner und Admin, nur für kommende Termine. Die Kursverwaltung hat keine Zeilenaktionen mehr.**

## K — Anrede du (15.09.)

| Commit | Inhalt | Migration |
|---|---|---|
| `72ca072` | Anrede du in der App (18 Dateien) | |
| `bc8c31e` | Umlaute in Anmelde- und Abmeldetiteln | |
| `60ba991` | Anrede du in Mails und Edge-Function-Meldungen | |
| `a29de25` | Anrede du in den Anmelde-RPCs | `20260915003628` |

Edge Functions auf DEV deployt am 15.09. (`npm run functions:dev`). Für PROD
gehören sie zum Deploy-Schritt „alle Edge Functions".

## L — Tenant-Branding (15.09.)

| Commit | Inhalt | Migration |
|---|---|---|
| `81d403a` | Grünrampe → semantische Tokens | |
| `20de2bc` | Nachtrag Soft-Flächen, tote Opazitätsklasse | |
| `1dc5875` | Farbableitung und Laufzeit-Anwendung | |
| `6f14be2` | Spalten, Kontrast-CHECK, RPC `update_studio_branding` | `20260915082415` |
| `d49430b` | Bucket `studio-branding`, Owner-Policies, RPC `set_studio_logo` | `20260915090020` |
| `902ee01` | Einstellungen „Studio & Design" | |
| `27fd7b4` | Logo, Name, Kurzbeschreibung, Tab-Titel, Favicon | |

Nur Owner. Der Bucket entsteht per Migration. Keine Edge Function geändert.

Tests auf DEV: RPC T1–T13 und Storage S1–S15 per zurückgerolltem SQL-Block (alle OK;
S14/S15 Info: Supabase blockt direktes Löschen in `storage.objects`); UI-Test Julius
(Farbe, eigene Farbe, Name, Kurzbeschreibung, Logo hochladen/ersetzen/entfernen, Rollen,
Seitenleiste, Anmeldeseite, Tab); Favicon und `lang` per DOM geprüft; Header-Weg über
Storage mit zweitem Profil (Beitritt `demobeta`) bestätigt. Keine verwaisten Dateien
im Bucket.

## M — Hotfix Plattformtabellen (15.09.)

`8d3dbdc` auf Julius, `e0c4b86` auf `main` (PR #156, Merge `267f87f`). Die
Migrationsdatei `20260915104222` ist in beiden Branches identisch (kein Unterschied
im Diff). **Liegt auf DEV und PROD.**

Befund (Audit 15.09.): Owner/Admin jedes Studios durften `system_settings` lesen und
schreiben (Policies ohne Studio-Bezug). Jedes Login durfte `admin_emails` lesen
(`USING true`). Tabellen-ALL lag bei `anon` und `authenticated`. App und Edge
Functions nutzen beide Tabellen nicht (`grep` in `src/` und `supabase/functions/`:
0 Treffer); SMTP kommt aus Edge-Function-Secrets.

PROD-Nachprüfung 15.09. (MCP `user-supabase-prod-readonly`,
`https://otnhxzomnjjthocovasu.supabase.co`): ACL nur `postgres` und `service_role`;
je Tabelle nur `*_service_role_all`; Zeilen unverändert `system_settings` 2,
`admin_emails` 3; Profile admin 2 / owner 3 / teacher 1 / user 40; 4 Studios.
REST-Probe mit Anon-Key übersprungen (kein PROD-Anon-Key lokal). Beleg für die
Sperre ist die ACL.

Eingespielt per `npx.cmd supabase db push --db-url …` in PowerShell von `main`,
weil `npm run db:push:prod` unter Windows nach der PROD-Abfrage zweimal ohne
Verbindung hing. CLI-Liste enthielt nur diese Datei, Ausgabe
`Finished supabase db push.` Windows-Hänger von `db.mjs` seit `ca6fe70` auf `main`
behoben und belegt (15.09.).

## N — Barrierefreiheit (15.09.)

`691a0df` `lang="de"`.

## O — Buchungseinstellungen pro Studio (15.09.)

| Commit | Inhalt | Migration |
|---|---|---|
| `ad0d25a` | Standard-Teilnehmerzahl auf `tenants`, Stornofrist-Feld entfernt, Härtung `tenants`/`global_settings` | `20260915115057` |
| `2e30a05` | Einstellungen und `CreateCourse` lesen den Studio-Wert | |

`tenants.default_max_participants` (1–50, Grenze aus `courses_max_participants_range_check`).
Schreiben über RPC `update_booking_settings` (Owner und Admin). Das Stornofrist-Feld
entfällt — es wurde nirgends durchgesetzt. `CreateCourse` liest den Wert aus dem Studio.

Härtung: `anon`/`authenticated` ohne Schreibrechte auf `tenants` und `global_settings`
(direktes Schreiben → 42501 statt 0 Zeilen). Policy `settings_manage_managers` entfernt.

Übernahme: vorhandener gültiger Wert aus `global_settings` geht beim Einspielen an alle
Studios (DEV: keiner; PROD: erwartet 10).

Tests DEV: B1–B13 per zurückgerolltem SQL-Block ohne FEHLER, B2 (Admin) übersprungen —
kein Admin-Login auf DEV; UI-Test Julius OK.

## P — Teilnehmerzahl nur auf der Kursdetailseite (16.09.)

Kurszeilen (Übersicht, Kurse, Kursverwaltung) zeigen für Owner/Admin/Lehrer keine
belegten Plätze (`n/max Plätze`) mehr. Die Zahl steht nur auf der Kursdetailseite.

## Q — Meta-Zeile der Kurszeile umbrechen (16.09.)

Lange Orts- oder Leitungsnamen in der Meta-Zeile werden nicht mehr mit `…`
abgeschnitten. Die Zeile bricht um, höchstens zwei Zeilen.

---

## Nachträge bis zum Schnitt

| Datum | Commit | Gruppe | Inhalt |
|---|---|---|---|
| | | Landingpage | *(geplant, noch offen)* |
| 14.09. | siehe H | Design | Design-Durchlauf Übersicht, siehe Gruppe H |
| 14.09. | siehe I | Design/Feature | Kursdetailseite und Kurszeilen, siehe Gruppe I |
| 14.–15.09. | siehe J | Feature | Kursverwaltung und Löschen, siehe Gruppe J |
| 15.09. | siehe K | Copy | Anrede du, siehe Gruppe K |
| 15.09. | siehe L | Design | Tenant-Branding, siehe Gruppe L |
| 15.09. | siehe M | Sicherheit | Hotfix Plattformtabellen, siehe Gruppe M |
| 15.09. | siehe N | a11y | `lang="de"`, siehe Gruppe N |
| 15.09. | siehe O | Feature | Buchungseinstellungen pro Studio, siehe Gruppe O |
| 15.09. | `ca6fe70` | Tooling | Windows-Fix `scripts/db.mjs` auf `main` (PR `fix/db-script-windows-prod`) |
| 16.09. | siehe P | Design | Teilnehmerzahl nur auf der Kursdetailseite, siehe Gruppe P |
| 16.09. | siehe Q | Design | Meta-Zeile der Kurszeile umbrechen, siehe Gruppe Q |
| | | Fixes aus Release-Test | |

---

## Offene Fragen für den Termin am 15.09.

1. **Umfang:** Geht alles aus A–P gemeinsam nach PROD, oder wird etwas zurückgehalten? Gruppe M
   (Plattformtabellen) liegt schon auf `main` und PROD. Die Mehrfachmitgliedschaft
   (F) lässt sich nicht sauber von B/C trennen: 7 Dateien werden in beiden Strängen geändert (`App.tsx`,
   `LoginForm.tsx`, `RegisterForm.tsx`, `AuthPage.tsx`, `ForgotPassword.tsx`, `Profile.tsx`, `Users.tsx`).
2. **Schnitt:** Bis wann kommen Landingpage- und Design-Änderungen noch hinein? Danach nur noch Fixes.
3. **Diagnose-RPC `debug_request_tenant_header()`** (`20260911151300`): mit nach PROD oder vorher per Migration
   entfernen? Sie ist laut Plan erst für Stufe 4 vorgesehen.
4. **Paket 3, Punkt 12** (Hero-Karte): **beantwortet** — umgesetzt am 14.09. (`8605ede`).
5. **Rechtstexte — betrifft PROD schon heute, unabhängig von Stripe** (Befund 14.09., Stand `origin/main`):
   Es gibt **kein Impressum** (keine Route, kein Link, `git grep -i impressum` ohne Treffer in `src/`). AGB und
   Datenschutz sind Platzhalter („Die rechtlichen Texte befinden sich in Vorbereitung“, `LegalPage.tsx:28-33`),
   werden im Onboarding aber als akzeptiert abgefragt (`OnboardingWizard.tsx:558-579`). Die Registrierung von
   Teilnehmenden (`RegisterForm.tsx`) verlinkt keine Datenschutzerklärung. Wer klärt das mit welchem Anwalt, und
   bis wann? Rechtliche Bewertung ausdrücklich nicht durch Claude.
6. **Sicherheitsbefund `users` (Audit 14.09.):** Teilnehmende dürfen per RLS die ganze Zeile von Staff lesen
   (E-Mail, Telefon, Adresse). Policy `users_select_participant_staff` (`20260519153000`; zuerst
   `20260519120000`; `is_participant()` in `20260911173000` auf `get_my_member_id()` umgestellt, die Policy
   selbst nicht). Auf DEV belegt, PROD ungeprüft. Vor dem Release klären.
7. **Löschknopf für Kursleitungen auf PROD:** In der Kursverwaltung auf `main` sehen
   Kursleitungen einen Löschknopf. Die RLS (`managers_delete_courses`) erlaubt Löschen nur
   Owner/Admin; der Client prüft die Zahl gelöschter Zeilen nicht und meldet Erfolg.
   Aus Code und Policy abgeleitet, nicht ausprobiert. Mit diesem Release behoben.
8. **Löschen entfernt Anmeldungen und Kurs-Chat per ON DELETE CASCADE, Teilnehmende
   werden nicht benachrichtigt.** Der Dialog warnt mit Personenzahl. „Absagen statt
   Löschen" mit Benachrichtigung ist eine Produktfrage (Strategie-Projekt).
9. **Auth-Mailvorlagen im Supabase-Dashboard** (Authentication → Email Templates)
   liegen nicht im Repo. Auf DEV und PROD prüfen, ob sie noch siezen oder englisch
   sind — Julius, manuell.
10. **`global_settings`:** umgesetzt in Gruppe O; Tabelle wird nach dem Release entfernt (7c).
11. **`email_templates`:** Altbestand, niemand liest sie, jeder Manager darf global
    schreiben — entfernen?

## Vor dem Release-PR zu prüfen

- [ ] `npm run db:status:prod`: welche der 13 Migrationen PROD schon kennt (Erwartung: keine; `134500` und `104222` ja)
- [ ] Probelauf aller 13 Migrationen auf einer PROD-Kopie, inkl. der PROD-Sonderfälle aus `CLAUDE.md`:
      2 Logins ohne Profil, 1 Studio ohne Profil, ein Konto mit abweichender `users.email`
- [ ] Reihenfolge beim Deploy festlegen: Migrationen → alle 9 Edge Functions → Frontend. Die Functions lesen
      `auth_user_id`, das Frontend sendet den Header, beides ohne Migration wirkungslos bzw. fehlerhaft
- [ ] Supabase-CLI am Laptop angemeldet (`npx supabase login`)
- [ ] Release-Abnahme auf DEV nach `docs/RELEASE_ABNAHME.md` abgeschlossen
- [ ] Rückweg: Snapshot `supabase/snapshots/2026-09-11_pre_membership_dev.sql` gilt für DEV. Für PROD vor dem Merge
      ein Backup (`backup-prod.yml`) und dessen Wiederherstellbarkeit belegen
- [x] **`scripts/db.mjs push prod` unter Windows reparieren.** Hing am 15.09. zweimal nach der PROD-Abfrage, bevor die CLI
      sich verband (`status` ohne Abfrage lief). Fix in `scripts/db.mjs` (`1cc7495`, PR-Merge `ca6fe70` auf `main`; identisch auf `Julius`).
      **Belegt am 15.09.2026:** `npm run db:push:prod` von `main` im cmd-Terminal ohne ausstehende Migration → Liste, PROD-Abfrage,
      `db push --yes`, „Remote database is up to date.", kein Hänger. PowerShell-Weg bleibt als Rückfall.
- [ ] **PROD kennt `20260911134500` und `20260915104222`**, 12 der 13 Julius-Migrationen sind älter →
      `supabase db push` verlangt nach Kenntnisstand `--include-all`. `20260915115057` ist jünger und käme
      als normale ausstehende Datei. Auf einer PROD-Kopie belegen, bevor es live läuft.
      `db.mjs` reicht das Flag noch nicht durch — vor dem Release-Push entscheiden (Flag im Skript für `push prod`
      optional machen oder einmalig manuell).
- [ ] Nach dem Release: `20260915104222` darf nicht erneut angewendet werden (Datei identisch, Version schon remote) —
      `db:status:prod` prüfen
- [ ] Admin-Testlogin auf DEV anlegen und Buchungseinstellungen als Admin speichern (B2 nachholen).
- [ ] Nach dem Release (7c): `global_settings` per Migration entfernen; dabei `MAINTAIN` auf `tenants` für `anon`/`authenticated`
      entziehen (PG17-Recht `m`, über die API nicht nutzbar).
- [ ] Am Release-Tag sieht das alte Frontend kurz die neue Datenbank: Speichern der Buchungseinstellungen scheitert bis zum
      Frontend-Deploy mit einer Fehlermeldung (erwartet).
