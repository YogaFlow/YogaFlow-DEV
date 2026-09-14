# Release 2026-09 — Umfang DEV → PROD

**Stand:** 14.09.2026 · Grundlage für den Termin am 15.09. · **wächst bis zum Schnitt**
**Vergleich:** `origin/main` (`e1776fd`, 11.09.) gegen `origin/Julius` (`dc5fe79`, 14.09.)
**Gemeinsamer Vorfahr:** `4d43ad6` (07.09.)

| | |
|---|---|
| Commits auf `Julius`, nicht auf `main` | 51 |
| Dateien | 89 geändert, +9.189 / −2.093 Zeilen |
| Migrationen nur auf DEV | 9 |
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

---

## Nachträge bis zum Schnitt

| Datum | Commit | Gruppe | Inhalt |
|---|---|---|---|
| | | Landingpage | *(geplant, noch offen)* |
| 14.09. | siehe H | Design | Design-Durchlauf Übersicht, siehe Gruppe H |
| | | Fixes aus Release-Test | |

---

## Offene Fragen für den Termin am 15.09.

1. **Umfang:** Geht alles aus A–H gemeinsam nach PROD, oder wird etwas zurückgehalten? Die Mehrfachmitgliedschaft
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

## Vor dem Release-PR zu prüfen

- [ ] `npm run db:status:prod`: welche der 9 Migrationen PROD schon kennt (Erwartung: keine, `134500` ja)
- [ ] Probelauf aller 9 Migrationen auf einer PROD-Kopie, inkl. der PROD-Sonderfälle aus `CLAUDE.md`:
      2 Logins ohne Profil, 1 Studio ohne Profil, ein Konto mit abweichender `users.email`
- [ ] Reihenfolge beim Deploy festlegen: Migrationen → alle 9 Edge Functions → Frontend. Die Functions lesen
      `auth_user_id`, das Frontend sendet den Header, beides ohne Migration wirkungslos bzw. fehlerhaft
- [ ] Supabase-CLI am Laptop angemeldet (`npx supabase login`)
- [ ] Release-Abnahme auf DEV nach `docs/RELEASE_ABNAHME.md` abgeschlossen
- [ ] Rückweg: Snapshot `supabase/snapshots/2026-09-11_pre_membership_dev.sql` gilt für DEV. Für PROD vor dem Merge
      ein Backup (`backup-prod.yml`) und dessen Wiederherstellbarkeit belegen
