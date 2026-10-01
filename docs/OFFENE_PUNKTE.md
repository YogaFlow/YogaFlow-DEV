# Offene Punkte

**Stand:** 30.09.2026
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
- [ ] **Auswahl „Kursleiter“ für Lehrende fest auf sich selbst** (kleiner UI-Fix vor dem
      Release). `CreateCourse.tsx` und `EditCourse.tsx` zeigen Lehrenden die volle Liste;
      seit Hotfix `20260928213000` endet eine fremde Wahl in `INVALID_TEACHER` mit
      allgemeiner Fehlermeldung.
- [ ] **`scripts/db.mjs` DEP0190:** `spawnSync` mit `shell: true` — die DB-URL läuft
      durch cmd. Ohne Shell aufrufen.

## Geldkette 2.1b / 2.2

- [ ] **Erstattung nach `payment.refund_required` (2.2a-3/4).** Schema 2.2a-1 verbucht die
      Spätzahlung und markiert `REFUND_REQUIRED`; die Stripe-Erstattung selbst kommt in der Function.
      **Teilerstattung → 3.2** (Entscheidung 09 Q7: in 1a nur volle Erstattung).
- [ ] **„Mit Karte statt online bezahlen“ bei `pending_payment`.** Später; Geld-Aktionen
      lehnen pending heute ab (`PAYMENT_PENDING`).
- [x] **Hauptbuch `card` → `psp_clearing`.** Erledigt in 2.2a-1 (`ledger_money_account`).
      Gebühren im Hauptbuch → **1b** (C5).
- [ ] **Mindest-Zahlzeit beim Nachrücken.** Heute reicht eine Frist knapp in der Zukunft
      (`promotion_hold_deadline`); ob ein Mindestfenster (z. B. 15 Min.) nötig ist, offen.
- [ ] **E-Mail-Vorlage Nachrücken / Zahlungspflicht vom Anwalt prüfen lassen**
      (Rechts-Epic). Betreff und Text stehen in `dispatch-emails`.
- [x] **Test-Helfer nach `scripts/test/_helpers.mjs` auslagern.** Erledigt 2.2a-1; neue
      Skripte nutzen die Datei, bestehende bleiben unverändert.
- [x] **`provider_customers`.** Entscheidung 09 C6: nicht bauen (überholt P5).
- [ ] **`acct_…`-Regel (C12).** `prepare_online_payment` liefert `account_ref` an
      `service_role`; Client weiterhin ohne `acct_…`. Edge Function 2.2a-2 muss das so halten.
- [ ] **`pk_test_`-Prüfung nur im Dev-Modus.** `OnlinePaymentSection` prüft den Prefix nur bei
      `import.meta.env.DEV`. Ein Production-Build (auch `omlify-dev.de`) akzeptiert jeden
      gesetzten `VITE_STRIPE_PUBLISHABLE_KEY`. In **2.2** den Key im Build gegen
      `PAYMENTS_MODE` absichern (test → `pk_test_`, live → `pk_live_`).
- [ ] **S6g — doppelte Zustellung möglich.** Stürzt `dispatch-emails` nach dem SMTP-Versand,
      aber vor `mark_email_delivery(..., sent)` ab, kann dieselbe Aufforderung erneut
      rausgehen („mindestens einmal“). Bewusst akzeptiert; kein Idempotenz-Token beim
      SMTP-Versand.
- [ ] **Bezahlen-Knopf für `pending_payment` → 2.2b.** In 2.1b-b bewusst nicht gebaut (S7).
- [ ] **Apple Pay im Web (Domain-Verifizierung).** Prüfen, ob Stripe für Direct-Charge-Konten
      eine Datei unter `/.well-known/` verlangt; falls ja, liefert sie der Worker für jede
      Subdomain aus (C11 / `registerPaymentDomain`).

## Stripe (Story 1.2a und folgende)

- [ ] **Aufbewahrungsfrist `provider_events_raw`.** Payload enthält Personendaten
      (Name, E-Mail, letzte vier Kartenziffern). Seit 1.4 speichert der Webhook den
      ganzen Event-Body. Frist bzw. Kürzen nach Verarbeitung festlegen (Rechts-Epic),
      dann Job bauen. In 1.2a und 1.4 bewusst nicht gebaut.
- [ ] **Nachverarbeitung liegen gebliebener Rohzeilen → 5.1.** Zeilen mit
      `processed_at IS NULL` (Stripe hat nach 500ern aufgegeben) und Zeilen mit
      `processing_error = 'TENANT_NOT_RESOLVED'` (Event vor dem Konto in
      `provider_accounts`) werden heute nicht erneut angefasst. Der Abgleich in 5.1
      muss sie finden und nachverarbeiten.
- [ ] **Neues Konto nach `disconnected`.** Nach `account.application.deauthorized`
      bleibt das Studio ohne neues Stripe-Konto. Ob und wie Owner erneut onboarden
      dürfen, ist nicht Teil von 1.3a (O6).
- [x] **Thin-Events: Geltungsbereich nach E2E.** Erledigt 29.09.2026 (Demo Alpha):
      Thin (`v2.core.account…`) und Snapshot (`account.updated`) kommen beide an;
      Details unter „V4 Ereignisse“ weiter unten.
- [ ] **Stripe-Testkonten in der Sandbox aufräumen (optional).** Rauchtests legen
      Connect-Konten an; sie bleiben in der Stripe-Sandbox. Bei Bedarf manuell
      löschen oder periodisch aufräumen.
- [x] **1.3b — Oberfläche Onboarding.** Abschnitt in den Einstellungen; Zustände
      `not_started` … `disconnected`; `action_required` in der UI wie `in_progress`.
- [ ] **Keine CSP gesetzt – bei Einführung Stripe-Quellen (`js.stripe.com`,
      `connect-js.stripe.com`, Frames) ergänzen.**
- [ ] **Impressum je Studio ist Pflicht vor Live-Onboarding.** Stripe prüft die
      Website; Platzhalterseiten sind nicht erlaubt. Rechts-Epic, hart.
- [x] **V4 Ereignisse (E2E 29.09.2026, Demo Alpha).** Beide Stripe-Ziele liefern:
      `account.updated` über „Verbundene Konten“/Snapshot; `v2.core.account[…]`
      über „Ihr Konto“/Thin. Doppelte Ereignisse durch Nachlesen (W3) harmlos.
      Später prüfen, ob Snapshot-`account.updated` entfallen kann (weniger Abrufe).
- [ ] **Stripe-Login per Fenster beim Onboarding.** Folge von P7 (`dashboard: full`);
      bewusst akzeptiert — Stripe legt beim Formular ein eigenes Login an.
- [ ] **`disconnected` neu verbinden.** Nach `account.application.deauthorized` ist
      Online aus und die UI zeigt nur den Hinweis — kein erneutes Einrichten in 1.3b.
- [ ] **Onboarding-/Gebühren-Texte vom Anwalt prüfen lassen** (Rechts-Epic). Stand
      09/2026 Stripe-Listenpreis; Formulierungen in `paymentSetupCopy.ts`.
- [ ] **`action_required` für Nachforderungen nach Aktivierung, später.** Der Adapter
      mappt v2 vorerst nie auf `action_required` (frisch `past_due` + Nutzerin am Zug →
      `in_progress`; Enum bleibt). UI behandelt den Wert wie `in_progress`.
- [ ] **`evt_smoke_`-Zeilen auf DEV.** Der Rauchtest `scripts/test/s1_4_webhook_smoke.mjs`
      hinterlässt Rohzeilen ohne Studio (Event-IDs mit Präfix `evt_smoke_`). Sie lassen
      sich wegen des Lösch-Triggers nicht löschen (Absicht). Mit der Aufbewahrungsfrist
      mitnehmen.
- [ ] **Log-Fix wirkt erst nach DEV-Deploy.** E-Mail-Adressen in `send-email`,
      `request-password-reset` und `request-verification-email` laufen seit 1.2b im Code
      durch `createServiceLogger` (Info- und Fehler-Logs). Offen: Deploy der drei
      Functions auf DEV.
- [ ] **Erstattungen im Stripe-Dashboard des Studios.** Mit vollständigem Dashboard (P7)
      können Studios selbst erstatten. Solche Erstattungen muss 3.2 per Webhook
      (`charge.refunded`) erkennen und buchen.
- [x] **`card` im Hauptbuch → Endlosschleife `UNSUPPORTED_PAYMENT`.** Behoben 2.2a-1
      (`psp_clearing`).
- [ ] **Namenskollision „Checkout“.** In der App heißt die Kassier-Ansicht umgangssprachlich
      Kasse/Checkout, Stripe nennt den Bezahlschritt Checkout. Vor 2.2 Begriffe festlegen.
- [ ] **Online aus und vor Ort aus zugleich.** 1.2a erlaubt beides (Ausschalten ist immer
      erlaubt, automatisches Aus bei nicht bereitem Konto). 2.2 muss festlegen, was dann
      bei Bezahlkursen passiert.
- [ ] **Plattform-Schalter aus, Studios noch an.** `set_platform_flag(false)` schaltet
      Studios nicht mit aus. 2.2 muss beim Checkout beide Schalter prüfen.

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
- [ ] **Preisänderung: Hinweis, dass bestehende Buchungen den alten Preis behalten**
      (Nachtrag L9). Serienbearbeitung ändert seit S6 nur kommende Termine;
      der Hinweistext fehlt noch.
- [ ] **A8-Feinschliff (Kassier-/Teilnehmerliste)**
      - ~~`MemberPassesSection` doppelt eingebunden~~ — behoben in A6-3
        (`matchMedia`, nur ein Layout mountet).
      - `npm run test:geldkette` braucht Pause bzw. Wiederholung gegen das
        Auth-Rate-Limit (viele Logins hintereinander).
      - Sammel-RPC Kassieren für große Kurse (viele Einzel-
        `record_manual_payment`-Tipps) — **nach Release**, nicht A8.
      - ~~Serienbearbeitung schreibt auf vergangene Termine~~ — erledigt S6
        (28.09.2026).
      - Zwei Teilnehmerlisten (Kasse vs. Kontaktliste) zusammenlegen —
        **später**, nicht A8.
      - ~~A8-2 Offene Zahlungen / Alte Kurse abhaken / coverageLabel~~ —
        erledigt 28.09.2026.
- [ ] **Veraltete Dokumentation korrigieren:**
      `EMAIL_SYSTEM_DOCUMENTATION.md` und `docs/RELEASE_PR_AND_NEXT_STEPS.md`
      beschreiben Gmail als Mailversand — richtig ist Resend für ausgehende Mails,
      IONOS nur für das Postfach. `docs/README.md` nennt `wrangler.toml` —
      wirksam ist `wrangler.jsonc`.
- [ ] **Native Datumsfelder zeigen je nach Browser US-Format** (`MM/DD/YYYY`),
      obwohl der Wert civil `YYYY-MM-DD` ist. Betrifft Steuerstatus
      (`TaxStatusDialog`) und „Alte Kurse abhaken“ (`PreOmlifyWaiveSection`).
      Anzeige-Format vereinheitlichen (z. B. `de-DE` bzw. Textfeld mit
      Kalender), ohne den gesendeten ISO-Wert zu ändern.

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

- 30.09.2026 — 2.2a-1 geschrieben (nicht angewendet): `psp_clearing`, Checkout-RPCs,
  `register_for_course`→`pending_payment`, Test `_helpers.mjs` + `s2_2a_1_online_payment.mjs`.
- 29.09.2026 — 2.1b-b: S1–S8, S6a–h, K3, E2 auf DEV (Outbox, `dispatch-emails`, UI
  `pending_payment`). Bezahlen-Knopf bewusst offen → 2.2b.
- 29.09.2026 — Abbildung V2: frisches Konto mit `past_due` + `awaiting_action_from=user`
  → `in_progress` (nicht `action_required`); Adapter erzeugt `action_required` vorerst nicht.
- 28.09.2026 — Accounts v2 (P7 neu, V1–V5): Adapter `v2.core.accounts.create/retrieve`,
  Thin-Events + `STRIPE_WEBHOOK_SECRET_THIN`, Abbildung in `account_status.ts`.
  Kein Deploy/Commit in diesem Schritt; Commit 2 nach grünem Rauchtest.
- 28.09.2026 — 1.3a Backend: `account.application.deauthorized` → Status `disconnected`,
  Studio online aus (`PROVIDER_DISCONNECTED`); Migration `20260928231500`, Function
  `payments-onboarding` (geschrieben, Deploy ausstehend).
- 28.09.2026 — Deno-Tests in der CI: `denoland/setup-deno@v2` mit `v2.9.7`, danach
  `npm run test:deno` (`.github/workflows/ci.yml`).
- 28.09.2026 — Fehler-Logs in `send-email`, `request-password-reset` und
  `request-verification-email` laufen durch `createServiceLogger` (Maskierer).
- 28.09.2026 — 1.2b-2 bestätigt, ergänzt um `requirementsPending` und
  `requirementsDueAt` in `ProviderAccountState` (Nachtrag 5b).
- 28.09.2026 — E11 und E12 entschieden (P6, P7): Julius als Einzelunternehmer,
  vollständiges Dashboard; Konto-Modell später auf Accounts v2 (P7 neu, Nachtrag 5d).
- 28.09.2026 — Sicherheits-Hotfix Kursleitung-Guard live auf PROD (Merge `3bcd961`,
  PR #174, Migration `20260928213000`, Trigger `courses_teacher_guard_hotfix`).
- 28.09.2026 — A5: Vergangene Kurse nur eingeschränkt bearbeitbar (Client) und
  Kursleitung-Guard in der DB (`20260928170000`, RLS INSERT/UPDATE + Trigger
  `INVALID_TEACHER`). `pastCourseEditLocks` / `EditCourse`.
- 28.09.2026 — S6: Serienbearbeitung ändert nur kommende Termine
  (`futureSeriesCourses`, `EditCourse`). Serie löschen/absagen waren schon
  zeitgefiltert. Sprint A damit abgeschlossen.
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
