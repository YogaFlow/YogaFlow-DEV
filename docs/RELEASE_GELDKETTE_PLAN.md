# Release-Plan Geldkette

Bestandsaufnahme und Release-Regeln für den PROD-Release der Geldkette (Sprint A und Folgestories). Keine Empfehlung zum Zeitpunkt — der Zeitpunkt folgt Teil „Release-Entscheidung“.

---

## Release-Entscheidung und Regeln (27.09.2026)

- Das **komplette Geldkette-Epic** geht gemeinsam auf PROD, erst nach vollständigem Test auf DEV.
- **`main` wird nach jedem Hotfix in Julius gemergt**, mindestens aber vor jeder neuen Story.
- **Pflicht-Generalprobe** auf einer Kopie der PROD-Datenbank mit `npm run test:geldkette`.
- **Stripe** bekommt einen Schalter je Studio. Das Update geht mit Stripe aus live; Einschalten danach je Studio, zuerst mit einer kleinen echten Zahlung.
- **Release-Abend in Etappen** mit Prüfpunkten: Hint-Frontend → Migrationen in Blöcken mit Zählwerten → Functions (`delete-user` nach 4.3) → neues Frontend.
- **Testlauf der doppelten Bestätigung** in `db.mjs`: `INCLUDE-ALL` richtig tippen; bei PROD absichtlich falsch → Abbruch ohne Änderung.
- Die **Migrationsliste** wird ab jetzt je Story fortgeschrieben (A4 eingetragen).

---

## 1. Migrationsliste (auf Julius, fehlt auf main / PROD)

PROD hat zuletzt `20260926160500` (`security_handle_new_user_role_from_trusted_source`). Auf `main` liegt von den Sprint-A-Migrationen nur diese Hotfix-Datei; A1–A4, A9 und 4.3 fehlen dort ebenfalls.

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

**Release-Hinweis A6:** Ab A6-3 braucht PROD die Erweiterung `pg_cron` (täglicher Verfall Europe/Berlin). Vor dem PROD-Push aktivieren; auf DEV ebenfalls. A6-1/A6-2 brauchen `pg_cron` noch nicht.

### `--include-all`

Die drei A1-Migrationen (`20260926141500`, `20260926141501`, `20260926144500`) liegen **zeitlich vor** der bereits auf PROD angewendeten `20260926160500`. Ohne `--include-all` wendet `db push` sie nicht an.

Die übrigen liegen nach `20260926160500` und brauchen das Flag nicht.

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
