# Scrum Epic: Kursakte — vorbereiten, unterrichten, zurückblicken

**Stand:** 14.09.2026 · **Status: ENTWURF, lokal, nicht committet.** KE1–KE12 am 14.09. entschieden (Abschnitt 4). Offen: KE13–KE15.
**Basis:** `Kursakte_Gesamtstand_September_2026.md` (Strategie-Projekt, 14.09.), gegen das Repo geprüft auf Stand `8d82362`
**Verbindlich daneben:** `CLAUDE.md` (Harte Grenzen), `docs/DESIGNSYSTEM.md`, `docs/SCHEMA_RELEASE_WORKFLOW.md`, `docs/EPIC_GELDKETTE_1A.md` (Überschneidungen in Abschnitt 7)

---

## 1. Epic-Ziel

Eine Lehrkraft öffnet einen ihrer Kurstermine und sieht, **ohne etwas einzugeben**, wer kommt und was in diesem
Kurs zuletzt dran war. Mit ein paar Tipps legt sie den Schwerpunkt fest und notiert den Ablauf, auf Wunsch vom
letzten Mal übernommen. Nach dem Kurs hält sie mit einem Tipp fest, ob es wie geplant lief.

Nach einigen Wochen kann Omlify sagen: „Dreimal in Folge Hüfte", „Balance zuletzt vor 9 Wochen". Das ist die
Grundlage für den späteren Unterrichts-Agenten (Zielbild, Folie 6), der als einziger Agent nicht auf der
Geldkette aufbaut.

**Fertig heißt:** Der Ablauf läuft auf DEV (`omlify-dev.de`) für eine Solo-Lehrerin (`owner`) und für eine Lehrkraft
in einem Studio mit mehreren Lehrenden. Die Testfälle aus Story 4.1 sind grün und belegt.

**Positionierung (aus dem Strategie-Projekt, nicht hier entschieden):** „Das einzige Buchungssystem, das weiß, was
du unterrichtet hast."

---

## 2. Repo-Befunde, die den Gesamtstand korrigieren

Geprüft am 14.09.2026 auf Stand `8d82362`.

| # | Gesamtstand sagt | Repo sagt | Beleg | Folge |
|---|---|---|---|---|
| B1 | Blocker: stabile ID für den einzelnen Kurstermin fehlt (8.4) | Eine `courses`-Zeile ist ein Termin. Beim Bearbeiten einer Serie wird die Zeile geändert, nicht neu angelegt. | `EditCourse.tsx:339-340` (`update … eq('series_id')`), `CreateCourse.tsx:377` | **Kein Blocker.** Die Kursakte hängt 1:1 an `courses.id`. |
| B2 | „Zuletzt unterrichtet" über `courseSeriesId` | `series_id` entsteht nur beim Anlegen eines Blocks in einem Durchgang. Ein Folgeblock bekommt eine neue ID, Einzeltermine (`one_time`) haben keine. | `CreateCourse.tsx:351-404`, `20260106155923_assign_series_ids_to_existing_courses.sql` | Die Historie wäre nach jedem Block leer. → **KE3**: gleicher Titel + gleiche Lehrkraft. |
| B3 | „Anwesend ist dieselbe Wahrheit wie der Check-in" | **Es gibt keinen Check-in.** Kein Treffer für Anwesenheit in `src/` und `supabase/`. Abmelden löscht die Zeile. | `grep -i "attend\|check.?in\|anwesen"` → nur Fehlalarme (`checking`); `unregister_from_course` `20260911173000:499` | Anwesenheit wäre neu, und zwar auf `registrations`, die Geldkette 2.1 umbaut. → **KE2**. |
| B4 | „7 Stammgäste · 2 zum ersten Mal" | Ableitbar ist nur „hat vorher gebucht", nicht „war da". Jedes neue Studio startet ohne Historie. | `registrations` ohne Anwesenheit (`src/types/index.ts:66-81`) | Bei Neukunden wäre in den ersten Wochen jede Person „neu". → **KE5**. |
| B5 | Push 15 Min. nach Kursende | Kein Web-Manifest, kein Service Worker, kein `pg_cron`, App erst Monat 3 | `public/` enthält nur `hero-app-mobile.jpg`; `pg_cron` belegt in `EPIC_GELDKETTE_1A.md` 2.1 | Kein Push im Start. → **KE7**. |
| B6 | Owner/Admin sehen Gesundheitshinweise nicht standardmäßig | Die Solo-Lehrerin ist `owner` ihres Studios **und** `teacher_id` ihrer Kurse. | `isCourseManagerRole` inkl. `owner` (`src/lib/userRoles.ts:4-7`), Lehrkraftwahl `CreateCourse.tsx:488-494` | Regeln über die Rolle sperren die Hauptzielgruppe aus. **Jede Regel hängt an `courses.teacher_id`.** |
| B7 | (nicht erwähnt) | `teacher` liest per RLS **alle** Anmeldungen im Studio. Auf eigene Kurse filtert erst der Client. | `registrations_select` mit `is_staff()`, `20260911173000:222-229`; `Participants.tsx:94-96` | Heute unkritisch. Neue Tabellen übernehmen das Muster **nicht**: Filter auf `teacher_id` in der Policy. |
| B8 | Screen C „Meine Woche" ist neu | „Meine Kurse" ist bereits nach Tagen gruppiert, zeigt aber **nur kommende** Termine. | `MyCourses.tsx:48` (`isCourseUpcoming`), Commit `85b9c44` | Kein neuer Screen. Umschalter Kommend/Vergangen → **KE10**. |
| B9 | Tool Layer `session.*`, Events an die Engine | `events`/`audit_log` und `_shared/service.ts` entstehen erst in Geldkette 0.3 auf `feature/geldkette`. | `EPIC_GELDKETTE_1A.md` 0.3; `supabase/functions/` ohne `_shared/service.ts` | Die Kursakte hängt nicht davon ab. RPCs nach dem bestehenden Muster, Events später. |
| B10 | (nicht erwähnt) | `delete_tenant_complete` löscht über `DELETE FROM tenants` + Kaskade. `courses.teacher_id` kaskadiert ebenfalls. | `20260503120000_…:57`, `20260106130631_…:34` | Ein `RESTRICT` von der Akte auf `courses` könnte mitten in der Kaskade abbrechen. → `NO ACTION` (Prüfung am Ende der Anweisung), siehe **KE12**. |

### Punkte im Gesamtstand, die ich fachlich anders sehe

1. **Phase 0 trägt allein nicht.** Ohne neue Tabelle bleibt eine Teilnehmerliste pro Kurs mit Neu-Markierung. Die
   Liste gibt es fast (`b6387cf`), die Markierung ist bei Neukunden falsch (B4). Das Briefing bekommt seinen Wert
   erst durch „Zuletzt unterrichtet", und das braucht Schwerpunkte. **Phase 0 und 1 sind hier zusammengelegt.**
2. **„Phase 0–2 in knapp drei Wochen" ist zu knapp.** 60 Stunden für drei Screens, sechs Tabellen, RLS, Anhänge
   (Supabase Storage wird im Projekt noch nicht genutzt), Vorlagen und Teilnehmernotizen, mit STOPP-Gates.
   Dieses Epic verkleinert den Umfang, statt den Plan zu strecken.
3. **Teilnehmernotizen sind faktisch Gesundheitsdaten.** Ein Hinweis „Keine Gesundheitsangaben" hält niemanden davon
   ab, „Knie operiert" zu schreiben. Der Gesamtstand verbietet Freitext-Gesundheitsnotizen „in keiner Version",
   erlaubt aber genau dieses Feld. → **KE1**.
4. **„Kein `service_role`-Zugriff" ist nicht zusicherbar.** `service_role` umgeht RLS immer. Zusichern lässt sich nur,
   dass kein Codepfad die Daten mit `service_role` liest. Für Art.-9-Daten kommen Datenschutz-Folgenabschätzung,
   AVV und Anwalt dazu: ein eigenes Epic, keine Phase.
5. **Vorlagen braucht der Start nicht.** Der häufigste Fall ist „wie letzte Woche, leicht angepasst" (Gesamtstand
   Teil 2, Nr. 4). Das deckt „vom letzten Mal übernehmen" ab.
6. **Kodierung:** Die Datei `Kursakte_Gesamtstand_September_2026.md` ist falsch kodiert (UTF-8 als Latin-1 gelesen,
   „Ã¼"). Vor dem Ablegen als UTF-8 speichern.
7. **Nicht nachgeprüft:** Marktpreise (Tummee, FLOW, …) und Herstellerangaben wie Heidi „70 % weniger
   Dokumentationszeit". Letztere als Herstellerangabe kennzeichnen.

---

## 3. Architektur-Vorschläge (zur Freigabe)

| # | Vorschlag | Begründung |
|---|---|---|
| A1 | **Eine Akte je Termin, Schlüssel `courses.id`** (`UNIQUE`) | B1. Keine Kursreihe als neues Konzept. |
| A2 | **Die Zeile entsteht erst beim ersten Speichern.** Wird alles geleert, löscht der RPC die Zeile. | Es gibt nie leere Akten. Damit ist „mit Inhalt gesperrt" (KE12) einfach ein Fremdschlüssel. |
| A3 | **Schwerpunkte als Verbindungstabelle**, nicht als `uuid[]` wie im Gesamtstand | Ein Array hat keinen Fremdschlüssel: Ein gelöschter oder studiofremder Schwerpunkt fiele nicht auf. |
| A4 | **Ein Schwerpunkt-Satz je Akte.** Vor dem Kurs geplant, im Rückblick bestätigt oder geändert. | Die Historie soll zeigen, was unterrichtet wurde, nicht was geplant war. Zwei Sätze verdoppeln die UI ohne Nutzen im Start. |
| A5 | **`authenticated` bekommt nur SELECT.** Geschrieben wird ausschließlich über `SECURITY DEFINER`-RPCs mit `SET search_path TO 'public'` (ohne `pg_temp`). | Gleiches Muster wie die Kurs-RPCs. Prüfungen (Lehrkraft des Termins, max. 3 Schwerpunkte, Rückblick erst nach Kursende) liegen im Server. |
| A6 | **Policies vergleichen `courses.teacher_id = get_my_member_id()` oder `is_tenant_manager()`**, zusätzlich `tenant_id = get_my_tenant_id()` | B6, B7, KE4. Nicht nach Rolle. |
| A7 | **Zeitlogik in SQL**, `courses.date + courses.end_time` in `Europe/Berlin`. Im Client nur `src/lib/format.ts` und `courseDateTime.ts`. | `CLAUDE.md`: `date`/`time` nie durch `new Date()`. |
| A8 | **Keine Events im Start.** `session.plan_saved`, `session.taught` usw. kommen mit der Event-Tabelle aus Geldkette 0.3. | B9. Nachrüsten ist einfach, weil alle Schreibwege über drei RPCs laufen. |
| A9 | **Keine neue Abhängigkeit.** | Chips, Segmentknöpfe und Textfeld gibt es mit Tailwind und `lucide-react`. |

### Datenmodell

```
session_focus_tags            Vokabular je Studio
  id                uuid PK
  tenant_id         uuid NOT NULL → tenants  ON DELETE CASCADE
  label             text NOT NULL  (1–40 Zeichen)
  sort_order        int  NOT NULL
  archived_at       timestamptz NULL
  created_at, updated_at
  UNIQUE (tenant_id, lower(label)) WHERE archived_at IS NULL

session_records               die Kursakte, 1:1 zum Termin
  id                uuid PK
  tenant_id         uuid NOT NULL → tenants  ON DELETE CASCADE
  course_id         uuid NOT NULL UNIQUE → courses  ON DELETE NO ACTION   (KE12)
  outline           text NULL  (≤ 4.000 Zeichen)
  plan_saved_at     timestamptz NULL
  debrief_outcome   text NULL  CHECK IN ('as_planned','adapted','different')
  debrief_note      text NULL  (≤ 2.000 Zeichen)
  debrief_saved_at  timestamptz NULL
  updated_by        uuid NULL → users  ON DELETE SET NULL
  created_at, updated_at

session_record_focus_tags     Schwerpunkte einer Akte (max. 3, geprüft im RPC)
  record_id         uuid → session_records  ON DELETE CASCADE
  focus_tag_id      uuid → session_focus_tags  ON DELETE NO ACTION
  tenant_id         uuid NOT NULL → tenants  ON DELETE CASCADE
  PRIMARY KEY (record_id, focus_tag_id)
```

`updated_by` zeigt auf das Profil (`users.id`), nie auf `auth.uid()`. Schwerpunkte werden nie gelöscht, nur
archiviert.

### RPCs

| RPC | Wer | Liefert / tut |
|---|---|---|
| `get_course_record(p_course_id)` | Lehrkraft des Termins, Owner/Admin | Termin, Akte, Schwerpunkte, Auslastung (`registered`/`waitlist`), Namen mit Flag „erste Buchung" (nur wenn KE5 erfüllt), letzte 3 Akten mit gleichem Titel + Lehrkraft (Rückfall: letzte 3 der Lehrkraft), letzter Ablauf zum Übernehmen, Hinweise (KE-Regeln unten), Flag `can_edit`, Flag `debrief_open` |
| `save_course_plan(p_course_id, p_focus_tag_ids uuid[], p_outline text)` | nur Lehrkraft des Termins | Anlegen/Ändern, leere Eingabe → Akte löschen (A2) |
| `save_course_debrief(p_course_id, p_outcome text, p_focus_tag_ids uuid[], p_note text)` | nur Lehrkraft des Termins, erst nach Kursende | Rückblick anlegen/ändern |
| `manage_focus_tag(p_action text, p_tag_id uuid, p_label text, p_sort_order int)` | Owner/Admin | `create`, `rename`, `archive`, `restore`, `reorder` |
| `list_open_debriefs()` | jede Person, die Kurse leitet | Eigene Termine der letzten 14 Tage nach Kursende ohne Rückblick |

**Deterministische Hinweise** (kein LLM):
- **In Folge:** Die letzten 3 Akten derselben Historie teilen einen Schwerpunkt → „Dreimal in Folge Hüfte".
- **Längste Pause:** Ein Schwerpunkt, der in dieser Historie schon vorkam, liegt ≥ 6 Wochen zurück → „Balance
  zuletzt vor 9 Wochen". Höchstens ein Hinweis, der mit der längsten Pause.
- **Erste Buchung** (KE5): Die Person hat vor diesem Termin keine Anmeldung (`registered`, nicht Warteliste) zu einem
  vergangenen Termin im Studio, **und** der früheste vergangene Termin des Studios liegt ≥ 28 Tage zurück.

**Titelvergleich:** `lower(btrim(title))`. Umbenennen trennt die Historie. Das ist eine bekannte Grenze von KE3.

---

## 4. Entscheidungen

| # | Frage | Entscheidung | Stand |
|---|---|---|---|
| **KE1** | Gesundheitshinweise und Teilnehmernotizen in diesem Epic? | **Beides raus.** Die Kursakte ist rein kursbezogen, es gibt kein Freitextfeld an einer Person. Beides wird ein eigenes Epic nach Anwalt, Datenschutz-Folgenabschätzung und AVV. | entschieden 14.09. |
| **KE2** | Anwesenheit jetzt? | **Später, mit Geldkette 2.1**, als Status an `registrations`, damit es eine Wahrheit gibt (No-Show, Dispute nach besuchtem Kurs). Der Rückblick kommt ohne Anwesenheit aus. | entschieden 14.09. |
| **KE3** | Worauf bezieht sich „Zuletzt unterrichtet"? | **Gleicher Kurstitel + gleiche Lehrkraft**, über Blöcke und Quartale. Rückfall: die letzten Termine der Lehrkraft insgesamt. | entschieden 14.09. |
| **KE4** | Wer sieht die Akte? | **Lehrkraft des Termins bearbeitet, Owner/Admin lesen.** Nach einer Übergabe gehört die Akte der neuen Lehrkraft. Die Regel hängt an `teacher_id`, nicht an der Rolle (B6). | entschieden 14.09. |
| **KE5** | Neu-Markierung bei jungen Studios? | **Erst ab ≥ 4 Wochen Historie** im Studio. Davor zeigt das Briefing nur Anzahl und Namen. | entschieden 14.09. |
| **KE6** | Der eine Tipp im Rückblick? | **„Wie geplant" / „Angepasst" / „Anders als geplant"**, dazu Schwerpunkte bestätigen und eine optionale Notiz. | entschieden 14.09. |
| **KE7** | Erinnerung an offene Rückblicke? | **Nur in der App:** Hinweis im Dashboard und Markierung an vergangenen Terminen. Keine E-Mail, keine Mahnung. Push kommt mit der App. | entschieden 14.09. |
| **KE8** | Wer pflegt die Schwerpunkte? | **Owner/Admin pflegt**, Start mit Omlify-Standardliste. Lehrende wählen nur aus. | entschieden 14.09. |
| **KE9** | Aufbau der Seite? | **Eine Route `/course/:courseId`, zeitabhängig:** vor Kursende Briefing und Planung oben, danach der Rückblick oben, Plan und Briefing eingeklappt darunter. | entschieden 14.09. |
| **KE10** | Wo liegen vergangene Termine? | **Umschalter Kommend / Vergangen in „Meine Kurse"**, mit Status je Zeile. | entschieden 14.09. |
| **KE11** | Hero-Karte „deine nächste Stunde" (Paket 3, Punkt 12)? | **Bleibt Design-Arbeit in Paket 3** (eigener Commit, alle Rollen). Das Epic ergänzt für Lehrende nur den Einstieg „Kurs vorbereiten" und den Stand der Akte. | entschieden 14.09. |
| **KE12** | Termin löschen mit Akte? | **Mit Inhalt gesperrt.** Leere Akten gibt es nicht (A2). FK `NO ACTION`, damit `delete_tenant_complete` weiter durchläuft (B10). | entschieden 14.09. |
| **KE13** | Zeitpunkt und Reihenfolge zur Geldkette; Roadmap-Folie nennt „Kursnotiz · Kursvorbereitung" in Woche 2–3 der Geldkette (Gesamtstand 8.1) | **Offen, gehört ins Strategie-Projekt.** Technisch: DEV hat eine Datenbank, es gilt dieselbe Branch-Frage wie bei der Geldkette. | offen |
| **KE14** | Vor dem Bau validieren (Gesamtstand 8.5)? | **Offen, Strategie-Projekt.** Vorschlag: Story 0.1 als Gespräche mit drei Lehrenden und dem Klick-Entwurf aus 0.2. | offen |
| **KE15** | Inhalt der Standardliste | **Vorschlag, zu bestätigen:** Hüfte · Rücken · Schultern & Nacken · Core · Balance · Vorbeugen · Rückbeugen · Drehungen · Umkehrhaltungen · Kraft · Atmung · Entspannung | offen |

### Selbst getroffene Festlegungen (zur Kenntnis, änderbar)

| Festlegung | Wo | Begründung |
|---|---|---|
| Höchstens **3 Schwerpunkte** je Termin | `save_course_plan`, `save_course_debrief` | Bei 12 wählbaren wird die Historie mit mehr Chips beliebig. |
| „Rückblick offen" gilt **14 Tage** nach Kursende, bearbeitbar bleibt er unbegrenzt | `list_open_debriefs` | Der Gesamtstand nennt 36 Std. als Nachtragefrist. 14 Tage verhindern einen wachsenden Schuldberg, ohne Wochenend-Kurse sofort zu verlieren. |
| Pause-Hinweis ab **6 Wochen**, Folge-Hinweis ab **3** gleichen | `get_course_record` | Bei wöchentlichen Kursen sind 6 Wochen ein halbes Quartal. |
| Kursende = `date + end_time`, sonst `date + time + duration`, sonst `date + time` | SQL, `Europe/Berlin` | `end_time` und `duration` sind optional (`src/types/index.ts:48,55`). |
| Standardliste per Migration für bestehende Studios + Trigger `AFTER INSERT ON tenants` | Story 1.1 | Kein Eingriff in Onboarding-Code oder Tenant-Auflösung. Der Trigger schreibt nur in die neue Tabelle. |

---

## 5. Scope

**Im Start:** Kursakte je Termin · Briefing (Auslastung, Namen, erste Buchung ab 4 Wochen, zuletzt unterrichtet,
zwei Hinweise) · Schwerpunkte mit Studio-Vokabular · Ablauf als ein Textfeld · „vom letzten Mal übernehmen" ·
Rückblick mit einem Tipp und Notiz · Kommend/Vergangen in „Meine Kurse" · offene Rückblicke im Dashboard ·
Schwerpunkte verwalten · Lesesicht für Owner/Admin.

**Später:** Anwesenheit (mit Geldkette 2.1) · Vorlagen · Anhang einer Sequenz (Link oder Datei) · Push-Erinnerung
(App) · Events für Engine und Agenten (nach Geldkette 0.3) · Diktat mit Review · Kursinhalt für Teilnehmende
sichtbar machen · Auswertung „Schwerpunkt und Auslastung" · Suche nach Lehrkraft mit Schwerpunkt (Vertretung).

**Eigenes Epic:** Gesundheitshinweise der Teilnehmenden (Art. 9 DSGVO) · Notizen zu Teilnehmenden (KE1).

**Nie vorgesehen (aus dem Gesamtstand übernommen):** Posenbibliothek · Drag-&-Drop-Sequenzbauer ·
AI-Sequenzgenerierung · SOAP-Struktur · Leaderboards und Punkte · Freitext-Gesundheitsnotizen der Lehrkraft.

---

## 6. Stories nach Sprints

Jede Story endet mit einem **STOPP**. Weiter geht es erst nach Freigabe, danach wird gepusht. Migrationen laufen
nur über `scripts/db.mjs`, jede mit Zweck, Rückweg und selbstprüfendem `DO $$`-Block. Feature-Commits und
Design-Commits bleiben getrennt.

**Aufwand, geschätzt und nicht belegt:** 4–5 Wochen bei 20 Std./Woche (Sprint 0: 3 Tage, 1: 1 Woche, 2: 1,5 Wochen,
3: 1 Woche, 4: 2 Tage).

### Sprint 0 — Voraussetzungen (kein Code)

#### 0.1 Gespräche mit drei Lehrenden *(nur wenn KE14 so entschieden wird)*
*Als Gründer möchte ich vor dem Bau sehen, wie Lehrende heute vorbereiten, damit wir nicht an ihrer Praxis
vorbeibauen.*

- Zwei Fragen aus dem Gesamtstand 8.5, dazu der Klick-Entwurf aus 0.2
- Je Person festhalten: Womit bereitet sie heute vor (Foto der Spalten)? Würde sie Schwerpunkt und Rückblick
  eintragen? Welche Schwerpunkte fehlen in KE15?

**Akzeptanz:** Notizen je Gespräch, Ja/Nein je Kernfunktion (Briefing, Schwerpunkt, Ablauf, Rückblick).
**Wer:** Julius. **STOPP.**

#### 0.2 Entwurf im Designsystem
*Als Lehrkraft möchte ich, dass die Kursakte wie der Rest von Omlify aussieht und auf dem Handy mit einer Hand
bedienbar ist.*

- Mockups vom 08.09. auf `docs/DESIGNSYSTEM.md` umfärben (Gesamtstand 8.3): Sand, Tief-Salbei, Safran nur als Signal
- **Zustände zuerst festlegen, dann gestalten:** vor dem Kurs leer · vorbereitet · Rückblick offen · abgeschlossen ·
  keine Historie · Studio jünger als 4 Wochen · Lesesicht Owner/Admin · Löschen gesperrt
- Breite 375 px, Tippziele ≥ 44 px (Paket 4 vorwegnehmen, nicht nachrüsten)
- Status nie nur über Farbe (Designsystem), Uhrzeit ohne Sekunden, Datum ausgeschrieben

**Akzeptanz:** Design-Canvas mit allen acht Zuständen, von Julius abgenommen. **STOPP.**

### Sprint 1 — Datenfundament

#### 1.1 Tabellen, Policies, Standardliste
*Als Studio möchte ich, dass Kursakten strikt im eigenen Studio bleiben und nur die Lehrkraft des Termins sie
bearbeiten kann.*

- Migration mit den drei Tabellen aus Abschnitt 3, RLS aktiv, Policies nach A6
- `GRANT SELECT` für `authenticated`, **explizit** `REVOKE INSERT, UPDATE, DELETE` von `anon` und `authenticated`
  (`REVOKE … FROM PUBLIC` reicht auf Supabase nicht, `CLAUDE.md`)
- Standardliste (KE15) für alle bestehenden Studios, Trigger für neue Studios
- Selbstprüfung: RLS aktiv auf allen drei Tabellen, keine Schreibrechte für `anon`/`authenticated`, jedes Studio hat
  die Standardliste
- **Vorher prüfen:** alle Pfade, die `courses` löschen: `MyCourses.tsx:128-141` (Einzel- und Seriendelete),
  `delete-user` (über `courses.teacher_id ON DELETE CASCADE`), `delete_tenant_complete`

**Akzeptanz (SQL-Auszüge):** Profil aus Studio B liest keine Akte aus A. Lehrkraft 2 im selben Studio liest keine Akte
von Lehrkraft 1. Admin liest. `INSERT` als `authenticated` → `permission denied`. `DELETE` eines Termins mit Akte →
`23503`. `delete_tenant_complete` auf einem Wegwerf-Studio mit Akten läuft durch.
**Schema-Eingriff → ausdrückliche Freigabe. STOPP.**

#### 1.2 RPCs
*Als Lehrkraft möchte ich, dass Speichern nur das tut, was erlaubt ist, egal, was der Browser schickt.*

- RPCs aus Abschnitt 3, `SECURITY DEFINER`, `SET search_path TO 'public'`
- Prüfungen im Server: Mitglied des Studios, Lehrkraft des Termins (schreiben), max. 3 Schwerpunkte, nur aktive
  Schwerpunkte des eigenen Studios, Rückblick erst nach Kursende, Längen
- `get_course_record` rechnet Hinweise, erste Buchung und Kursende in SQL (A7)
- `EXECUTE` nur für `authenticated`, `anon` explizit entzogen

**Akzeptanz (curl mit Header `x-omlify-tenant`):** Token A + Header A → Akte. Token A + Header B → Fehler. Lehrkraft,
die den Termin nicht leitet → Fehler beim Speichern. 4 Schwerpunkte → Fehler. Schwerpunkt aus Studio B → Fehler.
Rückblick vor Kursende → Fehler. Leere Planung → Akte gelöscht. **Schema → Freigabe. STOPP.**

### Sprint 2 — Die Kursakte-Seite

#### 2.1 Briefing
*Als Lehrkraft möchte ich vor dem Kurs auf einen Blick sehen, wer kommt und was zuletzt dran war, ohne etwas
einzugeben.*

- Route `course/:courseId` in `App.tsx`. Kein Zugriff → Weiterleitung auf „Meine Kurse" mit Hinweis
- Kopf: Titel, Datum ausgeschrieben, Uhrzeit von–bis, Ort/Raum (alles über `format.ts`)
- **Wer kommt:** „9 von 14 Plätzen", Warteliste als Zahl, Namen. „Erste Buchung" als Text-Marke nur nach KE5
- **Zuletzt unterrichtet:** die letzten 3 Akten mit Datum, Schwerpunkten und Rückblick-Ergebnis. Keine Historie →
  Leerzustand als Einladung („Nach deinem ersten Rückblick steht hier, was du unterrichtet hast.")
- **Hinweise:** je höchstens einer für „in Folge" und „längste Pause"
- Einstiege: Zeile in „Meine Kurse", Kursgruppe in der Teilnehmerliste (`Participants.tsx`)

**Akzeptanz:** Screenshots 375 px für: mit Historie, ohne Historie, Studio < 4 Wochen, Lesesicht Admin.
`grep -n "new Date" ` in den neuen Dateien → kein Treffer auf `date`/`time`/`end_time`. **STOPP.**

#### 2.2 Planung
*Als Lehrkraft möchte ich mit wenigen Tipps den Schwerpunkt setzen und den Ablauf notieren, am liebsten ausgehend
vom letzten Mal.*

- Schwerpunkte als Chips (Mehrfachauswahl, max. 3, vierter Tipp erklärt die Grenze)
- Ablauf: ein Textfeld, kein Schema
- **„Vom letzten Mal übernehmen"** mit Datum der Quelle. Ist das Feld nicht leer, wird vorher gefragt
- Knopf „Vorbereitung sichern" nur sichtbar, wenn sich etwas geändert hat. Verlassen mit Änderungen → Hinweis
- Owner/Admin sehen alles, aber ohne Eingabefelder

**Akzeptanz:** Speichern, Neuladen, Werte da. Übernehmen bei gefülltem Feld fragt nach. Leeren und Speichern →
Akte gelöscht (DB-Auszug). **STOPP.**

#### 2.3 Rückblick
*Als Lehrkraft möchte ich nach dem Kurs in zehn Sekunden festhalten, wie es lief.*

- Ab Kursende steht der Rückblick oben, Briefing und Plan sind eingeklappt (KE9)
- Drei Knöpfe (KE6) mit Text, gewählter Zustand zusätzlich mit Symbol, nicht nur Farbe
- Schwerpunkte aus der Planung vorbelegt, änderbar (A4)
- Notiz optional. „Rückblick sichern". Danach „Rückblick gesichert" mit Uhrzeit, weiterhin bearbeitbar

**Akzeptanz:** Termin, der vor 10 Min. endete: Rückblick oben. Termin in 2 Std.: Rückblick nicht sichtbar. Termin
ohne `end_time`: Ende aus `duration`. Screenshots. **STOPP.**

### Sprint 3 — Einstiege und Pflege

#### 3.1 „Meine Kurse": Kommend und Vergangen
*Als Lehrkraft möchte ich vergangene Termine finden und sehen, wo ein Rückblick fehlt.*

- Umschalter Kommend / Vergangen, Vergangen zeigt die letzten 8 Wochen, darunter „Ältere Termine laden"
- Status je Zeile als Text + Symbol: „vorbereitet", „Rückblick offen", „abgeschlossen"
- **Löschen mit Akte:** klare Meldung statt Datenbankfehler, für Einzeltermin und Serie („3 Termine dieser Serie haben
  eine Kursakte und bleiben bestehen" oder Abbruch — Verhalten in der Story festlegen)
- Fehlermeldung in `delete-user`, wenn eine Lehrkraft Kurse mit Akte hat. **Nur Meldung, keine Änderung der
  Löschlogik** (Harte Grenze Rollen/Löschen)

**Akzeptanz:** Screenshots beider Ansichten. Löschversuch mit Akte → verständliche Meldung, Akte bleibt (DB-Auszug).
**Abstimmung mit Geldkette 0.2 nötig** (dieselbe Löschstelle, Abschnitt 7). **STOPP.**

#### 3.2 Dashboard: offene Rückblicke und „Kurs vorbereiten"
*Als Lehrkraft möchte ich beim Öffnen von Omlify sehen, ob ein Rückblick offen ist und was als Nächstes kommt.*

- „2 Rückblicke offen" mit Link, für **jede Person mit eigenen Terminen**, auch `owner` (B6). Heute prüft
  `Dashboard.tsx:65` auf `role === 'teacher'`
- Nächster eigener Termin: Einstieg „Kurs vorbereiten" mit Stand der Akte. Existiert die Hero-Karte (KE11), sitzt er
  dort, sonst in der bestehenden Zeile
- Kein Hinweis, wenn nichts offen ist

**Akzeptanz:** Screenshots für Solo-Owner mit offenem Rückblick und Lehrkraft ohne offenen Rückblick. **STOPP.**

#### 3.3 Schwerpunkte verwalten
*Als Studio-Owner möchte ich die Schwerpunkte an meine Yoga-Richtung anpassen.*

- In `Settings.tsx`, nur Owner/Admin: hinzufügen, umbenennen, sortieren, archivieren, wiederherstellen
- Umbenennen wirkt auf die Historie (gleiche ID). Die Oberfläche sagt das
- Archivierte Schwerpunkte bleiben in der Historie sichtbar, sind aber nicht mehr wählbar
- Doppelter Name → Meldung

**Akzeptanz:** Archivieren eines benutzten Schwerpunkts, Historie zeigt ihn weiter, Auswahl nicht. **STOPP.**

### Sprint 4 — Abnahme

#### 4.1 Testfälle mit Nachweis
Cross-Tenant-Lesen und -Schreiben (Header A/B) · zweite Lehrkraft im selben Studio · Owner/Admin nur lesend · Solo-Owner
als Lehrkraft schreibt · Übergabe eines Termins an eine andere Lehrkraft · Termin/Serie/Lehrkraft/Studio löschen mit
Akte · Studio jünger als 4 Wochen · Termin um 23:30 Uhr (Kursende nach Mitternacht Berlin) · Termin ohne `end_time` ·
Umbenannter Kurstitel · archivierter Schwerpunkt · 4. Schwerpunkt · leere Planung. Jeder Fall mit Nachweis im
Abschlussbericht. **STOPP.**

---

## 7. Überschneidungen mit der Geldkette

| Stelle | Geldkette | Kursakte | Umgang |
|---|---|---|---|
| `registrations` | 2.1 baut Stati um, Soft-Cancel | nur lesen (Namen, erste Buchung) | „Erste Buchung" muss nach 2.1 `cancelled` ausschließen. In 2.1 als Prüfpunkt aufnehmen. Anwesenheit (KE2) dort entwerfen. |
| Kurs löschen | 0.2 sperrt bei aktiven Anmeldungen | 3.1 sperrt bei Akte | Eine gemeinsame Meldungslogik in `MyCourses.tsx`. Wer zuerst kommt, baut sie. |
| `courses.teacher_id` | 0.2: `CASCADE` → `RESTRICT` | Akte `NO ACTION` | Verträglich. Mit `RESTRICT` scheitert das Löschen der Lehrkraft schon vorher. |
| `pg_temp`, `search_path` | 0.2 entfernt `pg_temp` | neue RPCs ohne `pg_temp` | — |
| Events | 0.3 legt `events` an | A8: keine Events im Start | Nachrüsten nach 0.3 als eigene kleine Story. |
| DEV-Datenbank | eigener Branch bis nach Release-Schnitt | KE13 | Strategie-Projekt. |

## 8. PROD erst, wenn alles zutrifft

1. Alle Stories grün auf DEV, 4.1 belegt
2. **Mehrfachmitgliedschaft (Stufen 1–3c) ist auf PROD.** Die Policies nutzen `get_my_member_id()`, das PROD heute
   nicht hat (`CLAUDE.md`, Stand)
3. Probelauf der Migration auf einer PROD-Kopie nach `SCHEMA_RELEASE_WORKFLOW.md`
4. Datenschutzerklärung nennt Kursakten als Verarbeitung (Rechts-Epic). Die Akte enthält Namen nur als Auswertung,
   gespeichert werden keine Personendaten außer `updated_by`
