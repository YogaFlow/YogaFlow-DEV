# Offene Punkte

**Stand:** 25.09.2026
Ausführliche Begründungen stehen im Claude-Projekt „Omlify" in
`Landingpage_Neubau_September_2026.md` und
`Rechtstexte_Datenschutz_und_Betrieb_September_2026.md`.

Erledigte Punkte werden gestrichen und mit Datum unter „Erledigt" vermerkt.

---

## Jetzt

- [ ] **K1 wartet auf PROD** (`docs/EPIC_KONTO_ZUGANG.md`): 1 Migration, 2 Functions.
      Geht mit dem nächsten Release zusammen mit K2. Auf DEV erledigt (`c6df666`, `2f724f0`).
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

## Bald — vor dem dritten Studio oder dem ersten zahlenden Kunden

- [ ] **`send-verification-email` absichern.** Mit Anon-Key und beliebiger `userId`
      ohne Sitzung aufrufbar. Nach K1 kein Datenschaden mehr, aber fremde
      Bestätigungsmails lassen sich auslösen. Sitzung verlangen oder Rate-Limit.
- [ ] **Mindestlänge Passwort auf 8 Zeichen vereinheitlichen.** Registrierung prüft 6,
      Onboarding und Reset 8. Umsetzung mit K2.
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
- [ ] **Kündigung eines Studios** gibt es nur von Hand
      (`delete_tenant_complete`, 30 Tage Exportfenster laut AGB § 9).
- [ ] **Teilnehmerinnen können ihr Konto nicht selbst löschen.** Anfragen per
      Mail müssen binnen eines Monats bearbeitet werden.
- [ ] **Ausgehende Systemmails auf europäischen Anbieter** umstellen
      (Empfehlung Scaleway TEM). Keine Codeänderung, nur Secrets und DNS.
      Vorher Zustelltest gegen Gmail, GMX, Web.de, Outlook.
- [ ] **Systemmails überarbeiten:** siezen heute, Landingpage duzt; altes Design
      (Arial, `#0f766e`).
- [ ] **Veraltete Dokumentation korrigieren:**
      `EMAIL_SYSTEM_DOCUMENTATION.md` und `docs/RELEASE_PR_AND_NEXT_STEPS.md`
      beschreiben Gmail als Mailversand — richtig ist Resend für ausgehende Mails,
      IONOS nur für das Postfach. `docs/README.md` nennt `wrangler.toml` —
      wirksam ist `wrangler.jsonc`.

## Später

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
- [ ] **`tsc` ist rot** — neun Altlasten in App-Dateien.
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
