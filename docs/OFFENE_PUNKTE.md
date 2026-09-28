# Offene Punkte

**Stand:** 28.09.2026
Ausführliche Begründungen stehen im Claude-Projekt „Omlify" in
`Landingpage_Neubau_September_2026.md` und
`Rechtstexte_Datenschutz_und_Betrieb_September_2026.md`.

Erledigte Punkte werden gestrichen und mit Datum unter „Erledigt" vermerkt.

---

## Jetzt

- [ ] **Befreite Kurse je Kurs (§ 4 UStG)** — A7 H1: Steuerstatus nur Studio-weit
      (`regular` 19 %/7 % oder Kleinunternehmer). Abweichung je Kurs später.
- [ ] **SKR-/DATEV-Mapping** — laut Epic in 1b, nicht A7.

- [ ] **AVV an die Testkundin schicken** — rückwirkend, per Mail von
      `support@omlify.de`, mit Bitte um Bestätigung in Textform. Sie verarbeitet
      Teilnehmerdaten über Omlify, ohne dass ein Vertrag nach Art. 28 DSGVO besteht.
- [ ] **R2-Lifecycle-Regel auf 90 Tage** im Bucket `omlify-backups`. AVV und
      Datenschutzerklärung nennen 90 Tage Aufbewahrung; ohne Regel stimmt das nicht.
- [ ] **Zwei-Faktor-Anmeldung prüfen** bei Supabase, Cloudflare und GitHub.
      Anlage 1 des AVV sagt, dass sie aktiv ist.
- [ ] **Search Console:** „Indexierung beantragen" für `https://omlify.de/`.
      Im Live-Test „Getestete Seite ansehen" → Screenshot prüfen: Ist der
      Fließtext der Landingpage zu sehen? Das entscheidet über das Prerendering.
- [ ] **`scripts/test/` prüfen** — liegt unversioniert im Arbeitsbaum. Stehen
      Zugangsdaten darin, in `.gitignore` aufnehmen oder löschen.

## Später — nach A6-3

- [ ] **Mail bei `pass.expiring`** — der Verfall-Job schreibt nur das Event
      `pass.expiring` (14 Tage vor `valid_until`, Rest > 0). Keine E-Mail in A6-3.

## Bald — vor dem dritten Studio oder dem ersten zahlenden Kunden

- [ ] **Onboarding-Token statt 10-Minuten-Fenster in `handle_new_user`.** Das Fenster
      lässt die erste Anmeldung mit `role=owner` gewinnen, solange das Studio
      jünger als zehn Minuten ist und noch keine Inhaberin hat.
- [ ] **`sync_profile_role_from_app_metadata` nur bei der ersten Rollenzuweisung.**
      Heute schreibt der Trigger die Rolle bei jedem Wechsel von `raw_app_meta_data`
      neu, wenn das Login genau ein Profil hat.
- [ ] **`tenants` für `anon` auf die nötigen Felder einschränken statt `select *`.**
- [ ] **Bestehende Edge Functions reichen teils `error.message` nach außen durch**
      (`update-user`, `onboarding-public`). Auf die Fehlerform aus
      `_shared/service.ts` umstellen, wenn sie ohnehin angefasst werden.
      `delete-user` tut das seit 27.09.2026 nicht mehr.
- [ ] **`send-verification-email` absichern.** Mit Anon-Key und beliebiger `userId`
      ohne Sitzung aufrufbar. Nach K1 kein Datenschaden mehr, aber fremde
      Bestätigungsmails lassen sich auslösen. Sitzung verlangen oder Rate-Limit.
- [ ] **Benachrichtigungen füllen `user_notifications.title` nicht.** Die Glocke leitet
      die Beschriftung aus `action_path` ab (`Header.tsx`, `c3dfb3b`). Wenn einmal
      mehr Typen dazukommen, `title` befüllen.
- [ ] **Mindestlänge Passwort.** Supabase-Dashboard steht in DEV und PROD auf 6, Soll ist 8.
      Die Registrierung prüft ebenfalls noch 6. K2 prüft 8.
- [ ] **`audit_log`-Eintrag für das Passwortsetzen fehlt.** 0.3a liegt auf PROD
      (`insert_audit`). Eigener Punkt, nicht Teil der K2-Abnahme.
- [ ] **`service-ping`-Nachweis auf PROD nachholen.** Auf DEV belegt. Auf PROD scheiterte
      der Aufruf mit echtem Owner-Token an einer abgelaufenen Sitzung. Nachholen, wenn
      die erste fachliche Function über `initService` entsteht (A3).
- [ ] **Teilnehmerliste zeigt für Kursleitungen keine Rollen** — bewusst so, keine
      Änderung nötig (Beobachtung Julius, 23.09.).
- [ ] **Paket „Rollenrechte auf users“**
      - `users_select_teacher_participants`: Kursleitung sieht volle Zeilen aller
        Teilnehmenden des Studios (Adresse, Telefon), nicht nur eigener Kurse.
        Produktfrage: Was braucht eine Kursleitung?
      - `users_select_teacher_staff`: Kursleitung sieht volle Zeile der Inhaberin.
      - `anon` hat Tabellen-SELECT auf `users` (nur fehlende Policy schützt).
      - `Participants.tsx`: Route ohne Rollenprüfung.
      - `yogaflow_private.is_participant()` wird von keiner Policy mehr genutzt.
- [ ] **Passwortfeld auf `/auth`** schreibt die Eingabe als `value`-Attribut ins DOM
      (sichtbar in Chrome-DevTools-Warnungen). Prüfen und beheben.
- [ ] **`get_current_member`** liefert beim Laden von `/auth` einmal 406 (vor
      abgeschlossenem Login). Prüfen, ob der Aufruf dort nötig ist.
- [ ] **Landingpage:** zwei vorgeladene Schriften werden nicht rechtzeitig genutzt
      (Preload-Warnung in der Konsole).
- [ ] **AVV-Checkbox im Onboarding.** Die Checkbox umfasst AGB und Datenschutz,
      nicht den AVV. Braucht Zustimmung mit Zeitstempel als Nachweis. Fasst den
      Registrierungsweg an — eigenes Paket mit Test.
- [ ] **`tenants`-Policy einschränken.** `anon` darf heute alle Studios lesen;
      nötig ist nur die eine Zeile zum Slug aus dem Header. Entwurf liegt vor.
      Fehler hier = kein Studio lädt mehr. Eigenes Paket mit Testliste.
- [ ] **Firefox:** „Acquiring an exclusive Navigator LockManager lock … immediately failed“
      beim Token-Refresh (Teilnehmer, 22.09.). Prüfen, ob die App genau einen Supabase-Client
      anlegt. Beobachten, ob Nutzer unerwartet abgemeldet werden.
- [ ] **`console.log("Supabase configured with URL …")` im Produktions-Bundle entfernen.**
- [ ] **`record_service_ping` schreibt Audit mit Teilnehmenden als Akteur.**
      Wer die Rolle `user` hat und den Ping aufruft, bekommt einen
      Audit-Eintrag. Das zählt als Geldbezug: die Person wird anonymisiert
      statt gelöscht. Vorschlag: Ping ohne Audit oder ohne Akteur.
- [ ] **Studio-Export als eigene Story.** Kündigung eines Studios gibt es nur
      von Hand (`delete_tenant_complete`, nur `service_role`, L5). AGB § 9
      verspricht 30 Tage Exportfenster. Heute exportiert die Teilnehmerliste
      nur Kurs, Datum, Name, E-Mail, Telefon, Status, Anmeldedatum — keine
      Zahlungen, Events oder Audit. Export vor dem Löschen ist nicht gebaut.
- [ ] **Rechtstexte anpassen (Julius, mit Anwalt).** Datenschutz Abschnitt 12
      sagt, Buchungen würden mit dem Konto gelöscht. AGB § 9 und AVV § 10
      löschen nach 30 Tagen „unwiderruflich“, ohne Aufbewahrung von
      Zahlungsvermerken. Das widerspricht 4.3.
- [ ] **Endgültige Löschfrist klären (L4).** `anonymized_at` wird gespeichert.
      Ein Job, der den anonymisierten Rest später löscht, kommt nicht in 4.3.
- [ ] **Teilnehmerinnen können ihr Konto nicht selbst löschen (L1).** Anfragen
      laufen weiter über das Studio. Mail binnen eines Monats bearbeiten.
- [ ] **Ausgehende Systemmails auf europäischen Anbieter** umstellen
      (Empfehlung Scaleway TEM). Keine Codeänderung, nur Secrets und DNS.
      Vorher Zustelltest gegen Gmail, GMX, Web.de, Outlook.
- [ ] **Systemmails überarbeiten:** siezen heute, Landingpage duzt; altes Design
      (Arial, `#0f766e`).
- [ ] **`EditCourse` preist bei Serien-Updates auch vergangene Termine um**
      (`EditCourse.tsx` aktualisiert die Serie ohne Datumsfilter). Befund
      A2-Inventur. **Eigener Fix direkt nach A8, vor Stripe** (S6). Künftig nur
      kommende Termine ändern. Die Kursbearbeitung soll bei einer Preisänderung
      anzeigen, dass bestehende Buchungen den alten Preis behalten (Nachtrag, L9).
- [ ] **A8-Feinschliff (Kassier-/Teilnehmerliste)**
      - ~~`MemberPassesSection` doppelt eingebunden~~ — behoben in A6-3
        (`matchMedia`, nur ein Layout mountet).
      - `npm run test:geldkette` braucht Pause bzw. Wiederholung gegen das
        Auth-Rate-Limit (viele Logins hintereinander).
      - Sammel-RPC Kassieren für große Kurse (viele Einzel-
        `record_manual_payment`-Tipps) — **nach Release**, nicht A8.
      - ~~Serienbearbeitung schreibt auf vergangene Termine~~ — siehe Punkt
        oben (S6, Fix nach A8).
      - Zwei Teilnehmerlisten (Kasse vs. Kontaktliste) zusammenlegen —
        **später**, nicht A8.
      - ~~A8-2 Offene Zahlungen / Alte Kurse abhaken / coverageLabel~~ —
        erledigt 28.09.2026.
- [ ] **Veraltete Dokumentation korrigieren:**
      `EMAIL_SYSTEM_DOCUMENTATION.md` und `docs/RELEASE_PR_AND_NEXT_STEPS.md`
      beschreiben Gmail als Mailversand — richtig ist Resend für ausgehende Mails,
      IONOS nur für das Postfach. `docs/README.md` nennt `wrangler.toml` —
      wirksam ist `wrangler.jsonc`.

## Später

- [ ] **`yogaflow_private.is_tenant_manager()` härten.** `search_path` ist nur
      `public` (`20260911173000`, Zeile 143). Beim nächsten Anfassen auf
      `public, pg_temp` stellen (`pg_temp` zuletzt) oder auf `''` mit
      voll qualifizierten Namen.
- [ ] **Supabase CLI auf 2.117.0 angleichen** (Worktree nutzte sie bereits in
      Release 2026-09c). Nur zwischen zwei Releases aktualisieren, nie kurz davor.
- [ ] **Prerendering der Landingpage + echter 404.** Der Fließtext entsteht erst
      im Browser; KI-Crawler sehen nur Titel und Beschreibung. Beides zusammen
      angehen, wenn Suche als Kanal zählt.
- [ ] **workers.dev-Route am PROD-Worker abschalten — nur nach Test auf DEV.**
      Die Wildcard `*.omlify.de` zeigt auf die workers.dev-Adresse.
- [ ] **Studio-eigene Rechtsangaben.** Auf Studio-Subdomains gelten Impressum und
      Datenschutz des Studios; `tenants` hat dafür kein Feld.
- [ ] **`og:image` auf Studio-Subdomains** zeigt das Omlify-Bild.
- [ ] **Tab-Titel-Fallback** in `src/lib/documentBranding.ts` ist zu lang.
- [ ] **Studio-Subdomains auf DEV** sind nicht durch Cloudflare Access geschützt.
- [ ] **PROD-Worker umbenennen** (`yogaflow-dev` → sprechender Name); braucht
      kurze Nichterreichbarkeit.
- [ ] **Öffentliche Kursliste ohne Login** auf Studio-Subdomains — Produktentscheidung.

## Regeln, die man nicht vergessen darf

- **Cloudflare-PR zu `wrangler.jsonc`** (`"name"` → `yogaflow-dev`) nicht mergen.
  Die Vorgabe `omlify-dev` ist Absicht.
- **DNS `*.omlify.de` nie auf „DNS only" stellen** — darüber laufen alle
  Buchungsseiten.
- **Nur ein SPF-Eintrag pro Hostname.** Auf `omlify.de` steht der von IONOS,
  auf `send.omlify.de` der von Resend.
- **Nach jedem Deploy im Inkognito prüfen**, nicht im normalen Browserfenster.
- **Schema-Änderungen auf PROD** immer erst nach manuellem Backup-Lauf und getrennt
  vom Frontend-Release.

## Erledigt

- 28.09.2026 — A7 abgeschlossen (A7-1 Schema/Job + A7-2 UI/Export): Steuerstatus,
  Wartehinweis, CSV-Hauptbuch (`export_ledger`), Kassenhinweis E14. Nachtrag
  `docs/EPIC_GELDKETTE_1A_NACHTRAG_2026-09-21.md`. Commits `0d941e0`, `e92e611`,
  `9973acd`. CI https://github.com/YogaFlow/YogaFlow-DEV/actions/runs/36391942792
- 28.09.2026 — E14-Hinweis in der Kasse: „Omlify vermerkt nur, wer bezahlt hat. …“
  (`CASH_HINT` in der Kasse, auch bei abgesagtem Kurs). A7-2.
- 27.09.2026 — `delete-user` mappt `23503` nicht mehr auf „hat noch Kurse“.
  Die Function ruft `remove_member` und löscht das Login nur bei
  `remaining_profiles === 0` (Zahl). Geschrieben, Deploy auf DEV steht aus.
  Kein Lösch-Knopf, bis Schritt 3. 4.3 bleibt PROD-Gate.
- 26.09.2026 — Sicherheits-Hotfix Rolle bei Registrierung live auf PROD (Release 2026-09e, Merge `e5f7b80`, Migration `20260926160500`).
- 26.09.2026 — K1, K2 (a–d) und 0.3 (a–c) live auf PROD (Release 2026-09d, Merge `3d41292`).
- 26.09.2026 — K2 (a–d) auf DEV abgenommen: K2a `db8f520`, K2b `f04c776`,
  K2c `f001222` und `c3dfb3b`, K2d `730e721`.
- 25.09.2026 — K1 auf DEV abgenommen (`c6df666`, `2f724f0`).
- 22.09.2026 — E4 Staff-Sichtbarkeit: Policy `users_select_participant_staff`
  entfernt, Namen über `staff_names` (Release 2026-09c)
- 22.09.2026 — Glocke beim Nachrücken (`user_notifications`, `type = waitlist_promoted`)
  (Release 2026-09c)
- 22.09.2026 — `gdpr_consent` und `gdpr_consent_date` auf PROD entfernt
  (`20260920132143`, Release 2026-09b)
- 22.09.2026 — `courses.teacher_id` auf PROD nicht mehr `CASCADE`, sondern `RESTRICT`
  (`20260921233800`, Release 2026-09b)
- 21.09.2026 — Support-Postfach `support@omlify.de` bei IONOS
- 21.09.2026 — Google Search Console eingerichtet, Sitemap eingereicht
- 20.09.2026 — Impressum, Datenschutzerklärung, AGB, AVV live
- 20.09.2026 — Neue Landingpage auf `omlify.de`
