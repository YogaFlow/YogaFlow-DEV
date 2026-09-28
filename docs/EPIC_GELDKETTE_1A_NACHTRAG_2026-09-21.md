# Nachtrag zu EPIC_GELDKETTE_1A — Offline-Geldkette, 5er-/10er-Karten, Deckungsstatus

**Stand:** 21.09.2026 · **Status:** entschieden mit Julius (Reihenfolge, Karten in 1a, kein Steuerberater vorerst).
Offene Punkte sind als **E13–E17** markiert.
**Bezug:** `docs/EPIC_GELDKETTE_1A.md` (14.09.). Dieser Nachtrag **geht bei Widerspruch vor**. Story-Nummern
des Epics bleiben unverändert, damit bestehende Verweise (z. B. „Geldkette 0.2“) gültig bleiben.

---

## 1. Was sich ändert — Kurzfassung

| # | Änderung | Grund |
|---|---|---|
| N1 | **Neue Reihenfolge:** Sprint 0 → 1.1 (Stammdaten, Rechts-Epic) → **Sprint A (neu, ohne Stripe)** → 1.2–1.4 → Sprint 2 → 3.1/3.2 → 4.2 → Sprint 5 | Die aktive Testkundin arbeitet mit Bar und PayPal. Sprint A ist ohne Stripe-Verifizierung, E11, E12 und Checkout-Rechtstexte nutzbar. |
| N2 | **5er-/10er-Karten sind in 1a**, nicht mehr 1b. Verkauf zunächst **nur vor Ort** (vom Studio erfasst), online erst mit Stripe (neue Story 2.4) | Wirtschaftlich stärker als Einzelzahlung, siehe Abschnitt 2. Vor-Ort-Verkauf ist kein Fernabsatz. |
| N3 | **Dritte Dimension „Deckung“** neben Buchung und Zahlung | Eine Karteneinlösung ist keine Zahlung. Barzahler haben einen sicheren Platz ohne Zahlung. |
| N4 | **Story 2.1 wird geteilt:** 2.1a (Soft-Cancel, Einmal-Regel, Nachrücken) wandert als **A1** in Sprint A. 2.1b (`pending_payment`, Reservierung, Zahlungsautomat online) bleibt in Sprint 2 | Eine bar bezahlte Buchung darf genauso wenig per DELETE verschwinden wie eine online bezahlte. |
| N5 | **Story 3.3 wandert als A3 nach Sprint A und wird enger:** Bar ist ein **Zahlungsvermerk ohne Beleg aus Omlify** (E14) | Kassensicherungsverordnung, siehe Abschnitt 3 |
| N6 | **Story 4.1 (Hauptbuch) wandert als A7 nach Sprint A** | Kartenverkauf und Vermerke brauchen Buchungszeilen |
| N7 | **Abschnitt 2, Punkt 5 des Epics ist überholt.** Karten sind das erste nicht terminierte Produkt. `pass_products` bekommt `is_scheduled = false` | — |
| N8 | **Kurs absagen** (ohne Online-Erstattung) wird als **A9** vorgezogen | Nach A1 lassen sich Kurse mit Anmeldungen nicht mehr löschen. Ohne Absage-Funktion wären sie nicht mehr loszuwerden. |
| N9 | **Steuerberater:** Es gibt vorerst keinen. Regel: Wo die Rechtslage offen ist, wird die **vorsichtigere Variante** gebaut. Prüfung durch einen Steuerberater erst als PROD-Gate (Abschnitt 6), z. B. durch den Berater des ersten zahlenden Studios | Kein Budget. Keine Story darf auf eine Beraterantwort warten. |

---

## 2. Warum Karten in 1a gehören (Rechenweg)

Stripe-Standardkarte EWR: Gebühr = 1,5 % × Betrag + 0,25 € (Listenpreis, beim Bauen erneut prüfen).

| Fall | Rechnung | Gebühr |
|---|---|---|
| 10 Drop-ins à 15 € online | je 1,5 % × 15 € = 0,225 € + 0,25 € = 0,475 € · × 10 | **4,75 €** auf 150 € |
| eine 10er-Karte à 150 € online | 1,5 % × 150 € = 2,25 € + 0,25 € | **2,50 €** auf 150 € |
| kostenlose Stornierung eines online bezahlten Drop-ins | Stripe erstattet die Gebühr nicht | **0,475 €** Verlust je Storno |
| kostenlose Stornierung mit Karte | Einheit zurück, kein Geldfluss | **0 €** |

Dazu: Die Karte wird **einmal** bezahlt (bar, PayPal, Überweisung, später online). Danach ist jede Buchung
zahlungsneutral. Die Lehrerin kassiert alle zehn Wochen statt jede Woche.

---

## 3. Die Kassenfrage (neu, blockiert A3 nicht mehr)

Die Kassensicherungsverordnung (§ 146a AO) erfasst elektronische Aufzeichnungssysteme mit **Kassenfunktion**,
also Systeme, die der Erfassung barer Zahlungsvorgänge dienen können. Folgen wären TSE-Pflicht,
Belegausgabepflicht und Meldung ans Finanzamt. Das steht im Briefing unter „Nicht bauen“.

Ob ein reiner **Zahlungsvermerk** („bezahlt: ja, bar, 15 €“ an einer Buchung) schon Kassenfunktion ist, ist
ungeklärt. Omlify würde damit aber **keine** Barbelege ausgeben, keine Kassenbestände führen und kein Kassenbuch
ersetzen.

**Entscheidung E14 (vorsichtige Variante):** Bar wird in Omlify ausschließlich als Vermerk an der Buchung bzw.
am Kartenverkauf geführt. **Kein Beleg aus Omlify für Barzahlungen**, keine Kassenbestandsanzeige, kein
Kassenbuch-Export. Das Studio führt seine Kasse bzw. sein Kassenbuch selbst. Die Oberfläche sagt das einmal
sichtbar. Das schwächt **B3** ab („mit Beleg“) und ist bewusst so entschieden.
**Zu klären vor PROD:** IHK-Gründungsberatung oder Steuerberater des ersten Studios. Lautet die Antwort „Vermerk
ist unkritisch“, kann der Barbeleg in einer späteren Story ergänzt werden. Rückbau ist nicht nötig.

PayPal (privat oder geschäftlich, manuell) und Überweisung sind nicht betroffen. Für sie darf später ein Beleg
entstehen (4.2).

---

## 4. Das Modell: Buchung — Deckung — Zahlung

| Dimension | Frage | Wo | Zustände |
|---|---|---|---|
| **Buchung** | Hat die Person einen Platz? | `registrations.status` | `registered`, `waitlist`, `cancelled` (A1) · später `pending_payment` (2.1b) |
| **Deckung** | Womit ist der Platz beglichen? | `registrations.coverage_status` | `not_required` (Kurs kostenlos) · `open` · `paid` · `pass` · `waived` |
| **Zahlung** | Ist Geld geflossen? | `payments` | `initiated → processing → succeeded / failed / canceled` · danach `refunded_partial`, `refunded`, `disputed` |

**Regeln:**
- Die Deckung ändert sich **nur über RPCs**, nie per direktem UPDATE aus dem Client.
- `paid` ⇔ es gibt eine nicht stornierte Zahlung mit `registration_id` = diese Buchung.
  `pass` ⇔ es gibt eine nicht zurückgebuchte Einlösung. Eine SQL-Selbstprüfung testet beides.
- **Preis wird bei der Buchung eingefroren:** `registrations.price_cents_at_booking`. Ändert die Lehrerin später
  den Kurspreis, bleiben bestehende Buchungen unberührt (L9). Die Kursbearbeitung zeigt dann einen Hinweis.
- `waived` („erlassen“) nur durch `owner`/`admin`, mit Pflichtgrund. Erzeugt keine Buchungszeile.
- Kostenlose Kurse laufen weiter wie heute, nur mit `coverage_status = not_required`.

---

## 5. Sprint A — Geldkette ohne Stripe

Voraussetzung: Sprint 0 abgeschlossen (0.2, 0.3). 1.1 Stammdaten aus dem Rechts-Epic ist für Sprint A **nicht**
Voraussetzung, weil Sprint A keine Belege erzeugt.
Jede Story endet mit **STOPP**. Migrationen nur über `scripts/db.mjs`, jede mit Zweck, Rückweg und `DO $$`-
Selbstprüfung. Jede neue Funktion: `REVOKE ALL … FROM PUBLIC, anon, authenticated`, dann nur nötige `GRANT`s.

**Ehrliche Größenordnung:** Sprint A hat neun Stories und fünf Schema-Eingriffe. Das ist kein Nebenbei-Sprint.
Nach A1–A3 ist der erste nutzbare Stand erreicht (Bar/PayPal sauber erfasst). A4–A6 bringen die Karten.

### A1 — Buchungen verschwinden nicht mehr (ehemals 2.1a)
*Als Studio möchte ich, dass Abmeldungen als Stornierung erhalten bleiben, damit Zahlungen, Karteneinlösungen
und die Kurshistorie nie ins Leere zeigen.*

- Enum `registrations.status` um `cancelled` erweitern. Neue Spalten `cancelled_at`, `cancelled_by`,
  `cancel_reason` (`participant`, `studio`, `course_cancelled`, `promotion_expired`, `role_change`)
- **Immer Soft-Cancel**, auch bei kostenlosen Kursen. Kein DELETE mehr in `unregister_from_course`,
  `admin_unregister_user_from_course` und `cleanup_future_registrations_on_role_upgrade`
- `UNIQUE(course_id, user_id)` ersetzen durch partiellen Unique-Index **nur für aktive Zeilen**
  (`status IN ('registered','waitlist')`) (Befund A)
- Nachrücken neu bauen: ausgelöst durch den Übergang nach `cancelled`, nicht mehr durch `AFTER DELETE` (Befund B)
- **Alle Lesestellen prüfen:** jede Zählung von Plätzen, jede Teilnehmerliste, „Meine Anmeldungen“,
  Dashboard-Zahlen. Wer `registrations` zählt, ohne nach Status zu filtern, zählt ab jetzt Stornierte mit.
  Inventur mit `grep` in `src/` und `supabase/migrations/` (neueste Definition je Funktion), Liste im Bericht
- Kursserie: Stornierte Zeilen bleiben für die spätere Kursakte („Du warst schon 4× dabei“) auswertbar
- **Nachrücken → Glocke — erledigt in Release 2026-09c.** `promote_from_waitlist`
  (`20260922154530`) schreibt `user_notifications` mit `type = waitlist_promoted`,
  keine Chat-Nachricht. A1 übernimmt diese Fassung und baut das Nachrücken auf
  Soft-Cancel um (Trigger nicht mehr `AFTER DELETE`).
  Befund 0.2: Die Chat-Nachricht war seit `20260426120000` (Policy `messages_select_own_tenant`
  verlangt `tenant_id`; der Insert in `promote_from_waitlist` setzte sie nie, Spalte seit
  `20260426110000` nullable) wegen `tenant_id` NULL für niemanden sichtbar, behoben in `1b414fd`.
  Alte NULL-Zeilen in `messages` in A1 bereinigen.
  Einzige tenant-eigene Tabelle mit nullable `tenant_id`: `messages` (DEV: 1 Altzeile,
  `4c4e6fd5-…`). A1 setzt dort `NOT NULL` und entfernt NULL-Zeilen.

**Akzeptanz:** Abmelden → Zeile bleibt mit `cancelled`, Platz ist frei, Nachrücken passiert (kostenloser Kurs,
Nachweis per SQL). Erneut anmelden nach Stornierung funktioniert. Platzzählung ignoriert Stornierte (SQL-Test
mit gesetzten Daten). Keine Stelle in `src/` zählt ungefiltert (Inventurliste).
**Schema → Freigabe. STOPP.**

#### Umsetzung 26.09.

**Entscheidungen D1–D6 und D1a**

| ID | Entscheidung | Begründung |
|---|---|---|
| D1 | Enum-Wert `cancelled` auf `registration_status` | Soft-Cancel braucht einen Status, der Platzzählung und Unique von aktiven Zeilen trennt. |
| D1a | Altzeilen mit `cancellation_timestamp` vor Kursbeginn → `cancelled` / `legacy_closed` | Teilnahme vor Kursstart ist nicht belegbar; Soft-Cancel-Historie ohne Fake-„war da“. |
| D2 | `is_waitlist` bleibt beim Soft-Cancel unverändert | Historie: war die Person auf der Warteliste oder fest angemeldet. |
| D3 | Partielle Uniques nur für aktive Zeilen (`cancellation_timestamp IS NULL`) | Erneute Anmeldung nach Storno braucht eine neue Zeile; alte cancelled bleiben. |
| D4 | CHECK `registrations_cancelled_consistent` | `cancelled` ⇔ `cancellation_timestamp` gesetzt; `cancel_reason` nur mit Storno. |
| D5 | SELECT-Policy unverändert; Schreiben nur noch über SECURITY DEFINER-RPCs | Client darf Stornierte lesen (Historie), aber nicht mehr direkt schreiben. |
| D6 | Spalten `cancelled_by`, `cancel_reason`; Zeitstempel bleibt `cancellation_timestamp` | Bestehende Client-Filter nutzen schon `cancellation_timestamp`; kein Rename-Risiko. |

**Migrationen und Commits:** `20260926141500`, `20260926141501`, `20260926144500` · Commits `c6f4e10`, `96f5ff7`, `44b309d`.

**Abweichungen vom Plan**

- **N8 / course_id:** `registrations.course_id` war schon `RESTRICT` (`20260921233800`) — A1 musste das nicht nachziehen.
- **`messages.tenant_id`:** DEV hatte 0 NULL-Zeilen; `NOT NULL` verschoben. Payload-Helper `buildThreadSendPayload` setzt die Spalte nicht zuverlässig (UI überschreibt). Aufräumen später.
- **`cancellation_timestamp` statt `cancelled_at`:** bestehende Filter und Trigger nutzen den alten Namen.
- **Altzeilen → `legacy_closed`:** Zeitstempel vor Kursbeginn, Teilnahme nicht belegbar (D1a).
- **`cleanup_future_registrations_on_role_upgrade`:** storniert nur Kurse mit `date >= CURRENT_DATE` (wie `prevent_past` / `check_registration_course_not_past`); Vergangenes bleibt Historie.
- **`unregister_from_course`:** Sperre für vergangene Kurse (`date < CURRENT_DATE`), Meldung wie Admin-Abmeldung.
- **PGRST201:** zweiter FK `cancelled_by` → `users` machte Embeds mehrdeutig; Fix `users!registrations_user_id_fkey` (`44b309d`).

**Akzeptanz A1 — Belege (26.09., DEV, `scripts/test/a1_soft_cancel.mjs`)**

| Kriterium | Beleg |
|---|---|
| Abmelden → Zeile `cancelled`, Platz frei, Nachrücken | Fall 1: A `cancelled`/`participant`, B `registered`, `waitlist_promoted` für B |
| Erneut anmelden nach Stornierung | Fall 2: A hat `cancelled` + neue `waitlist`-Zeile |
| Platzzählung ignoriert Stornierte | Fall 5: `registered_count` = aktive `registered` |
| Keine ungefilterte Zählung in `src/` | Inventur unten; Filter `cancellation_timestamp` und/oder `status` — gleichwertig per CHECK |

**Inventur `src/` (Lesestellen `registrations`, Filter)**

| Stelle | Filter |
|---|---|
| `useCourseEnrollment.ts:59` | `.is('cancellation_timestamp', null)` |
| `Courses.tsx:132` | `.is('cancellation_timestamp', null)` |
| `Dashboard.tsx:105–106` | `.in('status', ['registered','waitlist'])` + `.is('cancellation_timestamp', null)` |
| `Dashboard.tsx:214–215` | `.eq('status', 'registered')` + `.is('cancellation_timestamp', null)` |
| `Users.tsx:353` | `.is('cancellation_timestamp', null)` |
| `Participants.tsx:94` | TS: `cancellation_timestamp == null` |
| `MyRegistrations.tsx:43–44` | status IN + `cancellation_timestamp` null |
| `useMessagesData.ts:81,108,180` | `.is('cancellation_timestamp', null)` |
| `useUnreadMessages.ts:185` | `.is('cancellation_timestamp', null)` |
| `MyCourses.tsx:139,142` | TS: `!cancellation_timestamp` (+ Status/`is_waitlist`) |

RPC-Zählung: `get_course_participant_counts` (nur aktive Status). CHECK `registrations_cancelled_consistent` macht Status- und Timestamp-Filter gleichwertig.

### PROD-Gate für Sprint A

Reihenfolge und Bedingungen, bevor Sprint-A-Schema auf PROD darf:

1. **Frontend zuerst:** Commit `44b309d` (FK-Hints) muss auf `main`/Live sein, **bevor** die A1-Migrationen auf PROD laufen. Hints auf `registrations_user_id_fkey` funktionieren mit altem und neuem Schema.
2. **Dann Migrationen** in Reihenfolge: `20260926141500` → `20260926141501` → `20260926144500`.
   Diese drei liegen zeitlich **vor** dem PROD-Hotfix `20260926160500` (Release 2026-09e, seit 26.09.2026 auf PROD). `db push` sieht sie deshalb als Einfügung vor der letzten Remote-Version und wendet sie nur mit `--include-all` an. `scripts/db.mjs` reicht das Flag heute nicht durch. Erst beim Sprint-A-Release bewusst ergänzen, nicht vorher.
3. **Altzeilen auf PROD:** Inventur vor A1: 8 Zeilen mit `cancellation_timestamp` vor Kursbeginn (5 `registered`, 3 `waitlist`). Nach Datei 2 → alle `cancelled` / `legacy_closed`. Erwartung per `GROUP BY status, cancel_reason` prüfen.
4. **A1 geht nicht allein auf PROD.** Frühestens zusammen mit **A9** (Kurs absagen): Kurse mit Stornierungen lassen sich sonst weder löschen (`RESTRICT`) noch absagen.
5. **A2 Bestand (`20260926190000`).** Inventur PROD 27.09.2026, nur lesend: 317 Buchungen, jede mit `courses.price > 0`, keine ohne Kurs, kein Preis 0. Die Migration setzt alle auf `coverage_status = open` und `price_cents_at_booking = round(courses.price * 100)`. Erwartungswert danach: `count(*) = 317` und `sum(price_cents_at_booking) = 507800` (5.078,00 €), keine Zeile `not_required`. Die A2-Migrationen `20260926180000`, `20260926190000` und `20260927093608` liegen zeitlich nach dem PROD-Hotfix `20260926160500` und brauchen deshalb kein `--include-all` (anders als die drei A1-Dateien in Punkt 2).

### A2 — Deckungsstatus
*Als Lehrerin möchte ich bei jeder Buchung sehen, ob sie beglichen ist und womit.*

- Spalten `coverage_status` (Enum aus Abschnitt 4), `price_cents_at_booking integer`, `currency` (`EUR`)
- Beim Anmelden (beide Register-RPCs): Preis aus `courses.price` in Cent einfrieren. `price = 0` →
  `not_required`, sonst `open`
- **Bestand migrieren:** alle aktiven Buchungen in kostenpflichtigen Kursen → `open`, kostenlose →
  `not_required`. Vergangene Kurse ebenfalls `open`: Die Wahrheit kennt nur das Studio, das System erfindet keine
  Zahlung. Die UI (A8) erlaubt, Vergangenes gesammelt als „erledigt vor Omlify“ zu markieren (`waived` mit Grund
  `pre_omlify`)
- RPC `set_coverage_waived(registration_id, reason)` nur für `owner`/`admin`
- Sichtbarkeit nach E5 und E15

**Akzeptanz:** Neue Buchung in 15-€-Kurs → `open`, `price_cents_at_booking = 1500`. Preisänderung am Kurs ändert
bestehende Buchung nicht. `teacher` kann `waived` nicht setzen (Fehler). **Schema → Freigabe. STOPP.**

#### Umsetzung 27.09.

Preis und Deckung setzt der Trigger `registrations_freeze_price_on_insert`, nicht die Register-RPCs.

**Entscheidungen A2-1 bis A2-5 und W1–W4**

| ID | Entscheidung |
|---|---|
| A2-1 | `registrations_select` enger: Lehrende sehen nur Buchungen eigener Kurse, plus eigene Buchungen als Teilnehmerin. owner/admin sehen alles im Studio. Keine Spalten-Grants (`select *` in `Participants.tsx`). |
| A2-2 | Preis einfrieren beim INSERT, auch auf der Warteliste. `promote_from_waitlist` bleibt unverändert. |
| A2-3 | Stornierte im Bestand wie aktive: Preis aus dem Kurs, Deckung `open` bzw. `not_required`. „Offene Beträge“ filtert immer auf aktive Buchungen. |
| A2-4 | `price IS NULL` entfällt, `price_cents_at_booking` ist `NOT NULL`. |
| A2-5 | `set_coverage_waived` nur über `is_tenant_manager()`. Lehrende bekommen einen Fehler. |
| W1 | Grund ist ein Code plus Notiz: `pre_omlify`, `goodwill`, `other`. Bei `other` ist die Notiz Pflicht (mindestens 3 Zeichen). |
| W2 | Rücknahme über `revert_coverage_waived(uuid)`, nur owner/admin, mit Audit, ohne Notiz. |
| W3 | Nur `coverage_status = open`. Der Buchungsstatus spielt keine Rolle. |
| W4 | Keine Sammelaktion. Die kommt mit A8. |

**Migrationen und Commits:** `20260926180000` (`46192c6`), `20260926190000` (`4184ba1`), `20260927093608` (Erlass, dieser Commit).

**Notiz.** Der Text bleibt auf `registrations.coverage_waived_note`. Grund ist Art. 17: Freitext gehört nicht in das append-only `audit_log`. Das Event-Payload enthält ihn nicht. `changed_fields` nennt die Spalte. Die Rücknahme hat keine Notiz.

**Akzeptanz A2 — Belege**

| Kriterium | Beleg |
|---|---|
| Neue Buchung 15 € → `open`, 1500 | `scripts/test/a2_coverage.mjs` Fall 1 |
| Preisänderung ändert die bestehende Buchung nicht | `scripts/test/a2_coverage.mjs` Fall 2 |
| `teacher` kann `waived` nicht setzen | `scripts/test/a2_waived.mjs` Fall 2 (grün auf DEV, 27.09.2026) |

### A3 — Zahlungsvermerk bar / PayPal / Überweisung (ehemals 3.3)
*Als Lehrerin möchte ich in der Teilnehmerliste mit einem Tipp vermerken, dass jemand bar oder per PayPal
bezahlt hat.*

- Tabelle `payments` **bereits mit dem vollen Modell** aus 2.1 (alle Zustände, `provider`, `provider_ref`,
  `method`, `subject_type`, `subject_id`, `registration_id`, `amount_cents`, `currency`, `received_at`,
  `recorded_by`, `note`, `reverses_payment_id`). Stripe fügt später nur Zeilen hinzu, keine Spalten
- Vermerk: `provider = 'manual'`, `method ∈ {cash, bank_transfer, paypal_manual}`, Status direkt `succeeded`
- **Betrag vom Server:** `price_cents_at_booking`. `owner`/`admin` dürfen abweichen (Rabatt), mit Pflichtgrund.
  `teacher` nicht
- **Korrektur nur als Gegenzeile** (`reverses_payment_id`), nie UPDATE oder DELETE. Nach der Gegenzeile ist die
  Deckung wieder `open`
- Erlaubt für `owner`/`admin` bei allen Kursen, für `teacher` nur bei eigenen Kursen (E15)
- Events `payment.recorded`, `payment.reversed`. Jede Aktion im `audit_log`
- **Kein Beleg für Barzahlungen** (E14). Hinweis „Omlify führt keine Kasse“ ist fester Text in der Kassier-Ansicht, kein Schema (P6)
- Funktioniert ohne Stripe und ohne aktivierte Online-Zahlung (B2, B3)

**Akzeptanz:** Vermerk bar → Zahlung, Event, Audit, Deckung `paid`. Gegenzeile → Deckung `open`, beide Zeilen
bleiben. Lehrerin in fremdem Kurs → Fehler. `amount` im Request eines `teacher` wird ignoriert (curl).
**Schema → Freigabe. STOPP.**

#### Entscheidungen 27.09. (P1–P8)

Migration `20260927121500_a3_payments.sql` ist geschrieben und nicht angewendet. Test `scripts/test/a3_payments.mjs` ist geschrieben und nicht gelaufen.

| ID | Entscheidung |
|---|---|
| P1 | `payments.registration_id` ON DELETE RESTRICT. Bis 4.3 kann ein Profil mit Zahlungsvermerk nicht gelöscht werden. Vertretbar, solange die UI keinen Lösch-Knopf hat. 4.3 bleibt PROD-Gate. |
| P2 | Neuen Vermerk auf eine stornierte Buchung: nein (`CANCELLED`). Bestehender Vermerk überlebt die Stornierung. Rückgabe des Geldes ist die Gegenzeile (A9). Warteliste: `NOT_REGISTERED`. |
| P3 | `owner`/`admin` in allen Kursen, `teacher` nur über `is_course_teacher`. Betrag bei Lehrenden immer vom Server. |
| P4 | Ergänzt E15: Wer den Vermerk gesetzt hat, darf ihn innerhalb von 15 Minuten selbst zurücknehmen, auch als Lehrende. Danach nur `owner`/`admin`. |
| P5 | Gegenzeile: negativer Betrag, gleiche Methode, `reverses_payment_id`. Eine Zahlung nur einmal. |
| P6 | Hinweis „keine Kasse“: kein Schema. Fester Text in der Kassier-Ansicht. |
| P7 | Event: `subject_id` = `payments.id`, neue `causation_id` je Aufruf. `registration_id` im Payload, Notiz nicht. |
| P8 | Doppeltipp: `FOR UPDATE` auf der Buchung und nur bei `coverage_status = open`. Sonst `NOT_OPEN`. |

### A4 — Kartenprodukte
*Als Studio möchte ich 5er- und 10er-Karten mit Preis und Gültigkeit anlegen.*

- Tabelle `pass_products`: `tenant_id`, `name`, `units` (≥ 1), `price_cents`, `validity_rule`
  (`years_to_year_end` mit Wert 3 als Standard, oder `months` mit Wert), `is_scheduled = false`,
  `archived_at`. **Kein Löschen, nur Archivieren**
- Spalte `courses.pass_eligible boolean default true`. Beim Anlegen einer Serie für alle Termine gesetzt,
  einzeln abschaltbar (z. B. Workshops)
- Eine Einheit = ein Termin, unabhängig vom Einzelpreis
- Nur `owner`/`admin`
- Die Gültigkeit setzt das Studio. Die Oberfläche empfiehlt den Standard und weist bei weniger als 12 Monaten
  darauf hin, dass kurze Fristen gegenüber Verbrauchern angreifbar sein können (E16)

**Akzeptanz:** 5er und 10er angelegt, archiviert, nicht löschbar. Kurs mit `pass_eligible = false` wird in A6
nicht mit Karte buchbar. **Schema → Freigabe. STOPP.**

#### Entscheidungen 27.09. (K1–K6)

Migration `20260927183209_a4_pass_products.sql` ist geschrieben und nicht angewendet. Test `scripts/test/a4_pass_products.mjs` ist geschrieben und nicht gelaufen.

| ID | Entscheidung |
|---|---|
| K1 | Gültigkeit: `years_to_year_end` (Standard, Wert 1–3) oder `months` (1–60). Oberfläche (Schritt 2) empfiehlt den Standard und zeigt unter 12 Monaten den E16-Hinweis. |
| K2 | Nie löschen, nur archivieren. Archiviertes bleibt in der Verwaltung sichtbar (grau), beim Verkauf (A5) nicht auswählbar. Zurückholen möglich. |
| K3 | Owner und Admin (`is_tenant_manager()`). Lehrende und Teilnehmende weder lesen noch schreiben (Lesen für A5/A6 dort erweitern). |
| K4 | `courses.pass_eligible` Default true. Beim Anlegen einer Serie für alle Termine. Serien-Bearbeitung ändert nur künftige, noch nicht begonnene Termine (Schritt 2). |
| K5 | Navigation: Abschnitt „Karten“ unter Einstellungen (Schritt 2). |
| K6 | E13 (Lehrende verkaufen) erst in A5. |

#### Gültigkeit als Klartext (UI Schritt 2, auch A5)

Dieselbe Anzeigeregel gilt für Produktliste und später beim Verkauf (A5):

| `validity_rule` | Wert `n` | Bedeutung | Anzeige |
|---|---|---|---|
| `years_to_year_end` | 1–3 | gültig bis **31.12. des n-ten Jahres nach dem Kaufjahr** | „bis Jahresende + 3 Jahre (Kauf heute → gültig bis 31.12.2029)“ — Beispieljahr = aktuelles Kalenderjahr (Europe/Berlin) + n |
| `months` | 1–60 | gültig **n Monate ab Kauf** | „6 Monate ab Kauf“ |

Client-Helfer: `formatPassValidity` in `src/lib/passProducts.ts`.

### A5 — Karte vor Ort verkaufen
*Als Studio möchte ich eine vor Ort verkaufte Karte einer Teilnehmerin zuweisen, damit sie damit buchen kann.*

- Tabelle `passes`: `tenant_id`, `member_id` (→ `users.id`, Profil je Studio), **Kopie** von Name, Einheiten,
  Preis, `valid_from`, `valid_until` (nicht per FK auf das aktuelle Produkt), `payment_id`, `status`
  (`active`, `expired`, `revoked`)
- Tabelle `pass_movements` **append-only**: `pass_id`, `delta` (+/−), `kind` (`purchase`, `redeem`,
  `redeem_reversal`, `expire`, `revoke`, `manual_adjustment`), `registration_id`, `reason`, `actor`,
  `event_id`, `at`. Stand = Summe. UPDATE/DELETE für alle Rollen entzogen, Trigger als zweite Sperre
- Verkauf in einer Transaktion: Zahlungsvermerk (`subject_type = 'pass_purchase'`) + Karte + Bewegung `+units`
  + Event `pass.purchased` + Audit
- **Karte wird erst mit Zahlungsvermerk aktiv.** Unbezahlte Karten gibt es in 1a nicht
- Gilt nur im Studio, das sie verkauft hat (I1). Keine Übertragung zwischen Personen
- Nur Vor-Ort-Verkauf durch das Studio. Die Teilnehmerin kann in Sprint A **keine** Karte selbst kaufen
  (Fernabsatz → Widerruf, Button, AGB → Story 2.4 und Rechts-Epic)
- Wer darf verkaufen: siehe **E13**

**Akzeptanz:** Verkauf 10er bar → Zahlung, Karte, Bewegung +10, Event, Audit. Produktpreis danach geändert →
Karte unverändert. UPDATE auf `pass_movements` schlägt fehl. **Schema → Freigabe. STOPP.**

#### Entscheidungen 27.09. (V1–V6) — Umsetzungsblock A5

Migration `20260927213000_a5_passes.sql` und Test `scripts/test/a5_passes.mjs` sind auf DEV grün (Commit `4315116`). E13 damit entschieden (V1).

| ID | Entscheidung |
|---|---|
| V1 | Wer verkauft (E13): Owner, Admin und Lehrende des Studios. Lehrende können den eigenen Verkauf 15 Minuten lang rückgängig machen (wie A3/P4), danach nur Owner/Admin. |
| V2 | Wo: Kassier-Ansicht (Menü der Person) und Personenverwaltung (Oberfläche Schritt 2). |
| V3 | Storno: Owner/Admin können eine Karte stornieren, solange keine Einheit eingelöst ist. Gegenzeile zur Zahlung entsteht automatisch. Benutzte Karten nur über Einzelkorrektur mit Grund (A6). |
| V4 | Zahlarten wie A3: `cash`, `paypal_manual`, `bank_transfer`. Betrag = Produktpreis zum Verkaufszeitpunkt, kein abweichender Betrag in A5. |
| V5 | Gültigkeit aus A4: `years_to_year_end` n → bis 31.12. des Jahres (Kaufjahr + n). `months` n → bis einschließlich Kaufdatum + n Monate. Kaufdatum in Europe/Berlin. |
| V6 | Sichtbarkeit: Owner/Admin alle Karten im Studio. Teilnehmende nur eigene (für „Meine Karten“ in A6). Lehrende keine Tabellen-Lesung (Preis = Zahlungsinformation, E5), sondern RPC `get_member_passes` mit Name, Rest und Gültigkeit, ohne Preis. |

**UI-Stand (27.09., Schritt 2):** Migration und Tests auf DEV grün. Oberfläche gebaut (`SellPassDialog`, `MemberPassesSection`, `src/lib/passes.ts`):
- Kassier-Ansicht: Kennzeichnung „Karte · noch n“ aus `get_member_passes`; bei mehreren die mit frühestem Ablauf und „+n weitere“. Menüpunkt „Karte verkaufen“ wenn `get_sellable_pass_products` nicht leer (Owner/Admin/Lehrende; entfernt bei archivierten Produkten / entfernten Personen). Verkaufsdialog mit Produktflächen und Zahlart-Tipp = Verkauf (wie A3). UndoBar → `revoke_pass` (Lehrende: 15-Min-Grenze serverseitig).
- Personenverwaltung: Abschnitt „Karten“ über der Gefahrenzone (Owner/Admin mit Preis/Zahlart/Storno unbenutzter Karten; eingeklappt „Abgelaufen oder storniert“). Hinweis ohne Produkte nur für Owner/Admin.
- Lehrende sehen in der Kasse keinen Kaufpreis verkaufter Karten (E5); den Preis im Verkaufsdialog schon.
- Kein „mit Karte bezahlen“ (A6). Einlösen ändert die Buchungsdeckung in A5 nicht.

### A6 — Mit Karte buchen, Einheiten zurückbuchen, Verfall
*Als Teilnehmerin möchte ich mit meiner Karte buchen und bei rechtzeitiger Abmeldung die Einheit zurückbekommen.*

- **Buchen mit Karte:** Kurs `pass_eligible`, gültige Karte mit Rest ≥ 1 → Auswahl „mit Karte buchen (noch n)“.
  Einlösung in derselben Transaktion wie die Anmeldung, Sperre `FOR UPDATE` auf die Kartenzeile. Mehrere Karten:
  die mit dem frühesten `valid_until` zuerst
- **Studio trägt ein:** `admin_register_user_for_course` bekommt die Deckungswahl (offen / Karte / bar / PayPal)
- **Nachträglich:** In der Teilnehmerliste lässt sich `open` in „per Karte“ umwandeln
- **Warteliste:** Beim Eintragen fragt die UI „Mit Karte buchen, falls ich nachrücke?“ (`coverage_intent` an der
  Zeile). Beim Nachrücken wird dann automatisch eingelöst. Ohne Zustimmung: Deckung `open`
- **Stornofrist je Studio:** `tenant_booking_settings.cancellation_window_hours` (Standard 24, `valid_from`).
  Die Frist wird bei der Buchung als `cancellation_deadline` an der Anmeldung **eingefroren**
- **Abmeldung in der Frist:** Bewegung `redeem_reversal` +1. Danach: Einheit bleibt verbraucht. Die UI sagt
  vorher, was passiert
- **Kursabsage durch das Studio (A9):** Einheit immer zurück. Ist die Karte inzwischen abgelaufen, zeigt das
  System dem Studio einen Hinweis. Das Studio entscheidet per `manual_adjustment` mit Grund (E17)
- **Verfall:** `pg_cron` täglich (Zeitzone `Europe/Berlin`). Bewegung `expire` über den Rest, Event
  `pass.expired`. Zusätzlich Event `pass.expiring` 14 Tage vorher (nur Event, keine Mail in 1a)
- **Teilnehmerin sieht** unter „Meine Karten“: Rest, gültig bis, Verlauf der Einlösungen

**Akzeptanz (SQL mit gesetzten Zeitstempeln):** Einlösen → Rest −1, Deckung `pass`. Zwei parallele Buchungen
mit Rest 1 → genau eine per Karte, die andere ohne Einlösung (Fehlermeldung „Karte aufgebraucht“). Abmeldung in
der Frist → +1, außerhalb → 0. Verfall am Stichtag → Rest 0, Event. Nachrücken mit Zustimmung → eingelöst.
**Schema → Freigabe. STOPP.**

#### Entscheidungen 27.09. (W1–W9) — Umsetzungsblock A6

| ID | Entscheidung |
|---|---|
| W1 | Studio meldet eine Person ab → Einheit **immer** zurück (wie Kursabsage). Behalten nur per `manual_adjustment` mit Grund. |
| W2 | Stornofrist Standard **24 h**, je Studio **0–72 h** in den bestehenden Buchungseinstellungen (`tenants.cancellation_window_hours`). Bei Buchung als `cancellation_deadline` eingefroren. **Keine** Tabelle `tenant_booking_settings` mit `valid_from` (Abweichung vom Entwurf oben: Einfrieren ersetzt die Historie). |
| W3 | Warteliste: „Mit Karte bezahlen, falls ich nachrücke“ vorausgewählt, wenn gültige Karte; sichtbar und abwählbar (`coverage_intent`). |
| W4 | „Meine Karten“: Abschnitt oben in „Meine Anmeldungen“, Verlauf aufklappbar. |
| W5 | `open` → per Karte: Owner/Admin überall, Lehrende im eigenen Kurs (E15/A3). |
| W6 | `manual_adjustment`: nur Owner/Admin, Grund Pflicht (≤ 200). |
| W7 | Absage zurückgenommen, Karte leer/abgelaufen → Buchung wieder `open`, Glocke an Owner/Admin. |
| W8 | Verfall: `pg_cron`, täglicher SQL-Job (Europe/Berlin), in **A6-3**. |
| W9 | Karte am Kurstag gültig (`valid_until >=` Kursdatum), aktiv, Rest ≥ 1; frühestes `valid_until`, bei Gleichstand ältester Kauf. |
| W10 | Teilnehmende dürfen eine eigene offene Buchung selbst per Karte begleichen, solange der Kurs nicht begonnen hat. |
| W11 | Einlösen zurücknehmen: Owner/Admin jederzeit (aktive Buchung); Lehrende nur eigene Einlösung ≤ 15 Minuten; Teilnehmende nicht (sie melden sich ab). |
| W12 | Kostenloser Kurs: Wunsch „mit Karte“ / `p_coverage` wird ignoriert, Deckung bleibt `not_required`. |
| W13 | Studio trägt auf die Warteliste ein: nur „offen“ oder „mit Karte beim Nachrücken“ (`coverage_intent`). Bar/PayPal/Überweisung erst, wenn der Platz da ist (`WAITLIST_NO_PAYMENT`). |

**Stand Abmeldung bucht zurück (A6-3, Migration geschrieben, noch nicht auf DEV):** Eine eingelöste Einheit wird bei Selbstabmeldung in der eingefrorenen Frist zurückgebucht (`self_in_window`); danach bleibt sie verbraucht. Studio-Abmeldung und Kursabsage buchen immer zurück (`studio_unregister` / `course_cancelled`). Absage zurücknehmen löst erneut ein; scheitert das, bleibt die Buchung `open` und Owner/Admin bekommen eine Glocke (W7). Nachrücken mit `coverage_intent = pass` löst automatisch ein. Reason-Codes in `pass_movements.reason` (keine Freitexte in Events/Audit): `self_in_window`, `studio_unregister`, `course_cancelled`; Freitext nur bei `manual_adjustment`.

**Schnitt (verbindlich):**

| Schritt | Inhalt |
|---|---|
| **A6-1** | Frist, Spalten (`cancellation_deadline`, `pass_id`, `coverage_intent`), Helfer `pick_pass` / `redeem_pass` / `reverse_redemption`, `remove_member`-Fix. Noch kein öffentlicher Buchungsweg löst ein. Migration `20260927221500_a6_1_pass_booking_foundation.sql`. |
| **A6-2** | Einlösen beim Anmelden / Studio-Eintrag / Umwandeln open→Karte; Undo; RPCs + UI. Migration `20260927233000_a6_2_redeem.sql` (+ 2b/2c FK). UI (27.09.): `findUsablePass`, Kursdetail-Auswahl, Meine Anmeldungen W10, Kasse „Karte“, Studio-Deckungswahl, Teilnehmerliste/CSV „Bezahlung“. |
| **A6-3** | Zurückbuchen (Abmelden, Studio, Kursabsage, Rücknahme), Nachrücken mit Intent, `adjust_pass_units`, Verfall per `pg_cron` (`expire_passes` stündlich). Migration `20260928010000_a6_3_reverse_and_expire.sql` (DEV). UI: Abmelde-Hinweis aus `cancellation_deadline`, „Meine Karten“ + Verlauf, Einzelkorrektur, Stornofrist in Buchungseinstellungen. |

**A6 abgeschlossen (28.09.2026).** Bewusste Abweichungen / festgehaltene Entscheidungen:

| ID | Abweichung / Entscheidung |
|---|---|
| W2 | Stornofrist eingefroren in `registrations.cancellation_deadline` statt Historientabelle `tenant_booking_settings`. |
| W10 | Teilnehmende dürfen eigene offene Buchung vor Kursbeginn selbst per Karte begleichen. |
| W11 | Einlösen zurücknehmen: Owner/Admin immer; Lehrende eigene ≤ 15 Min; Teilnehmende nicht. |
| W12 | Kostenloser Kurs: Kartenwunsch wird ignoriert, Deckung bleibt `not_required`. |
| W13 | Studio auf Warteliste: nur open oder `coverage_intent=pass`; Bar/PayPal/Überweisung erst nach Platz. |

**Befund Inventur:** `cancel_reason = promotion_expired` ist reserviert für E2 (Zahlungsfrist nach Nachrücken), nicht Teil von A6 — kein RPC schreibt ihn heute.

### A7 — Hauptbuch mit logischen Konten (ehemals 4.1)
*Als Studio möchte ich, dass jeder Geldvorgang eine unveränderliche Buchungszeile erzeugt.*

- Wie 4.1 im Epic, erzeugt ausschließlich aus Events
- Logische Konten für Sprint A: `cash`, `bank`, `paypal_clearing`, `revenue_standard`,
  `revenue_small_business`, `vat_output`
- **Kartenverkauf:** Umsatz und USt **beim Verkauf** (Einzweckgutschein, Briefing Abschnitt 10). Einlösung
  erzeugt **keine** Buchungszeile
- **Vermerk zu einer Kursbuchung:** Buchung beim Zahlungseingang
- **Nur Zahlungseingänge, keine Forderungen** (E17b): Das entspricht der Ist-Versteuerung, die für kleine
  Studios üblich ist. Soll-Versteuerung (Forderung am Leistungsdatum) braucht eine Einstellung je Studio → 1b
- Gegenzeile eines Vermerks → Stornobuchung. Summe Soll = Summe Haben je Event

**Abweichung:** Steuerstatus vorgezogen aus Story 1.1 in **Minimalform** (`tenant_tax_settings` +
`set_tax_setting`, nur Owner). Volle Stammdaten/Impressum bleiben im Rechts-Epic / 1.1.

**Entscheidungen H1–H9 (28.09.2026):**

| # | Thema | Entscheidung |
|---|---|---|
| H1 | Steuerstatus | Pflicht durch Owner, historisiert `valid_from`: `small_business` (keine USt) oder `regular` mit 19 % oder 7 %. Kein Standard. Ohne Angabe wählt der Job das Studio nicht. Erste Angabe: `valid_from` muss alle bestehenden Zahlungen abdecken (`BEFORE_FIRST_PAYMENT` sonst). Befreite Kurse (§ 4 UStG) je Kurs → später. |
| H2 | Verarbeitung | `pg_cron` alle 5 Min (`yogaflow_process_ledger`). Fehler im Hauptbuch blockiert nie eine Zahlung. Alte Events werden nachgebucht. Job wählt nur Studios mit mindestens einem Steuerstatus (Verhungern). Lock → `{ skipped: 'locked' }`. |
| H3 | Zeilenmodell | Eine Zeile je Konto je Event mit `debit_cents` oder `credit_cents`. Summe Soll = Summe Haben je Event. |
| H4 | Quelle | Nur `payment.recorded` / `payment.reversed`. Art (`course`/`pass`) aus `payments.subject_type`. `pass.purchased` und übrige Events erzeugen keine Zeile. |
| H5 | Storno | Gegenzeile spiegelt exakt die Originalzeilen (Steuersatz des Originals). Original noch nicht gebucht → Gegenzeile wartet. |
| H6 | Statuswechsel | Neuer Status nur ab Datum nach letzter gebuchter Zeile (`ALREADY_BOOKED` sonst). Gebuchtes nie umschreiben. Erste Angabe darf rückwirkend sein. |
| H7 | Auswertung | Nur CSV-Export für Steuerberatung (**A7-2**). Keine Summen von **eingenommenem** Geld am Bildschirm (E14). Offene Beträge je Person erlaubt (S4, 28.09.). |
| H8 | Rundung | `netto = round(brutto × 10000 / (10000 + satz_bp))`, `ust = brutto − netto` (Cent, kaufmännisch). |
| H9 | Buchungsdatum | Kalendertag von `payments.received_at` in `Europe/Berlin`. Steuerstatus mit größtem `valid_from` ≤ Buchungsdatum. |

**A7-1 (Schema + Job, Migration `20260928020000_a7_1_ledger.sql`):** Tabellen `tenant_tax_settings`,
`ledger_entries`, `ledger_event_log`; RPC `set_tax_setting`; Job `process_ledger`; Cron
`yogaflow_process_ledger`. UI/CSV/Hinweis → A7-2.

**A7-2 (UI + Export, Migration `20260928143000_a7_2_ledger_export.sql`):** Einstellungen → Steuern
(Owner setzt, Admin liest), Hinweis solange die Angabe fehlt, CSV-Export ohne Summen am
Bildschirm, Kassenhinweis E14. RPC `export_ledger` nur Owner/Admin, Zeitraum max. 366 Tage.

**A7 abgeschlossen (28.09.2026).** Bewusste Abweichungen:

| ID | Abweichung |
|---|---|
| A7-2a | 19 % und 7 % erklären „Du weist … Umsatzsteuer aus.“ Das benennt die Option, es ist keine Beratung. |
| A7-2b | Summen-CSV: Saldo = Summe Soll − Summe Haben im Zeitraum, nur Konten mit Zeilen. |
| A7-2c | NULL oder Ende vor Anfang → `INVALID_RANGE`. Nur `p_to - p_from` > 365 → `RANGE_TOO_LARGE`. 366 Tage einschließlich erlaubt. |
| A7-2d | CSV-Datum `TT.MM.JJJJ`. Von–Bis-Dateiname `omlify-hauptbuch-YYYY-MM-DD_YYYY-MM-DD`. |
| A7-2e | Kalenderdaten nur als YYYY-MM-DD (`asCivilIsoDate` / `berlinIsoFromInstant` in `courseDateTime.ts`). Dialog klemmt an min/max, damit Anzeige und RPC nicht auseinanderlaufen. |

**Akzeptanz A7-1:** Kartenverkauf 150 € bar, Studio regulär 19 %: 15000 × 10000 / 11900 = 12605,04 →
12605 netto, USt 2395 → `cash` Soll 15000 · `revenue_standard` Haben 12605 · `vat_output` Haben 2395.
Einlösung → keine Zeile. Doppelte Job-Läufe → Zeilen genau einmal. **Schema → Freigabe. STOPP.**

### A8 — Teilnehmerliste mit Deckung (Design-Story)
*Als Lehrerin möchte ich fünf Minuten vor dem Kurs sehen, wer offen ist, und es mit einem Tipp erledigen.*

- Je Person: offen · bar · PayPal · Überweisung · Karte (Rest n) · erlassen / vor Omlify erledigt · kostenlos.
  Nicht allein über Farbe
- Schnellaktionen: „bar“, „mit Karte“ (wenn gültige Karte vorhanden); PayPal und „Karte verkaufen“ im Menü „Mehr“
  (S5)
- `owner`/`admin`: Liste „Offene Zahlungen“ (S3), Sammelaktion „Alte Kurse abhaken“ (S1)
- Grundlage `docs/DESIGNSYSTEM.md`. **Zustände zuerst festlegen, dann gestalten.** Design-Commits getrennt

#### Entscheidungen A8 (28.09.2026) — S1–S7

| # | Frage | Entscheidung |
|---|---|---|
| S1 | Sammelaktion | „Alles vor dem [Datum] war vor Omlify erledigt“. Nur Owner/Admin. Vorschau mit Anzahl Buchungen und Kurse. Atomar (alles oder nichts), als Ganzes rücknehmbar. Keine Sammelaktion je Kurs. |
| S2 | Welche Buchungen | Nur `status = registered`, `coverage_status = open`, Kursbeginn vor dem Datum **und** in der Vergangenheit. Warteliste und Stornierte zählen nirgends als offen. |
| S3 | Offene Zahlungen | Owner/Admin: Liste je Person (vergangene Kurse mit offenem Betrag). Summe **je Person** erlaubt, **keine** Gesamtsumme über das Studio. Filter wie S2. |
| S4 | E14/H7 präzisiert | Keine Anzeige von **eingenommenem** Geld (Kassenbestand, Umsatz). Offene Beträge je Person sind erlaubt. |
| S5 | PayPal | Bleibt im Menü „Mehr“. |
| S6 | Serienbearbeitung | Nicht A8. Eigener Fix direkt nach A8, vor Stripe. |
| S7 | N+1 in der Kasse | Eine RPC liefert die Karten aller Personen eines Kurses (`get_course_member_passes`). |

**Schema A8-1** (Migration `20260928160000_a8_1_bulk_waive_open_list.sql`): `coverage_waive_batches`,
`preview_pre_omlify_waive`, `waive_pre_omlify_before`, `revert_pre_omlify_batch`, `get_pre_omlify_batches`,
`get_open_coverage`, `get_course_member_passes`. UI → A8-2.

#### Textvorgabe Sammelaktion „Alte Kurse abhaken“ (A8-2)

Titel: **Alte Kurse abhaken**

Erklärung: Omlify weiß nicht, wer vor dem Start mit Omlify bezahlt hat. Deshalb stehen deine bisherigen
Kurse als „offen“. Hast du das früher schon selbst geregelt, kannst du hier alles auf einmal abhaken.

Feld: Alles vor dem: [Datum, Standard heute, max. heute]

Vorschau: Das betrifft {count} Anmeldungen aus deinen Kursen vom {first_course_date} bis {last_course_date}.

Was passiert:

- Die Anmeldungen stehen nicht mehr als offen, sondern als „vor Omlify erledigt“.
- Deine Teilnehmenden merken davon nichts, es geht keine Nachricht raus.
- Es wird kein Geld verbucht.
- Du kannst es jederzeit rückgängig machen.

Knopf (primär): {count} Anmeldungen abhaken

Erfolg: „Erledigt. {count} alte Anmeldungen sind abgehakt.“ mit Knopf „Rückgängig“ (Batch-Rücknahme).

Verlauf: „28.09.2026 · 169 abgehakt (alles vor dem 28.09.2026) · Rückgängig“. Nach Rücknahme: „rückgängig gemacht“.

| Code | Text |
|---|---|
| NOTHING_TO_WAIVE / count 0 | „Vor diesem Datum ist nichts mehr offen.“ (Knopf aus) |
| COUNT_CHANGED | „Inzwischen hat sich etwas geändert. Bitte prüf die neue Zahl.“ Vorschau neu laden. |
| TOO_MANY | „Das sind mehr als 1.000 Anmeldungen. Wähle ein früheres Datum und mach es in mehreren Schritten.“ |
| DATE_IN_FUTURE | „Das Datum darf nicht in der Zukunft liegen.“ |
| FORBIDDEN | „Nur die Studioleitung kann das.“ |

Umbenennung Anzeige: `waived` + `pre_omlify` → „vor Omlify erledigt“; `goodwill`/`other` → „erlassen“.

**Akzeptanz A8-1:** Migration + Test geschrieben, nicht angewendet. **STOPP.** A8-2: Screenshots, Dialog-Text von der Testkundin ohne Erklärung verständlich.

### A9 — Kurs absagen (ohne Online-Erstattung)
*Als Studio möchte ich einen Kurs absagen, statt ihn zu löschen.*

Entschieden 27.09.2026 (K1–K8). Migration `20260927143000_a9_course_cancel.sql`, auf DEV angewendet, nicht auf PROD.

| # | Entscheidung |
|---|---|
| K1 | Owner/Admin in allen Kursen, Lehrende im eigenen Kurs (`is_course_teacher`) |
| K2 | Ein Termin, oder dieser und alle folgenden der Serie (`series_id`, Beginn ≥ dieser Termin, noch nicht begonnen) |
| K3 | Rücknahme ja, solange der Termin nicht begonnen hat, gleicher Umfang |
| K4 | Absagen und Zurücknehmen nur, solange der Termin nicht begonnen hat |
| K5 | Glocke. Keine E-Mail in A9. Optionaler Grund, höchstens 200 Zeichen, steht in der Glocke |
| K6 | Löschen ohne jede Anmeldungszeile bleibt wie heute |
| K7 | Keine automatische Gegenzeile. Owner/Admin sehen die Bezahlten und vermerken die Rückgabe mit `reverse_manual_payment` |
| K8 | Karten (A6) nur vorgesehen: markierte Stelle im RPC, an der A6 später `redeem_reversal` bucht |

Abweichungen vom Entwurf vom 21.09.:

- Keine E-Mail über `send-email`. Die Glocke (`course_canceled` / `course_uncanceled`) ist der Weg.
- Karteneinheit wird nicht zurückgebucht. `passes` gibt es noch nicht.
- Story 3.2 erstattet online später. Bar und PayPal bleiben die Gegenzeile aus K7, nicht eine automatische Erstattung.

`courses.status` bleibt die Schreibweise `canceled` (ein l). `register_for_course` lehnt abgesagte Kurse schon ab. `promote_from_waitlist` und `admin_register_user_for_course` werden in derselben Migration geschlossen, damit niemand in einen abgesagten Kurs nachrückt oder nachgebucht wird.

**Akzeptanz:** Kurs mit Warteliste und einer Barzahlung absagen → niemand rückt nach, Glocken, Zahlung bleibt `paid`, bis Owner/Admin die Gegenzeile setzt. Rücknahme stellt nur die durch die Absage stornierten Buchungen wieder her. Serie „ab diesem Termin“ lässt frühere Termine aktiv. **STOPP.**

---

## 6. Änderungen an bestehenden Abschnitten des Epics

- **E2 (Nachrücken):** Zahlungslink mit Frist nur, wenn online bezahlt werden muss. Mit Karte und Zustimmung →
  automatische Einlösung. Bei erlaubter Vor-Ort-Zahlung → direkt `registered`, Deckung `open`
- **E4:** „Steuerberater sieht es vor PROD“ → „Beleg und Buchungslogik von einem Steuerberater geprüft, z. B. dem
  des ersten zahlenden Studios“
- **E5:** Ergänzt um E15
- **1.3 (Onboarding):** Neue Studio-Einstellung „Zahlung vor Ort weiterhin erlauben“ (Standard: ja). Ist sie
  aus, führen Bezahlkurse zwingend in den Checkout
- **Neue Story 2.4 — Karte online kaufen:** Karte als Produkt im Checkout. Widerrufsbelehrung, Widerrufsbutton
  (§ 356a BGB), Zustimmung zum vorzeitigen Beginn. Abhängig vom Rechts-Epic
- **3.2:** Nutzt A9, ergänzt die Online-Erstattung. Bar und PayPal bleiben die Gegenzeile aus A9 (K7), keine automatische Erstattung
- **4.2:** Belege für Kartenverkauf und Kursbuchung per Überweisung/PayPal/online. **Nicht für bar** (E14)
- **4.3 (Löschen/Aufbewahren):** FKs von `passes`, `pass_movements` ebenfalls `RESTRICT`

#### Umsetzung 4.3, Schritt 1 (27.09.2026, auf DEV)

Migration `20260927145006_4_3_member_removal.sql`, Commit `4898fbe`. Test `scripts/test/s4_3_remove_member.mjs` auf DEV grün, zusammen mit a1, a3 und a9. Der Knopf kommt in Schritt 3.

#### Umsetzung 4.3, Schritt 2 (27.09.2026, geschrieben, nicht deployed)

`supabase/functions/delete-user/index.ts` ruft `remove_member` mit dem Token der aufrufenden Person auf. Der Studio-Header `x-omlify-tenant` wird wie in `update-user` an diesen Aufruf gehängt, damit `get_my_member_id()` dasselbe Studio sieht wie die App. Das Login löscht nur der Service-Role-Client, und nur wenn `success` wahr ist, `remaining_profiles === 0` eine Zahl ist und `auth_user_id` gesetzt ist. Die Sammelmeldung für `23503` ist weg. Test `scripts/test/s4_3_delete_user_fn.mjs`, nicht ausgeführt. Deploy auf DEV macht Julius.

Entscheidungen:

| # | Entscheidung |
|---|---|
| L1 | Entfernen darf Owner/Admin im eigenen Studio. Keine Selbstlöschung. Owner bleiben, bis die Rolle gewechselt wurde. |
| L2 | Ohne Geldbezug löschen wie bisher. Mit Geldbezug anonymisieren und vom Login lösen. Zahlungen, Anmeldungen mit Geldbezug, Events und Audit bleiben. |
| L3 | Login löschen, wenn danach kein Profil mehr an ihm hängt. Das macht Schritt 2 in `delete-user`, nicht die RPC. Die RPC liefert `remaining_profiles`. |
| L4 | Jetzt nur `anonymized_at`. Kein Löschjob. |
| L5 | Studio löschen bleibt `delete_tenant_complete` für `service_role`. Export ist eine eigene Story. |

Geldbezug: Anmeldung mit Zahlungszeile oder Deckung `paid`/`waived`, oder `payments.recorded_by`, oder `audit_log.actor_member_id`, oder `courses.teacher_id` eines Kurses, der nicht aktiv und noch nicht begonnen ist.

Abweichungen aus der Inventur, die diese Migration berücksichtigt:

- **P1.** `payments.registration_id` ist RESTRICT. Ein Profil mit Vermerk lässt sich nicht löschen. Die RPC anonymisiert es, statt an `23503` zu scheitern. `delete-user` gibt diese Sammelmeldung seit Schritt 2 nicht mehr aus.
- **L3.** `courses.teacher_id` ist schon RESTRICT, nicht mehr CASCADE. Eine Lehrende mit nur vergangenem Kurs wird anonymisiert, `teacher_id` bleibt. Zusätzlich zählt jeder Kurs, der nicht „aktiv und noch nicht begonnen“ ist, als Geldbezug, damit ein abgesagter, noch nicht begonnener Kurs das Löschen nicht mit `23503` abbricht.
- **L8.** `delete_tenant_complete` löscht Zahlungen, Events und Audit weiter mit (L5, unverändert) und räumt anonymisierte Profile mit ab. „Letztes Profil → Login weg“ ist nicht die Datenbankkaskade. Die Kaskade läuft vom Login auf Profile mit gesetztem `auth_user_id`. Die anonymisierte Zeile hat `auth_user_id` NULL und überlebt `auth.admin.deleteUser`.
- **Erlass.** Deckung `waived` ohne Zahlungszeile ist Geldbezug. Die Anmeldung inklusive `coverage_waived_note` bleibt. Vorher hätte `registrations.user_id` CASCADE sie mitgelöscht.
- Künftige Anmeldungen ohne Geldbezug werden storniert (`member_removed`) und behalten, nicht hart gelöscht. Sonst gäbe es kein Nachrücken und keine Stornozeile. Unbezahlte vergangene Anmeldungen ohne Erlass werden gelöscht.
- **Scope „Nicht in 1a“:** „Guthabenkarten“ streichen. Neu: Selbstkauf von Karten vor Stripe · unbezahlte
  Karten · Barbelege · Soll-Versteuerung · Mitgliedschaften (bleibt 1b)

### PROD-Gate für Sprint A (neu, kleiner als das Gate in Abschnitt 7)

Sprint A darf vor Stripe nach PROD, wenn alles zutrifft:

1. Sprint 0 und A1–A9 grün auf DEV, jede Akzeptanz belegt
2. Mehrfachmitgliedschaft (Stufen 1–3c) ist auf PROD (unverändert aus Abschnitt 7, Punkt 2)
3. **4.3 Löschen und Aufbewahren** ist umgesetzt. Sonst löscht ein gelöschtes Profil Zahlungsvermerke und Karten
4. E14 geklärt oder bewusst mit Vermerk-Variante bestätigt
5. AVV-Vorlage für Studios liegt vor (Rechts-Epic)
6. Probelauf der Migrationen auf einer PROD-Kopie, dann nach `SCHEMA_RELEASE_WORKFLOW.md`

---

## 7. Neue Entscheidungen

| # | Frage | Empfehlung / Entscheidung | Stand |
|---|---|---|---|
| **W10** | Selbst begleichen per Karte? | Ja, eigene offene Buchung vor Kursbeginn | entschieden 27.09. (A6-2) |
| **W11** | Einlösen zurücknehmen? | Owner/Admin immer; Lehrende eigene ≤ 15 Min; Teilnehmende nicht | entschieden 27.09. (A6-2) |
| **W12** | Kostenlos + Kartenwunsch? | Ignorieren, `not_required` | entschieden 27.09. (A6-2) |
| **W13** | Warteliste + Zahlart vom Studio? | Nein — nur open oder `coverage_intent=pass` | entschieden 27.09. (A6-2) |
| **E13** | Dürfen Lehrende Karten verkaufen? | **Ja** (V1): Owner, Admin und Lehrende; Listenpreis; Lehrende stornieren eigenen Verkauf 15 Minuten (wie P4) | entschieden 27.09. (V1) |
| **E14** | Barbeleg aus Omlify? | **Nein, nur Vermerk** (Abschnitt 3). **Präzisierung 28.09. (S4):** Keine Anzeige von eingenommenem Geld (Kassenbestand, Umsatz). Offene Beträge je Person sind erlaubt. | entschieden 21.09., präzisiert 28.09. |
| **E15** | Rechte der Lehrenden bei Deckung | Vermerk bar/PayPal/Überweisung und Einlösen **nur in eigenen Kursen**, Betrag vom Server, keine Korrektur, kein `waived`, keine Studio-Übersicht der Beträge. **P4 (27.09.):** den eigenen Vermerk innerhalb von 15 Minuten selbst zurücknehmen, auch als Lehrende; danach nur `owner`/`admin` | entschieden 21.09., ergänzt 27.09. |
| **E16** | Gültigkeit von Karten | Studio setzt sie. Standard „3 Jahre zum Jahresende“, Hinweis unter 12 Monaten. Rechtsprüfung im Rechts-Epic | entschieden 21.09. |
| **E17** | Einheit bei Absage auf abgelaufene Karte | Hinweis ans Studio, Studio entscheidet per `manual_adjustment` | entschieden 21.09. |
| **E17b** | Ist- oder Soll-Versteuerung im Hauptbuch | **Ist** (nur Zahlungseingänge) in 1a, Einstellung je Studio in 1b | entschieden 21.09. |
