# Release-Plan Geldkette

Bestandsaufnahme und Release-Regeln für den PROD-Release der Geldkette (Sprint A und Folgestories). Keine Empfehlung zum Zeitpunkt — der Zeitpunkt folgt Teil „Release-Entscheidung“.

---

## Release-Entscheidung und Regeln (27.09.2026)

- Das **komplette Geldkette-Epic** geht gemeinsam auf PROD, erst nach vollständigem Test auf DEV.
- **`main` wird nach jedem Hotfix in Julius gemergt**, mindestens aber vor jeder neuen Story.
- **Pflicht-Generalprobe** auf einer Kopie der PROD-Datenbank mit `npm run test:geldkette`.
- **Stripe** bekommt einen Schalter je Studio. Das Update geht mit Stripe aus live; Einschalten danach je Studio, zuerst mit einer kleinen echten Zahlung.
- **Release-Abend in Etappen** mit Prüfpunkten: Hint-Frontend → Migrationen in Blöcken mit Zählwerten → Functions (`delete-user` nach 4.3, `payments-webhook` nach 1.4, `payments-onboarding` nach 1.3a) → neues Frontend.
- **Testlauf der doppelten Bestätigung** in `db.mjs`: `INCLUDE-ALL` richtig tippen; bei PROD absichtlich falsch → Abbruch ohne Änderung.
- Die **Migrationsliste** wird ab jetzt je Story fortgeschrieben (A4 eingetragen).

---

## 0. Ablauf Release-Abend (Stand 02.10.2026, HEAD `Julius` nach Lauf 02.10.)

Nur Doku — hier wird nichts ausgeführt. Alle PROD-Befehle führt Julius selbst im Terminal aus
(`scripts/db.mjs` mit getippter Bestätigung, nie umgehen). Bei jedem Prüfpunkt gilt: rot →
Rückweg dieses Schritts, nicht weiter.

### 0.1 Migrationen seit PROD-Stand, in Reihenfolge

PROD-Stand laut `origin/main`: zuletzt `20260928213000_security_courses_teacher_guard_hotfix`
(davor `20260926160500`). **Vor dem Abend mit `npm run db:status:prod` bestätigen.**
49 Dateien, alle mit Versionsnummer **vor oder nach** `20260928213000` — die ersten 20 liegen
davor und brauchen `--include-all` (zweite Bestätigung `INCLUDE-ALL`).

| # | Version | Datei (ohne Präfix) | Block |
|---|---|---|---|
| 1 | `20260926141500` | `a1_registration_status_cancelled` | A — Sprint A (Soft-Cancel, Deckung, Kasse, Absage, Entfernen) |
| 2 | `20260926141501` | `a1_registrations_soft_cancel_schema` | A |
| 3 | `20260926144500` | `a1_registrations_soft_cancel_rpcs` | A |
| 4 | `20260926180000` | `a2_registrations_select_own_courses` | A |
| 5 | `20260926190000` | `a2_registrations_coverage_and_price` | A |
| 6 | `20260927093608` | `a2_coverage_waived` | A |
| 7 | `20260927121500` | `a3_payments` | A |
| 8 | `20260927143000` | `a9_course_cancel` | A |
| 9 | `20260927145006` | `4_3_member_removal` | A |
| 10 | `20260927183209` | `a4_pass_products` | B — Karten, Hauptbuch, Sammel-Erlass, Guard |
| 11 | `20260927213000` | `a5_passes` | B |
| 12 | `20260927221500` | `a6_1_pass_booking_foundation` | B |
| 13 | `20260927233000` | `a6_2_redeem` | B |
| 14 | `20260927235000` | `a6_2b_tenant_delete_cycle` | B |
| 15 | `20260927235500` | `a6_2c_pass_fk_no_action` | B |
| 16 | `20260928010000` | `a6_3_reverse_and_expire` (pg_cron, Job `yogaflow_expire_passes`) | B |
| 17 | `20260928020000` | `a7_1_ledger` (Job `yogaflow_process_ledger`) | B |
| 18 | `20260928143000` | `a7_2_ledger_export` | B |
| 19 | `20260928160000` | `a8_1_bulk_waive_open_list` | B |
| 20 | `20260928170000` | `a5_courses_teacher_guard` | B |
| 21 | `20260928203500` | `s1_2a_provider_schema` (`online_payments = false`) | C — Stripe-Grundlage |
| 22 | `20260928224500` | `s1_4_webhook_rpcs` | C |
| 23 | `20260928231500` | `s1_3a_onboarding` | C |
| 24 | `20260929140000` | `s2_1b_a_pending_payment_enum` (eigene TX) | D — Halten, Nachrücken, Versand |
| 25 | `20260929140001` | `s2_1b_a_pending_payment_schema` (Job `yogaflow_expire_payment_holds`) | D |
| 26 | `20260929150000` | `s2_1b_b_promotion_e2` | D |
| 27 | `20260929151000` | `s2_1b_b_k3_promote_to_pending` | D |
| 28 | `20260929160000` | `s2_1b_b2_dispatch_emails` (pg_net, Job `yogaflow_dispatch_emails`) | D |
| 29 | `20260930100000` | `s2_2a_1_online_payment` | E — Online-Zahlung, Jobs, Erstattung |
| 30 | `20260930110000` | `s2_2a_1_k5_ledger_account` | E |
| 31 | `20260930120000` | `s2_2a_1_k6_attempt_payment_check` | E |
| 32 | `20261001100000` | `stripe_2_2a_4a_provider_jobs` (Job `yogaflow_process_provider_jobs`) | E |
| 33 | `20261001110000` | `k7_remove_member_attempt_refs` | E |
| 34 | `20261001120000` | `booking_payment_options` | E |
| 35 | `20261002100000` | `hold_expired_notification` | E |
| 36 | `20261002110000` | `s3_2a_refunds_schema` | E |
| 37 | `20261002111000` | `s3_2a_refunds_core` | E |
| 38 | `20261002112000` | `s3_2a_ledger_h5_partial` | E |
| 39 | `20261002113000` | `s3_2a_refund_triggers` | E |
| 40 | `20261002114000` | `s3_2a_late_payment_and_backfill` | E |
| 41 | `20261002114100` | `s3_2a_remove_member_refund_cents` | E |
| 42 | `20261002202506` | `s3_2b_dispute_ref_du` | E |
| 43 | `20261002210000` | `s3_2c_refund_previews` | F — Oberflächen-RPCs |
| 44 | `20261002220000` | `s3_1_payment_overview` | F |
| 45 | `20261002223000` | `s3_1_notification_payment_path` | F |
| 46 | `20261002230000` | `claim_release_without_count` | F |
| 47 | `20261004090000` | `b1_legal_profiles` | G — Kaufprozess (B1 Schema) |
| 48 | `20261004100000` | `b1_receipts` | G |
| 49 | `20261004110000` | `b1_provider_info_tax` | G |

`db push` wendet alle in einem Lauf an. Die Blöcke A–F sind Prüfpunkte der **Generalprobe**
(Zählwerte nach jedem Block, siehe 0.7); am Abend selbst genügt ein Lauf, wenn die Generalprobe
grün war. Jede Datei hat einen Kopf „Rückweg“ und einen `DO $$`-Selbsttest, der bei Abweichung
abbricht — ein Abbruch rollt nur diese Datei zurück, die vorherigen bleiben.

### 0.2 Edge Functions

Stand gegen `origin/main` (Ordner `supabase/functions/`):

| Function | Status | `verify_jwt` | Deploy am Abend |
|---|---|---|---|
| `dispatch-emails` | neu (B1: Vertragsbestätigung, Gate ohne Beleg) | `false` | ja, Schritt 1 |
| `payments-checkout` | neu | `false` | ja, Schritt 2 (antwortet ohne Stripe-Secrets mit `CONFIG_ERROR`) |
| `payments-webhook` | neu | `false` | ja, Schritt 3 (ohne Webhook-Secret 500 `CONFIG_ERROR`, niemand ruft sie) |
| `payments-jobs` | neu | `false` | ja, Schritt 4 |
| `payments-onboarding` | neu | `false` | ja, Schritt 5 (Onboarding bleibt aus, Schalter `false`) |
| `delete-user` | geändert (4.3) | wie bisher | ja, **nach** Migration 9 (`remove_member`) |
| `request-password-reset`, `request-verification-email`, `send-email` | geändert | wie bisher | ja |
| `service-ping` | Ordner gleich, importiert geändertes `_shared/service.ts` (Maskierer) | wie bisher | ja (Testwerkzeug) |
| `onboarding-public`, `reset-password`, `send-verification-email`, `set-participant-password`, `update-user`, `verify-email` | gleich, kein geändertes `_shared` | — | nein |

`supabase/config.toml` trägt `verify_jwt = false` für die fünf neuen Functions — vor dem Deploy
prüfen, dass `functions:prod` die Datei mitnimmt (sonst blockt das Gateway Stripe und Cron).

### 0.3 Secrets (nur Namen, Werte je Umgebung eigen, nie DEV→PROD kopieren)

| Secret | Am Release-Abend | Beim Einschalten (Plattform-Schalter) |
|---|---|---|
| `PROVIDER_JOBS_SECRET` | setzen (Zufallswert) | — |
| `EMAIL_DISPATCH_SECRET` | setzen (Zufallswert) | — |
| `APP_BASE_DOMAIN` | setzen (`omlify.de`) | — |
| `INTERNAL_EMAIL_SECRET`, `SMTP_*`, `SENDER_EMAIL`, `EMAIL_REDIRECT_TO`, `APP_URL` | bestehen, prüfen | — |
| `PAYMENTS_MODE` | **nicht setzen** | `live` |
| `STRIPE_SECRET_KEY` | **nicht setzen** | Live-Key (`sk_live_`/`rk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | **nicht setzen** | Snapshot-Ziel |
| `STRIPE_WEBHOOK_SECRET_THIN` | **nicht setzen** | Thin-Ziel |
| `STRIPE_WEBHOOK_SECRET_2` | nicht setzen | nur zur Rotation |
| `PAYMENTS_PROVIDER` | **nie** auf PROD | — |
| Cloudflare `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PAYMENTS_MODE` | **leer lassen** | `pk_live_…` / `live` |

### 0.4 Vault-Einträge (PROD-eigene Werte)

| Name | Inhalt | Wann |
|---|---|---|
| `email_dispatch_url` | `https://<PROD_REF>.supabase.co/functions/v1/dispatch-emails` | nach Deploy `dispatch-emails` |
| `email_dispatch_secret` | = `EMAIL_DISPATCH_SECRET` | zusammen mit URL |
| `provider_jobs_url` | `…/functions/v1/payments-jobs` | **zuletzt**, nach allen Functions |
| `provider_jobs_secret` | = `PROVIDER_JOBS_SECRET` | zusammen mit URL |

Fehlt ein Eintrag, ruft der Cron nichts auf (nur Log). Die DEV-Skripte
`scripts/dev/email_dispatch_secret.mjs` und `provider_jobs_secret.mjs` sind DEV-gebunden — für
PROD fehlt das Gegenstück (Liste 0.10).

### 0.5 Cron-Jobs, Pause und Fortsetzen

Die Migrationen legen fünf Jobs an; sie laufen ab dem Push:

| Job | Takt | Wirkung ohne Vault/Secrets |
|---|---|---|
| `yogaflow_expire_passes` | `5 * * * *` | läuft (Karten ablaufen lassen) |
| `yogaflow_process_ledger` | `*/5 * * * *` | läuft, wartet ohne Steuerstatus je Studio (H1) |
| `yogaflow_expire_payment_holds` | `* * * * *` | läuft, ohne Online-Zahlung keine Holds |
| `yogaflow_dispatch_emails` | `* * * * *` | ruft nichts auf, bis `email_dispatch_url` gesetzt ist |
| `yogaflow_process_provider_jobs` | `* * * * *` | ruft nichts auf, bis `provider_jobs_url` gesetzt ist |

**Pause** (für spätere Releases mit laufenden Jobs, Muster 3.2a/3.2b): Vault-URL leeren
(`provider_jobs_url`, ggf. `email_dispatch_url`) → Cron loggt nur. **Fortsetzen:** URL wieder
setzen. Jobs nicht `unschedule`n und kein `GRANT`/`REVOKE` auf `cron` (Befund A7-1, `2BP01`).
Prüfung: `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'yogaflow_%'` → fünf
Zeilen, alle `active`.

### 0.6 Stripe-Ereignisse je Ziel (erst beim Einschalten, nicht am Release-Abend)

URL beider Ziele: `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook`, Live-Modus.

- **Ziel 1 — „Verbundene Konten“, Nutzlast Snapshot** (`STRIPE_WEBHOOK_SECRET`):
  `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`,
  `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`,
  `charge.dispute.updated`, `charge.dispute.closed`
  (Quelle: `_shared/payments/stripe/adapter.ts` Zeilen 91–108 und `account.*`-Zweige).
- **Ziel 2 — „Ihr Konto“, Nutzlast Thin** (`STRIPE_WEBHOOK_SECRET_THIN`):
  `v2.core.account.created`, `v2.core.account.updated`, `v2.core.account.closed` und die
  `v2.core.account[…].updated`-Typen wie am DEV-Ziel (V4, 29.09.2026). Die genaue Liste vor dem
  Einschalten vom DEV-Ziel abschreiben (Stripe-Dashboard — Julius).

### 0.7 Generalprobe auf einer PROD-Kopie

1. Frischen PROD-Dump aus `backup-prod.yml` (R2, `roles.sql`, `schema.sql`, `data.sql`).
2. In ein **eigenes Probe-Projekt** einspielen (nicht DEV, nicht PROD).
3. `db push --include-all` gegen die Probe; nach jedem Block A–F aus 0.1 Zählwerte:
   317 Buchungen / 507800 Cent (Abschnitt 3), 8 Legacy-Absagen konsistent, Kurse je `status`,
   `platform_flags` = `online_payments | false`, `tenant_payment_settings` leer, fünf Cron-Jobs,
   beide Lehrer-Guard-Trigger `tgenabled = 'O'`.
4. Geldkette-Tests gegen die Probe (nicht DEV, nicht PROD):
   - `.env` temporär auf Probe-URL und Probe-Keys stellen (oder eigene Env).
   - `OMLIFY_PROBE_REF=<probe-ref>` und `OMLIFY_ALLOW_PROBE=1` setzen.
   - `node scripts/test/run_geldkette.mjs --probe`
   - Guard (`assertDevEnv`): Ref muss `OMLIFY_PROBE_REF` sein, darf weder DEV-Ref noch
     `PROD_REF` aus `.env.deploy` sein; braucht Flag **und** Env.
   - Übersprungen auf der Probe: `security_signup_role.mjs` (braucht `demoalpha`) sowie die
     Stripe-Rauchtests `s2_2a_3_checkout_smoke`, `s2_2a_4c_webhook_smoke`,
     `s3_2b_refund_smoke` (Exit 0 mit Hinweis, wenn mit `--probe` gestartet).

**Nicht hier ausführen** — nur vorbereiten. Gegen PROD und gegen die Probe erst, wenn Julius
den Lauf freigibt.

### 0.8 Ablauf und Rückweg je Schritt

| # | Schritt | Prüfpunkt | Rückweg |
|---|---|---|---|
| 0 | Vorab: `db:status:prod`, frischer Backup-Lauf, Pre-PROD-Checkliste (`DEV_PROD_SAFETY_WORKFLOW.md`) | Backup grün, Status = `20260928213000` | — |
| 1 | Hint-Frontend auf `main` (FK-Hints, Abschnitt 2) | App läuft auf altem Schema | Cloudflare: vorheriges Deployment |
| 2 | `npm run db:push:prod -- --include-all` (Julius, `PROD` + `INCLUDE-ALL`) | Zählwerte wie Generalprobe | Bei Abbruch in Datei n: Dateien < n bleiben; Rückweg aus den Dateiköpfen rückwärts, oder Restore des Backups aus Schritt 0 (Datenverlust ab Push) |
| 3 | Secrets aus 0.3 „am Release-Abend“ (`secrets:prod`) | `supabase secrets list` zeigt die Namen | Secret entfernen |
| 4 | Functions einzeln: `dispatch-emails` → `payments-checkout` → `payments-webhook` → `payments-jobs` → `payments-onboarding` → `delete-user` → Mail-Functions → `service-ping` | je Function ein Aufruf ohne Auth → erwarteter Fehlercode, kein 5xx außer `CONFIG_ERROR` bei Zahlungen | vorherige Version aus `main` neu deployen; neue Functions löschen |
| 5 | Vault `email_dispatch_*` | Outbox `email_deliveries` geht auf `sent` | Vault-URL leeren |
| 6 | Vault `provider_jobs_*` (zuletzt) | Cron-Log ohne Fehler, `provider_jobs` leer bzw. `done` | Vault-URL leeren |
| 7 | Neues Frontend (Merge `Julius` → `main`, Cloudflare) | Klickliste Rauchtest 0.9 | Cloudflare: vorheriges Deployment; Schema bleibt (Expand) |
| 8 | Steuerstatus je PROD-Studio (Owner), A8-Sammelaktion mit der Testkundin | Hauptbuch arbeitet ab | `revert` über die UI (Rückgängig) |

### 0.9 Rauchtests auf PROD (ohne Stripe, ohne Testdaten-Schreiben)

Die DEV-Rauchtests (`s1_4_…`, `s2_2a_3_…`, `s2_2a_4c_…`, `s3_2b_…`) brauchen Test-Keys und
`demoalpha` — auf PROD nicht. Stattdessen:

1. SQL nur lesend: `platform_flags`, `cron.job` (fünf Jobs), Vault-Namen vorhanden
   (`SELECT name FROM vault.secrets`), `tenant_payment_settings` leer.
2. `payments-webhook` ohne Signatur → 500 `CONFIG_ERROR` (kein Secret) — erwartet.
3. `payments-jobs` ohne Bearer → 401 `UNAUTHORIZED`; `dispatch-emails` ohne Header → 401.
4. App als Owner im Hauptstudio: Kurse, Teilnehmer, Kasse (offen/bezahlt), Zahlungen-Seite
   (nur manuelle Zahlungen), Offene Zahlungen, Einstellungen → Steuern, Kurs absagen
   **nicht** ausprobieren.
5. Als Teilnehmerin: Meine Anmeldungen, Kursdetail ohne „Online bezahlen“.

### 0.10 Vor dem Plattform-Schalter auf PROD (`online_payments = true`)

- [ ] **Rechts-Epic:** AGB/Datenschutz/Zahlungsbedingungen, Impressum je Studio (Stripe-Pflicht),
      Onboarding-/Gebühren-Texte vom Anwalt (`paymentSetupCopy.ts`).
- [ ] **Steuerberatung:** Hauptbuch-Konten, H5' Teilerstattung, Kleinunternehmer/Regel, Export.
- [ ] **Belege (4.2):** Quittungen/Rechnungen je Zahlung und Erstattung.
- [ ] **PROD-Replay** nach Abschnitt 0.11 (eigenes Runbook; DEV-Skript unverändert).
- [ ] PROD-Gegenstück zu `provider_jobs_secret.mjs` / `email_dispatch_secret.mjs` (Pause/Resume).
- [ ] Stripe-Ziele 0.6 anlegen, Live-Secrets 0.3, Cloudflare-Variablen, Payment-Method-Domain je
      Studio (`register_payment_domain` PROD-Analog).
- [ ] Erstes Studio einzeln einschalten, kleine echte Zahlung, Erstattung, Hauptbuch prüfen.

### 0.11 PROD-Replay — Runbook (Webhook-Ereignisse mit finalem Fehler)

Eigenes Runbook. Das DEV-Skript `scripts/dev/replay_provider_event.mjs` bleibt DEV-gebunden und
wird **nicht** umgebogen. Gegen PROD nur Julius, mit getippter Bestätigung wo `db.mjs` das verlangt.

**Wann:** Nach dem Functions-Deploy, wenn in `provider_events_raw` Zeilen mit finalem
`processing_error` liegen (nicht `null`, nicht nur transient), die nach Code-Fix erneut
verarbeitet werden sollen — z. B. Dispute-Prefix, `PAYMENT_NOT_READY` nach Schema-Nachzug.

**Voraussetzungen**

1. Live-Backup frisch (`backup-prod.yml`).
2. `payments-webhook` auf dem Stand, der den Fehler behebt (Deploy aus Schritt 0.8).
3. Stripe-Live-Secrets **nur** wenn der Plattform-Schalter schon an ist; sonst betrifft Replay
   nur bereits gespeicherte Rohzeilen ohne neuen Stripe-Abruf — Adapter-Nachlesen braucht Keys.
4. Liste der Event-IDs vorher nur lesend erheben (SQL auf PROD-Readonly oder Julius-Terminal),
   keine Secrets/Personendaten in Tickets.

**Ablauf (Julius)**

1. Readonly: betroffene `provider_events_raw.id` / `event_id` / `processing_error` notieren.
2. Pro Ereignis: Verarbeitung erneut anstoßen — **PROD-eigenes** Vorgehen (Skript oder RPC),
   analog zur DEV-Idee „Rohzeile erneut dem Webhook-Pfad zuführen“, aber mit PROD-Ref,
   PROD-Secrets und eigener Bestätigung. Kein Aufruf von `replay_provider_event.mjs` gegen PROD.
3. Prüfen: `processed_at` gesetzt, `processing_error` leer; fachliche Folge (Erstattung,
   Dispute-Zeile, Glocke) stimmig.
4. Bei Fehler: stoppen, Backup-Restore nur wenn Schreibschaden; sonst Fehler belassen und fixen.

**Rückweg:** Kein automatisches Undo der fachlichen Buchung. Falsch verarbeitete Erstattungen
nur über den normalen Erstattungs-/Support-Weg. Rohzeilen nicht löschen (Append-only / Trigger).

**Offen bis gebaut:** Das PROD-Replay-Skript selbst existiert noch nicht — dieses Runbook ist die
Vorgabe; Implementierung eigene Story nach dem Schema-Release.

---

## 1. Migrationsliste (auf Julius, fehlt auf main / PROD)

Detail je Story. Vollständige Reihenfolge: Abschnitt 0.1. PROD hat zuletzt `20260928213000`
(Hotfix Kursleitung-Guard, davor `20260926160500`).

| Version | Datei | Zweck |
|---|---|---|
| `20260926141500` | `a1_registration_status_cancelled.sql` | Enum/Statuswert `cancelled` für Anmeldungen |
| `20260926141501` | `a1_registrations_soft_cancel_schema.sql` | Soft-Cancel-Spalten, CHECKs, Indizes |
| `20260926144500` | `a1_registrations_soft_cancel_rpcs.sql` | Soft-Cancel in RPCs, Nachrücken, Schreibrechte |
| `20260926180000` | `a2_registrations_select_own_courses.sql` | Lehrende sehen nur Buchungen eigener Kurse |
| `20260926190000` | `a2_registrations_coverage_and_price.sql` | `coverage_status`, eingefrorener Preis |
| `20260927093608` | `a2_coverage_waived.sql` | Erlass / Rücknahme (`set_coverage_waived`, `revert_coverage_waived`) |
| `20260927121500` | `a3_payments.sql` | Tabelle `payments`, Vermerk und Rücknahme |
| `20260927143000` | `a9_course_cancel.sql` | Kurs absagen / zurücknehmen, Status-CHECKs |
| `20260927145006` | `4_3_member_removal.sql` | `remove_member`, Anonymisierung, Identitätsschutz |
| `20260927183209` | `a4_pass_products.sql` | Tabelle `pass_products`, RPCs, `courses.pass_eligible` |
| `20260927213000` | `a5_passes.sql` | Tabellen `passes` / `pass_movements`, `sell_pass` / `revoke_pass` / `get_member_passes` |
| `20260927221500` | `a6_1_pass_booking_foundation.sql` | Stornofrist, `cancellation_deadline` / `pass_id` / `coverage_intent`, Helfer Einlösen/Zurückbuchen, `remove_member`-Fix |
| `20260927233000` | `a6_2_redeem.sql` | `register_for_course(p_use_pass)`, `admin_register_user_for_course(p_coverage)`, `apply_pass_to_registration`, `undo_pass_redemption` |
| `20260927235000` | `a6_2b_tenant_delete_cycle.sql` | `registrations_pass_id_fkey` DEFERRABLE + `delete_tenant_complete` SET CONSTRAINTS — **wirkungslos** (RESTRICT wird nicht deferred); Korrektur A6-2c |
| `20260927235500` | `a6_2c_pass_fk_no_action.sql` | dieselbe FK als `ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE` |
| `20260928010000` | `a6_3_reverse_and_expire.sql` | Zurückbuchen, Nachrücken-Einlösung, `adjust_pass_units`, `expire_passes`, `pg_cron`-Job `yogaflow_expire_passes` — A6-3 UI 28.09.2026, A6 abgeschlossen |
| `20260928020000` | `a7_1_ledger.sql` | Hauptbuch: `tenant_tax_settings`, `ledger_entries`, `ledger_event_log`, `set_tax_setting`, `process_ledger`, Cron `yogaflow_process_ledger` (*/5) — A7-1 Schema/Job; UI/CSV in A7-2 |
| `20260928143000` | `a7_2_ledger_export.sql` | `export_ledger` für Owner/Admin, Zeitraum max. 366 Tage — A7-2 CSV |
| `20260928160000` | `a8_1_bulk_waive_open_list.sql` | Sammel-Erlass vor Omlify, `get_open_coverage`, `get_course_member_passes` — A8-1 Schema |
| `20260928170000` | `a5_courses_teacher_guard.sql` | RLS WITH CHECK UPDATE+INSERT: Lehrende können `teacher_id` nicht fremd setzen; Trigger `courses_teacher_guard` → `INVALID_TEACHER` |
| `20260928203500` | `s1_2a_provider_schema.sql` | Stripe 1.2a: `platform_flags` (+ `platform_flag_changes`), `provider_accounts`, `provider_capabilities`, `provider_events_raw`, `tenant_payment_settings`, RPCs `set_online_payments_enabled` / `set_allow_onsite_payment` / `get_payment_setup_status`, `service_role`: `set_platform_flag` / `upsert_provider_account`, `delete_tenant_complete` ergänzt |
| `20260928224500` | `s1_4_webhook_rpcs.sql` | Stripe 1.4: `service_role`-RPCs `record_provider_event`, `mark_provider_event_processed`, `mark_provider_event_failed` (Aliase auf `yogaflow_private`). Liegt **nach** dem PROD-Hotfix `20260928213000` — braucht kein `--include-all` |
| `20260928231500` | `s1_3a_onboarding.sql` | Stripe 1.3a: Spalten `requirements_*` / `disconnected_at`, Status `disconnected`, `upsert_provider_account` erweitert, `mark_provider_account_disconnected`, `get_owner_payment_context`, `get_payment_setup_status` ergänzt |
| `20260929140000` | `s2_1b_a_pending_payment_enum.sql` | 2.1b-a: Enum-Wert `pending_payment` (eigene TX, Nutzung erst in der Folgedatei) |
| `20260929140001` | `s2_1b_a_pending_payment_schema.sql` | 2.1b-a: Hold-Spalten, `payment_attempts`, `course_occupied_seats`, Expire-Job `yogaflow_expire_payment_holds` (`* * * * *`), P10-Helfer, Storno-Pfade |
| `20260929150000` | `s2_1b_b_promotion_e2.sql` | 2.1b-b B1: Nachrücken E2, `email_deliveries`, `claim`/`mark`, `promote_to_pending` vorbereitet in K3 |
| `20260929151000` | `s2_1b_b_k3_promote_to_pending.sql` | K3: Helfer `promote_to_pending_payment`, Glockentext mit Frist |
| `20260929160000` | `s2_1b_b2_dispatch_emails.sql` | 2.1b-b B2: `pg_net`, Cron `yogaflow_dispatch_emails` → Edge Function `dispatch-emails` |
| `20260930100000` | `s2_2a_1_online_payment.sql` | 2.2a-1: `card`→`psp_clearing`, Guard `succeeded`, `register_for_course`→`pending_payment` bei Online-Pflicht, RPCs `prepare_online_payment` / `attach_payment_ref` / `check_before_confirm` / `complete_online_payment` / `record_online_refund` / `mark_online_payment_failed` (nur `service_role`); Outbox-Arten `payment_succeeded` / `payment_refunded` |
| `20260930110000` | `s2_2a_1_k5_ledger_account.sql` | 2.2a-1 K5: Hauptbuch-Konto `psp_clearing` |
| `20260930120000` | `s2_2a_1_k6_attempt_payment_check.sql` | 2.2a-1 K6: `check_before_confirm` an Zahlversuch |
| `20261001100000` | `stripe_2_2a_4a_provider_jobs.sql` | 2.2a-4a: `provider_jobs`, Cancel-Trigger, Auto-Erstattung-Auftrag, `claim`/`finish`, Cron `yogaflow_process_provider_jobs` |
| `20261001110000` | `k7_remove_member_attempt_refs.sql` | K7: `remove_member` behält Buchungen mit `pi_…`-Versuch |
| `20261001120000` | `booking_payment_options.sql` | 2.2b: Buchungsoptionen (Online-Pflicht / vor Ort) |
| `20261002100000` | `hold_expired_notification.sql` | Glocke wenn das Zahlungsfenster abläuft |
| `20261002110000`…`14100` | `s3_2a_refunds_*.sql` | 3.2a: `payment_refunds` / `payment_disputes`, Trigger, Ledger H5', Jobs mit `refund_id` |
| `20261002202506` | `s3_2b_dispute_ref_du.sql` | 3.2b: Dispute-Refs `du_…` (API 2026-08-26.dahlia) |
| `20261002210000` | `s3_2c_refund_previews.sql` | 3.2c: Lese-RPCs Erstattungsstand und Vorschauen |
| `20261002220000` | `s3_1_payment_overview.sql` | 3.1: `get_studio_payments`, Status-Ableitung |
| `20261002223000` | `s3_1_notification_payment_path.sql` | 3.1: Glocke führt zur Zahlung |
| `20261002230000` | `claim_release_without_count.sql` | Claims zurückgeben ohne `tries`/`attempts` zu erhöhen |
| `20261004090000` | `b1_legal_profiles.sql` | B1: Anbieterangaben, `LEGAL_PROFILE_MISSING`, 250-€-Grenze |
| `20261004100000` | `b1_receipts.sql` | B1: Belege, Zähler, Trigger nach Zahlung/Erstattung |
| `20261004110000` | `b1_provider_info_tax.sql` | B1: Steuerregime in `get_studio_provider_info` |

**Release-Hinweis 3.2a/3.2b (Online-Erstattung):** Reihenfolge strikt — **Pause → Migrationen → Functions → Resume**:

1. Stripe-Dashboard „Verbundene Konten“: Ereignisse ergänzen (`charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`)
2. `node scripts/dev/provider_jobs_secret.mjs --pause` (Vault `provider_jobs_url` leer; Cron loggt nur)
3. `npm run check:migration -- 20261002110000_s3_2a_refunds_schema.sql` (und die fünf Folgedateien)
4. `npm run db:push:dev`
5. Einzeln deployen: `payments-jobs` → `payments-webhook` → `dispatch-emails`
6. `node scripts/test/s3_2a_refunds.mjs` → `npm run test:geldkette`
7. `node scripts/dev/provider_jobs_secret.mjs --resume`
8. Rauchtest: `node scripts/test/s3_2b_refund_smoke.mjs --direkt` (F1–F6; Cron nach Resume alternativ ohne `--direkt`)

**Release-Hinweis 2.2a-4b (Functions):** Code für `payments-jobs`, Webhook-Zweig `payment.updated`, Checkout-Codes, `dispatch-emails` (`payment_succeeded` / `payment_refunded`). Deploy und Rauchtests: **2.2a-4c**.

**Release-Hinweis 2.2a-4c (Deploy DEV → Muster für PROD):** Reihenfolge strikt (D1) — erst Functions, **Vault zuletzt** (erst der Vault-Eintrag schaltet den Cron scharf):

1. `PROVIDER_JOBS_SECRET` setzen (Edge-Secret via `secrets:dev` / `secrets:prod`; eigener Zufallswert je Umgebung, nie DEV→PROD kopieren)
2. Deploy einzeln: `dispatch-emails` → `payments-checkout` → `payments-webhook` → `payments-jobs`
3. Vault `provider_jobs_url` / `provider_jobs_secret` (DEV: `scripts/dev/provider_jobs_secret.mjs`; PROD-Analog mit PROD-Werten)
4. **Prüfpunkt:** Cron `yogaflow_process_provider_jobs` ruft `payments-jobs` erfolgreich auf (Logs / `provider_jobs` → `done`)
5. Stripe-Webhook „Verbundene Konten“: `payment_intent.succeeded`, `.payment_failed`, `.canceled` müssen am Ziel hängen
6. Rauchtests: `s2_2a_4c_webhook_smoke.mjs`, `s2_2a_4c_webhook_smoke.mjs --direkt`, `s2_2a_3_checkout_smoke.mjs`, danach `npm run test:geldkette`

**Release-Hinweis 2.2a-1:** Keine Edge Function / kein Stripe-Aufruf in dieser Migration. `dispatch-emails` kennt die neuen `kind`-Werte noch nicht (S6d-Anpassung in 2.2a-4). CSV-Export-Bezeichnung `psp_clearing` = „Verrechnung Stripe“ liegt im Frontend (`ledgerExport.ts`).

**Release-Hinweis 2.2a-3:** Edge Function `payments-checkout` deployen (`verify_jwt = false`). Danach `payments-onboarding` erneut deployen (Domain-Registrierung beim `refresh`). Für jedes Studio mit aktivem Stripe-Konto die Payment-Method-Domain registrieren (`{slug}.{APP_BASE_DOMAIN}`; DEV-Skript `scripts/dev/register_payment_domain.mjs`). `APP_BASE_DOMAIN` muss als Function-Secret gesetzt sein (`omlify-dev.de` / `omlify.de`).

**Release-Hinweis 2.1b-a:** Zwei Migrationen in dieser Reihenfolge. Neuer Cron-Job `yogaflow_expire_payment_holds` jede Minute — Extension `pg_cron` nicht neu anlegen (bereits A6-3). Client-Typen für `pending_payment` gehören in denselben Release; UI-Zweige folgen in 2.1b-b. `succeeded` und Hauptbuch-`card` bleiben 2.2a.

**Release-Hinweis 2.1b-b B2 (Versand):** Auf PROD zusätzlich zu den Migrationen: Extension `pg_net` aktivieren (liegt in `20260929160000`), Vault-Einträge `email_dispatch_url` und `email_dispatch_secret` setzen (PROD-eigene Werte, Skript-Analog zu DEV), `EMAIL_DISPATCH_SECRET` in `supabase/.env.prod` und `npm run secrets:prod`, Edge Function `dispatch-emails` deployen. Fehlt der Vault-Eintrag, ruft der Job nichts auf. Absender bleibt global „Omlify“ (S6h).

**Release-Hinweis 2.1b-b (Oberfläche + Versand):** Entscheidungen in Nachtrag §9. Cloudflare-Build-Variable `VITE_STRIPE_PUBLISHABLE_KEY`: auf **DEV** nur `pk_test_…`; auf **PROD vorerst nicht setzen** (erst beim Einschalten mit `pk_live_…`). Bezahlen-Knopf erst 2.2b.
**Release-Hinweis 1.3a:** Edge Function `payments-onboarding` (`verify_jwt = false`, Auth über `initService`) kommt mit den Functions. Onboarding und Live-Schalter bleiben aus, bis Rechtstexte und Steuerprüfung stehen (O2). Webhook-Ereignis `account.application.deauthorized` am Live-Endpunkt ergänzen (zusammen mit 1.4).

**Release-Hinweis 1.4:** Edge Function `payments-webhook` (`verify_jwt = false`) kommt mit den Functions. Der **Live-Endpunkt** im Stripe-Dashboard (Live-Modus, „Connected accounts“, URL `https://<PROD_REF>.supabase.co/functions/v1/payments-webhook`) und das **Live-Secret** `STRIPE_WEBHOOK_SECRET` in `supabase/.env.prod` entstehen **erst beim Einschalten**, nicht am Release-Abend. Bis dahin antwortet die Function auf PROD mit 500 `CONFIG_ERROR`; ohne Endpunkt ruft sie niemand auf.

**Release-Hinweis 1.2a:** **`online_payments` bleibt beim Release `false`.** Die Migration legt die Zeile mit `false` an. Beim Release niemand `set_platform_flag` aufrufen. Nach dem Push prüfen: `SELECT key, enabled FROM platform_flags` → genau `online_payments | false`; `tenant_payment_settings` leer. Einschalten erst nach 1.3/1.4 und dann je Studio mit einer kleinen echten Zahlung (Regel oben).

**Release-Hinweis A5 Lehrer-Guard:** **Lücke `teacher_id` auf PROD seit 28.09.2026 durch Hotfix geschlossen.** Migration `20260928213000_security_courses_teacher_guard_hotfix.sql` (Merge `3bcd961`, PR #174): Trigger `courses_teacher_guard_hotfix` → `INVALID_TEACHER`; owner/admin nur Staff des eigenen Studios, teacher nur sich selbst, unveränderte `teacher_id` frei. Policies auf PROD unverändert. Die Datei liegt **zeitlich nach allen Sprint-A-Migrationen** und ist auf PROD schon angewendet — der Release-Push braucht deshalb `--include-all` für alle Sprint-A-Versionen, nicht nur für A1. `20260928170000` kommt beim Release dazu; beide Trigger bestehen nebeneinander. **Generalprobe prüft:** `courses_teacher_guard` und `courses_teacher_guard_hotfix` danach beide aktiv (`pg_trigger.tgenabled = 'O'`).

**Release-Hinweis A8-1:** Nach dem Schema-Push und dem Frontend-Deploy: **„Nach dem Release mit der Testkundin die Sammelaktion ausführen.“** Erwartete Vorschau im Hauptstudio `892370b8`: etwa **169** aktive offene Buchungen in vergangenen Kursen (Stand Inventur 28.09.2026, vor A2-PROD; nach A2 alle preispflichtigen Buchungen `open`). Das Stichtagsdatum stimmt Julius mit ihr ab. Die zwei kleinen Studios (`1ffd7778`, `5110be00`) prüft Julius separat.

**Release-Hinweis A6 / A6-3:** PROD braucht die Erweiterung `pg_cron` (Migration legt sie an: `CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog` plus Rechte). Vor dem PROD-Push prüfen: Extension aktiv, Job `yogaflow_expire_passes` existiert (`cron.job`, Schedule `5 * * * *`), Funktion `yogaflow_private.expire_passes` nur für `postgres`/`service_role`. Auf DEV ebenfalls. A6-1/A6-2 brauchen `pg_cron` noch nicht.

**Release-Hinweis A7-1:** Zusätzlich Job `yogaflow_process_ledger` (`*/5 * * * *`), Funktionen `process_ledger` / `ledger_unbalanced_events` nur `postgres`/`service_role`. **PROD-Punkt:** Owner jedes PROD-Studios müssen nach dem Release ihren Steuerstatus angeben (`set_tax_setting`), sonst wartet das Hauptbuch auf alle Zahlungen (H1).

### `--include-all`

Die drei A1-Migrationen (`20260926141500`, `20260926141501`, `20260926144500`) liegen **zeitlich vor** der bereits auf PROD angewendeten `20260926160500`. Ohne `--include-all` wendet `db push` sie nicht an.

Seit 28.09.2026 liegt auf PROD zusätzlich der Hotfix `20260928213000`. Damit liegen **alle** Sprint-A-Migrationen (bis `20260928203500`) zeitlich vor der neuesten PROD-Version und brauchen `--include-all`.

`scripts/db.mjs` reicht `--include-all` für `push` durch (PROD: zweite getippte Bestätigung `INCLUDE-ALL` und Vorab-Liste der außer-Reihe-Migrationen; DEV ohne zweite Bestätigung).

---

## 2. Reihenfolge Frontend vor Migration

Regel aus `docs/SCHEMA_RELEASE_WORKFLOW.md` / Nachtrag: zusätzlicher FK → PostgREST-Embeds ohne Hint werden mehrdeutig (**PGRST201**).

| Schritt | Was live sein muss | Warum |
|---|---|---|
| 1 | Frontend mit FK-Hints `users!registrations_user_id_fkey` (Commit `44b309d` und Folgende) | A1 legt `registrations.cancelled_by` → `users` an. Hints auf den **bestehenden** FK funktionieren mit altem und neuem Schema. |
| 2 | A1-Migrationen auf PROD (`41500`, `41501`, `44500`) mit `--include-all` | Soft-Cancel-Schema und RPCs |
| 3 | Frontend, das Soft-Cancel / Absage / Kasse / Entfernen spricht (Julius-Stand A1–A3, A9, 4.3) | Neue Spalten im Select (`coverage_status`, `price_cents_at_booking`, Absagefelder), neue RPC-Namen (`cancel_course`, `record_manual_payment`, `remove_member` / `delete-user`) |
| 4 | A2 → A3 → A9 → 4.3 → A4 → A5 Migrationen | Reihenfolge der Dateinamen; A2 braucht A1-Status, A3 braucht Deckung, A9 Status-CHECKs, 4.3 hängt an Zahlungen/Buchungen, A4 hängt an `delete_tenant_complete` aus A3, A5 an A4-Produkte und A3-Zahlungen |

### Frontend-Stände, die mit dem **alten** PROD-Schema nicht funktionieren

- Client, der `coverage_status` / `price_cents_at_booking` liest oder Kassier-RPCs aufruft → Spalten/Funktionen fehlen auf PROD.
- Client, der `cancel_course` / `uncancel_course` aufruft → Funktionen fehlen.
- Client, der `delete-user` über `remove_member` erwartet → RPC/Verhalten fehlt.
- Client **ohne** FK-Hints nach A1-Migration → **PGRST201** bei Embeds auf `registrations`→`users`.
- Client, der `pass_products`-RPCs oder `pass_eligible` erwartet → fehlen vor A4.

Umgekehrt: FK-Hints allein auf altem Schema sind unkritisch (Schritt 1 vor Schritt 2).

---

## 3. PROD-Zählwerte (nur lesen, Read-only-MCP)

Erhoben über `user-supabase-prod-readonly` / `execute_sql`. Keine Namen, keine E-Mails.

| Prüfung | Ergebnis |
|---|---|
| Kurse je `status` | `active`: **48** (keine anderen Statuswerte) |
| Anmeldungen mit `cancellation_timestamp` (Legacy vor A1) | **8** |
| Anzahl Buchungen (`registrations`) | **317** (entspricht Erwartung nach A2) |
| Summe aktueller Kurspreis × 100 Cent über alle Buchungen | **507800** Cent (entspricht Erwartung nach A2) |
| Logins mit mehreren Profilen (`auth_user_id` mit count > 1) | **1** |
| Kursbeschreibungen gegen **neue** CHECKs aus Sprint A | Sprint A führt **keinen** neuen Description-CHECK ein. Bestehend: `courses_description_length_check` (10–2000) bereits auf PROD. A9 prüft nur `courses.status` ∈ {active, canceled, not_planned} — auf PROD alle 48 `active`, Vorprüfung ok. |

Abweichungen zur A2-Erwartung (317 / 507800): **keine**.

---

## 4. Risiken

- **Lücke `teacher_id` auf PROD:** am 28.09.2026 durch Hotfix
  `20260928213000` (Trigger `courses_teacher_guard_hotfix`) geschlossen.
  `20260928170000` folgt beim Release; die Generalprobe prüft, dass beide
  Trigger danach aktiv sind.
- **`--include-all` auf PROD:** Drei ältere A1-Versionen werden nachträglich eingefügt; falsche Reihenfolge oder doppelte Anwendung vermeiden — nur über `scripts/db.mjs push prod --include-all` mit beiden Bestätigungen.
- **PGRST201:** Frontend-Hints müssen vor A1-Schema auf PROD live sein.
- **Expand/Contract:** Altes Frontend nach Schema-Push bricht an neuen Spalten/RPCs; neues Frontend vor Schema bricht an fehlenden Spalten/RPCs — Deploy-Fenster kurz halten bzw. Reihenfolge oben einhalten.
- **8 Legacy-Zeilen** mit `cancellation_timestamp`: A1-Schema-Migration muss sie konsistent in Soft-Cancel überführen (Selbstprüfung in der Migration).
- **1 Login mit mehreren Profilen:** Mehrfachmitgliedschaft auf PROD bereits real; 4.3 / `remove_member` und Login-Löschlogik betreffen solche Konten.
- **Edge Function `delete-user`:** Code-Deploy (Functions) ist getrennt vom Schema; Reihenfolge Functions vs. Migration für 4.3 klären (nicht Gegenstand dieser Bestandsaufnahme).

---

## 5. Offene Punkte

- Ob Functions-Deploy (`delete-user`) vor, mit oder nach `20260927145006` auf PROD läuft.
- Ob der eine Mehrfachmitgliedschafts-Login vor 4.3 manuell geprüft werden soll (nur Zählwert hier).
- Ob nach A1 auf PROD die 8 Legacy-Zeilen in einem Nachcheck (nur Zählwerte) verifiziert werden.
- Zeitpunkt des Releases entscheidet Julius mit Claude — hier nicht empfohlen.

---

## 6. `scripts/db.mjs` (Vorschlag, Syntax geprüft)

- Flag `--include-all` nur bei `push`.
- Listet Migrationen, die außer der Reihe wären (lokale Version &lt; max Remote, nicht remote).
- **PROD:** zusätzlich getippte Bestätigung `INCLUDE-ALL`, danach unverändert `PROD`.
- **DEV:** Liste anzeigen, keine zweite Bestätigung.
- Bestehende PROD-Sicherheitsabfrage bleibt; kein `--yes` ohne Bestätigungspfad.
- Geprüft mit: `node --check scripts/db.mjs` (kein Aufruf von push/status).
