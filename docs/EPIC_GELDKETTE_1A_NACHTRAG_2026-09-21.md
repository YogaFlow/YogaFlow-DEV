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
  `recorded_by`, `note`, `reverses_payment_id`). ~~Stripe fügt später nur Zeilen hinzu, keine Spalten~~
  **Überholt durch Entscheidung 08 (28.09.2026, Variante D):** Online-Versuche laufen über eine eigene
  Tabelle `payment_attempts` (2.1b-a). `payments` bleibt unverändert und nimmt nur erfolgreiche Eingänge auf
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
- Logische Konten für Sprint A: `cash`, `bank`, `paypal_clearing`, `psp_clearing`
  („Verrechnung Stripe“, ab 2.2a), `revenue_standard`, `revenue_small_business`, `vat_output`
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

**Akzeptanz A8-1:** Migration + Test auf DEV grün, CI grün (`a7bdac2`).

**A8-2 (UI) — abgeschlossen 28.09.2026:** Seite „Offene Zahlungen“, Sammelaktion „Alte Kurse abhaken“, Dashboard-Karte, einheitliche `coverageLabel`-Texte, Kasse mit `get_course_member_passes`. Texte aus Teil E wörtlich. Abweichungen: siehe Abschlussbericht A8-2.

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

## 5a. Story 1.2a — Provider-Schema (Entscheidung 08, 28.09.2026)

Stripe-Schritt 1.2 wird geteilt: **1.2a** Schema und Schalter (ohne Stripe-API), **1.2b** Provider-Port,
Stripe-Adapter, Fake-Adapter, Deno-Tests, Log-Fix.

| # | Frage | Entscheidung |
|---|---|---|
| P1 | Release | Ein gemeinsames PROD-Update (Entscheidung 07 bleibt). Alles in 1.2a verhält sich bei ausgeschaltetem Schalter wie heute. |
| P2 | Zahlungsmodell | Variante D. `payment_attempts` kommt in 2.1b-a, nicht jetzt. `payments` bleibt unverändert. Der A3-Satz „Stripe fügt nur Zeilen hinzu“ ist damit überholt. |
| P3 | Umfang | Nur Karte, nur Einzeltermin. Kein `sepa_debit` im Enum. |
| P4 | Schalter | Owner schaltet je Studio ein, nur wenn die Plattform freigegeben hat (`service_role`) und das Stripe-Konto bereit ist. |
| P5 | Kunden | `provider_customers` erst in 2.2a. |

**Migration** `20260928203500_s1_2a_provider_schema.sql`, auf DEV angewendet 28.09.
`scripts/test/s1_2a_provider_schema.mjs` und `test:geldkette` grün. Commits `2a25344` / `1af6ef4`.

- Tabellen: `platform_flags` (+ Verlauf `platform_flag_changes`), `provider_accounts`, `provider_capabilities`,
  `provider_events_raw`, `tenant_payment_settings`. Nichts an `tenants`.
- RPCs Studio: `set_online_payments_enabled` (Owner), `set_allow_onsite_payment` (Owner),
  `get_payment_setup_status` (Owner/Admin).
- RPCs nur `service_role`: `set_platform_flag`, `upsert_provider_account` (Alias auf `yogaflow_private`).
- Einschalten prüft in dieser Reihenfolge: `PLATFORM_DISABLED` → `PROVIDER_NOT_READY` → `TAX_SETTING_MISSING`.
- Wird das Konto nicht mehr bereit, schaltet `upsert_provider_account` online automatisch aus
  (Event `payments.online_disabled`, Grund `PROVIDER_NOT_READY`).

**Festlegungen in der Umsetzung:**

| # | Festlegung | Grund |
|---|---|---|
| 1.2a-1 | Verlauf des Plattform-Schalters in `platform_flag_changes` statt `audit_log` | `audit_log.tenant_id` ist `NOT NULL`; der Schalter hat kein Studio (Rückfrage 28.09.) |
| 1.2a-2 | `provider_capabilities.tenant_id NOT NULL` mit FK `(provider_account_id, tenant_id)` | Hausregel „jede tenant-eigene Tabelle hat `tenant_id`“ (Rückfrage 28.09.) |
| 1.2a-3 | Löschschalter `yogaflow.allow_payment_delete` gilt auch für `provider_accounts` und `provider_events_raw` | Vorgabe „bestehender Schalter“ |
| 1.2a-4 | `service_role` auf den neuen Tabellen nur `SELECT`, auf `provider_events_raw` zusätzlich `INSERT`/`UPDATE`; kein `DELETE`/`TRUNCATE` | `TRUNCATE` umginge die Lösch-Trigger; Konten und Einstellungen nur über RPCs |
| 1.2a-5 | `provider_accounts`: `tenant_id`, `provider`, `provider_ref`, `livemode` unveränderlich; zweite Referenz im selben Studio → `ACCOUNT_REF_MISMATCH`, anderer `livemode` → `LIVEMODE_MISMATCH` | „Nie umhängen“ auch in der Datenbank erzwingen |
| 1.2a-6 | Automatisch aus bei „nicht bereit“ insgesamt (Status nicht `active`, `charges_enabled` false oder `card` nicht `active`), nicht nur bei `card` | Gleiche Regel wie beim Einschalten, Grund-Code heißt `PROVIDER_NOT_READY` |
| 1.2a-7 | Steuerstatus „vorhanden“ = Zeile mit `valid_from` ≤ heute (Europe/Berlin) | Vorsichtige Variante (N9): ein nur künftiger Status lässt heutige Online-Zahlungen im Hauptbuch warten |
| 1.2a-8 | Einschalten prüft auch, wenn schon an; ohne Zustandswechsel kein Event | Ein „schon an“ bei gesperrter Plattform wäre irreführend |
| 1.2a-9 | `upsert_provider_account` ohne Änderung (doppelter Webhook) schreibt kein Event | Kein Rauschen in `events` |
| 1.2a-10 | Capabilities als `{"card": "<status>"}` mit `active`, `inactive` oder `pending`; andere Schlüssel → `INVALID_CAPABILITIES` | P3; der Adapter (1.2b) übersetzt Stripe-Namen |

## 5b. Story 1.2b — Provider-Port, Stripe-Adapter, Fake-Adapter (28.09.2026)

| # | Frage | Entscheidung |
|---|---|---|
| P6 | Vertragspartner Plattform (E12) | Julius als Einzelunternehmer. Steht in Stripe, nicht im Code. |
| P7 | Konto-Konfiguration (E11) | **Ersetzt durch P7 neu in Nachtrag 5d.** (Historisch: Accounts v1 mit Controller-Eigenschaften.) |
| P8 | Reihenfolge | Erst alles auf DEV im Stripe-Testmodus fertig bauen und testen. Rechts-Epic, Anwalt und Steuerberatung kommen danach. |
| P9 | Offener Punkt 1 aus 1.2a | Ist Online aus, gilt Vor-Ort-Zahlung immer als erlaubt, egal was in `allow_onsite_payment` steht. Die Einstellung wirkt nur, wenn Online wirksam an ist. **Gebaut in 2.2.** |
| P10 | Offener Punkt 2 aus 1.2a | „Online wirksam an“ = Plattform-Schalter **und** Studio-Schalter. Gilt überall (Checkout, Buchungsseite, Anzeige). Ein zentraler Helfer, keine doppelte Logik. **Gebaut in 2.2.** |

**Regel „Stripe nur im Adapter“ (I8).** `npm:stripe`, Importe aus `stripe` und `Stripe.`-Typen stehen
ausschließlich unter `supabase/functions/_shared/payments/stripe/`. Alles andere spricht nur mit dem Port.
CI prüft das mit `scripts/check_provider_boundary.mjs` (`npm run check:provider-boundary`), auch in `src/`.
`@stripe/stripe-js` / `@stripe/connect-js` im Frontend kommen in 1.3 und werden dann als Ausnahme für `src/`
ergänzt.

**Ordnerstruktur**

```
supabase/functions/_shared/payments/
  port.ts              Port: Typen, ProviderError, connectedAccountIdempotencyKey
  config.ts            PAYMENTS_MODE lesen (test | live)
  index.ts             getPaymentProvider(env) — Fabrik
  port_contract.ts     Vertragstest, läuft gegen jeden Adapter
  index_test.ts
  stripe/
    sdk.ts             einziger Import npm:stripe@22.6.2, API 2026-08-26.dahlia, Key-Prüfung, Fehlerabbildung
    account_status.ts  reine Status-Abbildung (ohne SDK)
    adapter.ts         StripePaymentProvider
    onboarding.ts      Account Session (außerhalb des Ports)
    test_support.ts    fetch-Stub und signierte Events für Tests
    fixtures/          Kontofixtures
    *_test.ts
  fake/
    adapter.ts         FakePaymentProvider (Speicher, eigene HMAC-Signatur)
    adapter_test.ts
```

**Konfiguration.** `PAYMENTS_MODE` (`test` | `live`) ist Pflicht. `test` verlangt `sk_test_`/`rk_test_`,
`live` verlangt `sk_live_`/`rk_live_`. Abweichung oder fehlender Key → `CONFIG_ERROR`, bevor eine Anfrage
an Stripe möglich ist. `livemode` jedes Events muss zu `PAYMENTS_MODE` passen (`LIVEMODE_MISMATCH`).
`PAYMENTS_PROVIDER=fake` nur mit `PAYMENTS_MODE=test`.

**Festlegungen in der Umsetzung** (alle bestätigt durch Julius 28.09.):

| # | Festlegung | Grund |
|---|---|---|
| 1.2b-1 | ~~`transfers` zusammen mit `card_payments`~~ → aufgehoben durch P7 neu (Accounts v2: nur `card_payments`, kein `transfers`/`stripe_transfers`) | v1-Regel galt nur für Accounts v1 |
| 1.2b-2 | Karte `active` und kein Nutzer-`past_due` (`awaiting_action_from = user`) → `active`, auch wenn `currently_due` gefüllt ist. `requirementsPending` / `requirementsDueAt` siehe Abbildung V2 in Nachtrag 5d. `action_required` erzeugt der Adapter vorerst nicht. | In v2 sind frische Pflichtangaben oft sofort `past_due` (Sperre); das ist kein v1-„Frist verpasst“. Bestätigt / korrigiert 29.09. |

| 1.2b-3 | Zusätzliche Fehlercodes `PROVIDER_REJECTED`, `INVALID_EVENT`, `LIVEMODE_MISMATCH` | Ungültige Anfrage ist kein Ausfall (kein Retry); `LIVEMODE_MISMATCH` wie in `upsert_provider_account` |
| 1.2b-4 | Fake meldet `id = 'stripe'` | `payment_provider` kennt nur `stripe` und `manual`; der Fake steht in Function-Tests an Stripes Stelle |
| 1.2b-5 | `ProviderAccountState.livemode` kommt aus dem Schlüsselmodus (`PAYMENTS_MODE`); Events tragen eigenes `livemode` | v2-Konto hat `livemode`, der Adapter nutzt für den Port-Stand weiterhin den konfigurierten Modus |
| 1.2b-6 | Maskierer ergänzt um `rk_` | Restricted Keys sind jetzt erlaubt und dürfen nicht im Klartext ins Log |

## 5c. Story 1.4 — Webhook-Empfang (28.09.2026)

| # | Frage | Entscheidung |
|---|---|---|
| W1 | Endpunkte | Ein Stripe-Endpunkt für Ereignisse verbundener Konten (Connect). Bei Direct Charges kommen auch die Zahlungsereignisse von dort. Ein Plattform-Endpunkt ist vorerst nicht nötig (ersetzt „zwei Endpoints“ aus Epic 1.4). Secret `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_WEBHOOK_SECRET_2` für die Rotation: Die Signatur gilt, wenn eines der gesetzten Secrets passt. |
| W2 | Reihenfolge | Erst prüfen, dann speichern, dann verarbeiten. Ungültige Signatur → 400, nichts wird gespeichert. |
| W3 | Wahrheit | Bei `account.updated` wird der Stand bei Stripe nachgelesen (`getAccountState`), nicht aus dem Event übernommen. Die Reihenfolge der Events spielt keine Rolle. |
| W4 | Studio | Nur über `provider_accounts.provider_ref = account` im Event (I7). Kein Rückgriff auf Metadaten. Nicht auflösbar → Rohzeile mit `TENANT_NOT_RESOLVED`, HTTP 200, keine Wirkung. Das Onboarding (1.3) liest den Stand nach dem Anlegen selbst nach. |
| W5 | Antwortcodes | 200 für alles, was angenommen und abschließend behandelt ist, auch ignorierte Typen und fachliche Fehler (`ACCOUNT_TENANT_MISMATCH` usw.). 500 nur bei vorübergehenden Fehlern (Datenbank oder Stripe nicht erreichbar), damit Stripe erneut zustellt. |
| W6 | Doppelte Events | Dedup über `(provider, event_id)`. Schon da und verarbeitet → sofort 200. Da, aber nicht verarbeitet (früherer 500er) → erneut verarbeiten, `attempts + 1`. |
| W7 | Typen jetzt | Nur `account.updated` hat eine Wirkung. Alle anderen Typen werden gespeichert und ohne Fehler als verarbeitet markiert. Zahlungstypen kommen in 2.2. |

**Migration** `20260928224500_s1_4_webhook_rpcs.sql` (geschrieben, nicht angewendet). Drei Funktionen in
`yogaflow_private`, je ein `public`-Alias nur für `service_role`, Client-JWT → `FORBIDDEN`:
`record_provider_event`, `mark_provider_event_processed`, `mark_provider_event_failed`.

**Edge Function** `supabase/functions/payments-webhook/` (`verify_jwt = false`): `index.ts` (Einstieg,
Service-Client), `handler.ts` (Logik, alle Abhängigkeiten injiziert), `store.ts` (RPC-Aufrufe),
`handler_test.ts`. Stripe nur über den Port; die Grenz-Prüfung bleibt grün.

**Ablauf in Worten**

1. Nur `POST`, sonst 405. Body höchstens 1 MB, sonst 413 (Content-Length vorab, beim Lesen erneut).
2. Konfiguration prüfen: `PAYMENTS_MODE`, mindestens ein Webhook-Secret im Format `whsec_…`, Anbieter und
   Service-Client baubar. Fehlt etwas → 500 `CONFIG_ERROR`.
3. Header `stripe-signature` fehlt → 400. Rohbody lesen.
4. Signatur gegen jedes gesetzte Secret prüfen. Keines passt → 400 `INVALID_SIGNATURE`. `livemode` passt
   nicht zu `PAYMENTS_MODE` → 400 `LIVEMODE_MISMATCH`. Bis hier wird nichts gespeichert.
5. `record_provider_event`: Studio über das Konto auflösen, Rohzeile einfügen oder vorhandene finden.
   Datenbank nicht erreichbar → 500.
6. Vorhanden und verarbeitet → 200, Ende.
7. Verarbeiten:
   - `account.updated` mit Studio → Stand bei Stripe nachlesen → `upsert_provider_account` mit
     `{"card": …}`. Liefert die RPC einen Fehlercode → Code in die Rohzeile, 200.
     Stripe nicht erreichbar → `mark_provider_event_failed`, 500.
   - `account.updated` ohne Studio → `TENANT_NOT_RESOLVED`, 200.
   - alle anderen Typen → verarbeitet ohne Fehler, 200.
8. `mark_provider_event_processed` (Code oder `NULL`), Antwort `{ "received": true }`.

Geloggt werden nur Event-Typ, `evt_…`-ID und Ergebnis-Code, über `createServiceLogger`.

**Festlegungen in der Umsetzung** (bestätigt durch Julius 28.09.):

| # | Festlegung | Grund |
|---|---|---|
| 1.4-1 | Die Function erkennt `account.updated` über `toDomainEvent` des Ports, nicht über den Typ-String. Ein kaputtes Kontoobjekt im Event → `INVALID_EVENT` in der Rohzeile, 200 | Anbieterwissen bleibt im Adapter; eine Wiederholung heilt ein kaputtes Event nicht |
| 1.4-2 | `PROVIDER_REJECTED` beim Nachlesen (z. B. Konto nicht mehr mit der Plattform verbunden) → Code in die Rohzeile, 200. `CONFIG_ERROR` (Key ungültig) und `PROVIDER_UNAVAILABLE` → 500 | W5: Nur Vorübergehendes wird wiederholt; ein falscher Key ist nach der Korrektur wiederholbar |
| 1.4-3 | Die Rohzeile speichert den ganzen Event-Body, nicht nur `data.object` | Nachverarbeitung (5.1) braucht den vollständigen Umschlag |
| 1.4-4 | `record_provider_event` → `FORBIDDEN` wird 500 `CONFIG_ERROR` (Function spricht nicht als `service_role`). Andere Fehler der RPC (`INVALID_INPUT`, `LIVEMODE_MISMATCH` einer bestehenden Zeile) → 200 ohne Wirkung, nur Log | W5; eine Wiederholung ändert daran nichts |
| 1.4-5 | Bei einem Duplikat gilt die gespeicherte `tenant_id` (unveränderlich), nicht eine neue Auflösung | Die Rohzeile wird nie überschrieben (1.2a-Trigger) |
| 1.4-6 | Fehlercodes der Antwort: `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `CONFIG_ERROR`, `MISSING_SIGNATURE`, `INVALID_SIGNATURE`, `INVALID_EVENT`, `LIVEMODE_MISMATCH`, `DB_ERROR`, `PROVIDER_UNAVAILABLE` | Nur Code, keine Details |

## 5d. Story 1.3a — Onboarding-Backend (28.09.2026)

| # | Frage | Entscheidung |
|---|---|---|
| O1 | Wer startet | Nur Owner. Admin sieht den Stand (`get_payment_setup_status`), startet nichts. |
| O2 | Plattform aus | Kein Onboarding, solange der Plattform-Schalter aus ist (`PLATFORM_DISABLED`). |
| O3 | Ablauf | Owner startet → Server legt bei Bedarf das Konto an (P7), speichert sofort, gibt Account Session für `account_onboarding` zurück. Kein Redirect. |
| O4 | Stand aktualisieren | Nach dem Schließen der Komponente: Client ruft `refresh` → Server liest bei Stripe nach und speichert. Webhook bleibt die zweite Quelle (W4). |
| O5 | Frist von Stripe | `requirements_pending` und `requirements_due_at` werden gespeichert und in `get_payment_setup_status` ausgegeben. Status bleibt `active`, solange Stripe kassieren lässt (1.2b-2). |
| O6 | Verbindung getrennt | `account.application.deauthorized` → Status `disconnected`, Studio online aus (Grund `PROVIDER_DISCONNECTED`). Neues Konto danach ist nicht Teil von 1.3a. |
| O7 | Idempotenz | Konto anlegen mit Key `acct-create-<tenant_id>`. Zweimal „Einrichten“ → dasselbe Konto. |

**Migration** `20260928231500_s1_3a_onboarding.sql` (geschrieben, nicht angewendet).

- Spalten auf `provider_accounts`: `requirements_pending`, `requirements_due_at`, `disconnected_at`; CHECK um `disconnected`.
- `upsert_provider_account`: neue Parameter mit Defaults (`p_requirements_pending`, `p_requirements_due_at`); alte 9-Parameter-Signatur entfällt. Konten mit Status `disconnected` → `ACCOUNT_DISCONNECTED`.
- Neu nur `service_role`: `mark_provider_account_disconnected`, `get_owner_payment_context`.
- `get_payment_setup_status`: zusätzlich `requirements_pending`, `requirements_due_at`, `disconnected`.

**Edge Function** `supabase/functions/payments-onboarding/` (`verify_jwt = false`, JWT/Tenant über `initService` wie `service-ping`). Aktionen `start` und `refresh`. Antworten ohne `acct_…`.

**Webhook-Ergänzung:** `toDomainEvent` mappt `account.application.deauthorized` → `provider_account.disconnected` → `mark_provider_account_disconnected`. `account.updated` reicht die Anforderungsfelder weiter.

**Ablauf in Worten (start)**

1. `initService` prüft JWT und Tenant. Mitgliedschaft über `get_current_member`.
2. `get_owner_payment_context` (service_role): kein Owner → 403. Plattform aus → 409. Status `disconnected` → 409.
3. Kein Konto → `createConnectedAccount` mit Idempotency-Key → sofort `upsert_provider_account`. Speicherfehler → 500 (nächster Versuch: dasselbe Stripe-Konto).
4. Account Session für `account_onboarding` → `{ client_secret, expires_at, onboarding_status }`.

**Ablauf in Worten (refresh)**

1. Owner-Kontext wie oben (ohne Plattform-Prüfung fürs Lesen).
2. Mit Konto und nicht `disconnected` → `getAccountState` → `upsert_provider_account`.
3. Antwort = `get_payment_setup_status` (Nutzer-JWT). Ohne Konto derselbe Status wie die RPC.

**Festlegungen in der Umsetzung** (zur Bestätigung):

| # | Festlegung | Grund |
|---|---|---|
| 1.3a-1 | `upsert_provider_account` akzeptiert `disconnected` nicht als `p_status`; nur `mark_provider_account_disconnected` setzt ihn | Stripe liefert keinen Onboarding-Status „disconnected“ |
| 1.3a-2 | Signatur mit Defaults statt Überladung | PostgREST und alte Aufrufe ohne die neuen Felder bleiben gültig; `CREATE OR REPLACE` kann Parameter nicht anhängen |
| 1.3a-3 | `refresh` bei `disconnected` liest Stripe nicht nach | Konto ist getrennt; Setup-Status aus der DB reicht |
| 1.3a-4 | `PROVIDER_UNAVAILABLE` → HTTP 503, `CONFIG_ERROR` → 500, sonst 500 `PROVIDER_ERROR` | Vorgabe; keine Stripe-Texte an den Client |

### P7 neu und Accounts v2 (Nachtrag zur Story 1.3a)

Der Stripe-Testmodus lehnte `POST /v1/accounts` mit Controller-Eigenschaften ab
(„Accounts v1 with controller properties is not enabled“). Entscheidung: **Accounts v2**
über `POST /v2/core/accounts`. Der v1-Schalter im Dashboard wird nicht aktiviert.
SDK bleibt `npm:stripe@22.6.2`, API `2026-08-26.dahlia`.

| # | Frage | Entscheidung |
|---|---|---|
| P7 neu | Konto-Modell | Accounts v2, `POST /v2/core/accounts`. Felder: `dashboard: full`, `defaults.responsibilities.fees_collector: stripe`, `losses_collector: stripe`, `identity.country` (Schreibweise wie in der Doku), `configuration.merchant.capabilities.card_payments.requested: true`, `metadata.omlify_tenant_id`. Kein `transfers` bzw. `stripe_transfers`, keine customer-Konfiguration. Idempotency-Key unverändert `acct-create-<tenant_id>` (`RequestOptions.idempotencyKey`). |
| V1 | Stand lesen | Nur v2: `v2.core.accounts.retrieve` mit `include` für `configuration.merchant`, `requirements`, `identity`. Kein Umweg über v1-Retrieve. |
| V2 | Abbildung auf `ProviderAccountState` | Siehe Tabelle unten. `details_submitted` gibt es in v2 nicht — der Wert wird abgeleitet. `action_required` erzeugt der Adapter vorerst nicht (Enum bleibt); Nachforderungen nach Aktivierung später. |
| V3 | Ereignisse | Grundregel bleibt W3: Wir lesen immer nach. Welches Ereignis kommt, ist nur der Auslöser. Der Webhook nimmt zusätzlich v2-Thin-Events an (`parseEventNotificationAsync`) und liest dann das Konto nach. Snapshot `account.updated` und `account.application.deauthorized` bleiben unterstützt. |
| V4 | Welche Ereignisse wirklich ankommen | Der Geltungsbereich der Doku („Ihr Konto“ / „Verbundene Konten“) ist widersprüchlich. Klärung empirisch per `scripts/test/s1_3a_e2e_events.mjs` nach echtem Onboarding — nicht per Annahme. |
| V5 | Secrets | Optionales Secret `STRIPE_WEBHOOK_SECRET_THIN` für das zweite Stripe-Ziel (Nutzlast-Stil Thin). Die Function prüft die Signatur gegen alle gesetzten Secrets (`STRIPE_WEBHOOK_SECRET`, `_2`, `_THIN`); mindestens eines muss gesetzt sein. |

**Abbildung V2** (`account_status.ts`):

Quelle „wer ist am Zug“: `requirements.entries[].awaiting_action_from` mit Werten
`user` | `stripe` (Stripe API Account object, API `2026-08-26.dahlia`; SDK
`V2.Core.Account.Requirements.Entry`). In v2 sind Pflichtangaben eines neuen Kontos
oft sofort `past_due` (Sperre bis erledigt) — das ist nicht „Frist verpasst“ wie in v1.

| Port-Feld | aus v2 |
|---|---|
| `capabilities.card` | `configuration.merchant.capabilities.card_payments.status`: `active` → `active`, `pending` → `pending`, sonst `inactive` |
| `chargesEnabled` | `card === active` (in dieser Ausbaustufe nur Karte) |
| `payoutsEnabled` | `configuration.merchant.capabilities.stripe_balance.payouts.status === active` |
| `requirementsPending` | Eintrag in `requirements.entries` mit `minimum_deadline.status` `currently_due` oder `past_due` |
| `requirementsDueAt` | `requirements.summary.minimum_deadline.time` (RFC 3339), sonst `null` |
| `detailsSubmitted` (abgeleitet) | keine `currently_due`- und keine `past_due`-Einträge |
| `status` | siehe Regeln darunter — Adapter liefert vorerst nie `action_required` |

**Status-Regeln** (mit `awaiting_action_from`):

1. Karte `active` und kein Eintrag mit `awaiting_action_from = user` und Status `past_due` → `active`
2. sonst mindestens ein Eintrag mit `awaiting_action_from = user` → `in_progress`
3. sonst (nur Stripe am Zug oder keine Einträge) → `in_review`

**Fallback** (kein `awaiting_action_from` an den Einträgen): Karte `active` und kein `past_due` →
`active`; sonst `currently_due`/`past_due` → `in_progress`; sonst `in_review`
(Unterscheidung zu `in_review` dann nur über „keine fälligen Einträge“).

**1.2b-2 gilt weiter (angepasst):** Karte `active` und kein Nutzer-`past_due` → `active`,
auch wenn etwas `currently_due` ist (`requirementsPending = true`).

Account Sessions bleiben `POST /v1/account_sessions` mit `account_onboarding`.

### 5d (Fortsetzung) — Story 1.3b Oberfläche Onboarding (29.09.2026)

| # | Frage | Entscheidung |
|---|---|---|
| U1 | Ort | Neuer Abschnitt „Online-Zahlung“ in den Studio-Einstellungen (`Settings.tsx`, beim bestehenden Owner-/Admin-Bereich). Kein eigener Menüpunkt. |
| U2 | Sichtbarkeit | Owner: alles. Admin: nur Status lesen, keine Knöpfe. Lehrende/Teilnehmende: Abschnitt nicht sichtbar (Einstellungen ohnehin nur Admin/Owner). Plattform-Schalter aus: Abschnitt für alle unsichtbar (auf PROD beim Release). |
| U3 | Zustände | `not_started`, `in_progress`, `in_review`, `active`, `disconnected`. `action_required` erzeugt der Adapter nicht mehr; kommt er trotzdem, UI wie `in_progress`. |
| U4 | Einbettung | `@stripe/connect-js` und `@stripe/react-connect-js`, Komponente `ConnectAccountOnboarding`. `fetchClientSecret` → `payments-onboarding` `start`, `onExit` → `refresh`. Sprache `de`. Collection: `fields: 'eventually_due'`. |
| U5 | Kosten vorher | Im Zustand „nicht eingerichtet“ mit Rechenweg (Standardkarte EWR 1,5 % + 0,25 €; Premium/Firma 2,8 % + 0,25 €; Beispiel 15 €). Texte in `src/features/payments/paymentSetupCopy.ts`, Preise als Konstanten mit Hinweis „Stand 09/2026, Stripe-Listenpreis“. Omlify verlangt nichts zusätzlich. |
| U6 | Publishable Key | `VITE_STRIPE_PUBLISHABLE_KEY`. Auf DEV: beginnt der Key nicht mit `pk_test_`, Abschnitt nicht rendern und Hinweis loggen (kein Absturz). |
| U7 | Plattform-Schalter DEV | Skript `node scripts/dev/platform_flag.mjs on\|off` (nur DEV-Service-Role). |
| U8 | Grenz-Prüfung | Ausnahme nur `src/features/payments/StripeAccountOnboarding.tsx` für `@stripe/connect-js` / `@stripe/react-connect-js`. Kein anderer Stripe-Import in `src/`. |

**Fehlertexte der Schalter:** `TAX_SETTING_MISSING` → „Bitte hinterlege zuerst deinen Steuerstatus“ mit Link `#steuern`. `PROVIDER_NOT_READY` → „Dein Stripe-Konto ist noch nicht bereit.“ `PLATFORM_DISABLED` → Abschnitt ausblenden und neu laden. Sonst allgemeine Meldung, nie Stripe-Texte.

**DEV-Mock für Screenshots:** Query `?paymentSetup=<zustand>` nur mit `import.meta.env.DEV` (`not_started` \| `in_progress` \| `in_review` \| `active` \| `disconnected`).

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

---

## 8. Story 2.1b-a — Entscheidungen R1–R10 (29.09.2026)

Migrationen `20260929140000` (Enum) + `20260929140001` (Schema). Test `scripts/test/s2_1b_a_pending.mjs`.

| # | Frage | Entscheidung |
|---|---|---|
| R1 | Zählt `pending_payment` als belegter Platz? | Ja. |
| R2 | Grundregel Listen vs. Geld | Zählungen und Listen zeigen pending; Geld-Aktionen → `PAYMENT_PENDING`; A8 / pre_omlify blenden pending aus. |
| R3 | Ablaufgründe | Zwei: `promotion_expired` (Nachrücken) und `payment_expired` (Checkout); `hold_reason` ∈ {checkout, promotion}. |
| R4 | Ablauf | Nur Job jede Minute (`yogaflow_expire_payment_holds`). Kein Expire-on-read. Checkout (2.2) prüft `hold_expires_at > now()`. |
| R5 | Abmelden / Absage während pending | Platz sofort frei, Versuche → canceled, Nachrücken. `uncancel_course` stellt frühere pending nicht wieder her. |
| R6 | Studio trägt ein | Immer `registered`, nie `pending_payment` (nur Platzzählung angepasst). |
| R7 | Zentrale Platzzählung | `yogaflow_private.course_occupied_seats`; Client-Zählungen in 2.1b-b. |
| R8 | Verlauf Versuche | Zustand an der Zeile, GUC-Guard (Muster passes), Verlauf über Events. |
| R9 | `succeeded` | Nicht in diesem Schritt; Guard lehnt ab. Kommt in 2.2a mit `payments`-Zeile und Hauptbuch-`card`. |
| R10 | Helfer „Online wirksam an“ | Jetzt gebaut (`online_payments_effective` / `online_payment_required`), vorgezogen aus 2.2. |

**Hinweise:** P10-Helfer vorgezogen aus 2.2. Epic 2.1: Zustandsautomat für Online-Versuche liegt in `payment_attempts`, nicht in `payments` (Entscheidung 08 / Variante D).

---

## 9. Story 2.1b-b — Entscheidungen S1–S8, S6a–h, K3 (29.09.2026)

Umsetzung E2 (Nachrücken mit Zahlungspflicht). Migrationen `20260929150000` (B1), `20260929151000` (K3), `20260929160000` (B2). Edge Function `dispatch-emails`. Oberfläche ohne Bezahlen-Knopf.

| # | Frage | Entscheidung |
|---|---|---|
| S1 | Nachrücken bei Online-Pflicht? | Drei Fälle: ohne Online → `registered` (+ Karte bei Intent); Online + Karte eingelöst → `registered`+pass; sonst → `pending_payment`. |
| S2 | Hold-Frist Nachrücken? | `least(now()+12h, Kursbeginn−2h)` in Europe/Berlin (`promotion_hold_deadline`). |
| S3 | Frist schon abgelaufen? | Kein Nachrücken; Event `waitlist.promotion_skipped` / `TOO_CLOSE_TO_START`. |
| S4 | Glocke? | Typ `waitlist_promoted_payment_required`, Pfad `/my-registrations`, Aufforderung online zu bezahlen. |
| S5 | Listen / Geld? | Pending zählt und wird angezeigt (R2/R7); Geld-Aktionen → `PAYMENT_PENDING`. |
| S6a | Outbox? | Tabelle `email_deliveries`; `authenticated` ohne Zugriff; Löschen mit Person/Tenant (4.3). |
| S6b | Wann Outbox-Zeile? | Beim Promote zu `pending_payment` (`waitlist_promoted_payment_required`). |
| S6c | Claim / Mark? | Nur `service_role`. |
| S6d | Vor dem SMTP? | Skip `NOT_PENDING` / `RECIPIENT_GONE`. |
| S6e | Aufruf Versand? | `pg_net` → Edge Function `dispatch-emails`. |
| S6f | Takt? | Cron `yogaflow_dispatch_emails`. |
| S6g | Zustellung? | Mindestens einmal; Doppelzustellung bei Absturz nach SMTP akzeptiert. |
| S6h | Absender? | Global „Omlify“. |
| S7 | Bezahlen-Knopf in der App? | Nein → **2.2b**. |
| S8 | Abmelden bei pending? | Wortlaut „Platz freigeben“. |
| K3 | Helfer? | `promote_to_pending_payment`; Glockentext mit Frist. |
| E2 | Epic-Regel | Umgesetzt in `promote_from_waitlist` (Zahlungspflicht + Frist + Benachrichtigung). |

---

## 10. Entscheidung 09 – Checkout Karte (30.09.2026)

Story 2.2a-1: Schema und RPCs für Direct-Charge-Abschluss (ohne Stripe-API / Edge Function in diesem Schritt). Migration `20260930100000_s2_2a_1_online_payment.sql`.

| # | Frage | Entscheidung |
|---|---|---|
| C1 | Charge-Modell | PaymentIntent als Direct Charge; Payment Element (Web) bzw. PaymentSheet (App); ein Backend für beide. |
| C2 | Direktbuchung bei Online-Pflicht | Reservierung `pending_payment`, `hold_reason = checkout`, 15 Minuten. |
| C3 | Checkout-Sitzungen | Entfällt (nur für Checkout-Sitzungen). |
| C4 | Zahlung nach Ablauf | Platz frei → neue Buchung `registered` + `paid` (`RESTORED`); sonst Zahlung verbuchen und `payment.refund_required` (Erstattung löst Function in 2.2a-3/4 aus). |
| C5 | Hauptbuch `card` | Logisches Konto `psp_clearing` („Verrechnung Stripe“). Keine Gebühren in 1a → 1b. |
| C6 | `provider_customers` | Nicht bauen (überholt P5 „erst in 2.2a“). |
| C7 | Bestätigung | Glocke und Outbox-E-Mail (`payment_succeeded` / `payment_refunded`). |
| C8 | Karte vs. Online-Pflicht | `register_for_course` mit `p_use_pass = true` bleibt wie heute; nur ohne Karte greift die Online-Pflicht. |
| C9 | Referenz | Versuch und Zahlung tragen dieselbe Referenz `pi_…`. |
| C10 | Vor Bestätigen | Function prüft die Reservierung serverseitig (`check_before_confirm`). |
| C11 | Subdomain | Wird automatisch beim Studio-Konto registriert, sobald es aktiv ist; umgesetzt in 2.2a-3. |
| C12 | `acct_…`-Regel | Angepasst: `prepare_online_payment` liefert `account_ref` nur an `service_role` (Edge Function); Client bekommt die Referenz weiterhin nicht. |

### Port / Adapter (2.2a-2, 01.10.2026)

| # | Frage | Entscheidung |
|---|---|---|
| Q1 | Ablauf Bezahlen (C10) | Zwei Schritte auf dem Server: (1) PaymentIntent unbestätigt anlegen (Idempotency-Key = Versuchs-ID) → Function hängt die `pi_…` an den Versuch → (2) mit dem Confirmation Token aus dem Formular bestätigen. So gibt es nie einen PaymentIntent bei Stripe, den unsere Datenbank nicht kennt. |
| Q2 | Zahlungsarten | `payment_method_types: ['card']`. Apple Pay und Google Pay laufen über `card`. Kein Link, kein Klarna, kein SEPA (P3). Das Formular in 2.2b nutzt dieselbe Einstellung. |
| Q3 | Metadaten am PaymentIntent | `attempt_id`, `tenant_id`, `registration_id`. Keine Namen, E-Mails, Kurstitel. `description`: „Omlify Kursbuchung“ (fest). Kein `receipt_email` (C7). |
| Q4 | Status-Abbildung | `requires_payment_method` nach Fehlversuch → `failed` (mit `last_payment_error.code`); `requires_action` → `processing` + Rückgabe des `client_secret` nur für den 3-D-Secure-Schritt im Browser; `processing` → `processing`; `succeeded` → `succeeded`; `canceled` → `canceled`. |
| Q5 | `client_secret` | Wird nie gespeichert und nie geloggt. Nur einmal an den Browser zurückgegeben, wenn Stripe eine Aktion verlangt. |
| Q6 | Nachlesen (W3) | Webhook und Function verlassen sich nie auf den Event-Inhalt, sondern lesen über `retrievePayment` nach. |
| Q7 | Erstattung | Nur voll (C4), Idempotency-Key = `payment_id`. Teilerstattung kommt mit 3.2. |
| Q8 | Domain (C11) | `registerPaymentDomain(accountRef, domain)` legt die Domain beim Studio-Konto an (Stripe-Account-Header). Existiert sie schon → Erfolg (idempotent). |

### Edge Function Checkout (2.2a-3, 01.10.2026)

| # | Frage | Entscheidung |
|---|---|---|
| F1 | Aufbau | Eine Function `payments-checkout` mit drei Aktionen im Body: `prepare`, `confirm`, `status`. Muster wie `payments-onboarding`: `verify_jwt = false`, `initService` (Nutzer-JWT + `x-omlify-tenant`), dünnes `index.ts`, Logik in `handler.ts` mit injizierten Abhängigkeiten. |
| F2 | prepare | Eingabe: `registration_id`. → `prepare_online_payment`. Ohne `pi_…`: `createPaymentIntent` (Idempotency-Key = Versuchs-ID) → `attach_payment_ref`. Ältere failed/canceled Versuche mit `pi_…`: `cancelPaymentIntent` best effort. Rückgabe: `attempt_id`, `amount_cents`, `currency`, `hold_expires_at`, `account_ref` (für Stripe.js). Kein `client_secret`. |
| F3 | confirm | Eingabe: `attempt_id`, `confirmation_token`. → `check_before_confirm` → `confirmPaymentIntent` mit serverseitiger `return_url` (`https://{slug}.{APP_BASE_DOMAIN}/my-registrations?payment=return`, lokal mit `?tenant=`). Nie URL aus dem Browser. `succeeded` → `retrievePayment` + `complete_online_payment`; `failed` → `mark_online_payment_failed`; `requires_action` → `client_secret` einmalig. |
| F4 | status | Eingabe: `attempt_id`. Nach 3-D-Secure / Abfrage: `retrievePayment` → bei Erfolg `complete_online_payment`, bei Fehler `mark_online_payment_failed`. Rückgabe: Buchungsstatus + Versuchsstatus aus der DB. |
| F5 | Rechte | Mitglied des Studios aus dem Header; Buchung/Versuch gehört dieser Person. Sonst 403 `FORBIDDEN`. `account_ref` und Beträge nur aus der Datenbank. |
| F6 | Fehler an den Browser | Nur Codes: `HOLD_EXPIRED`, `NOT_PENDING`, `ONLINE_DISABLED`, `CARD_DECLINED`, `AUTHENTICATION_REQUIRED`, `PROVIDER_UNAVAILABLE` (HTTP 503), `FORBIDDEN`, `INVALID_REQUEST`. Keine Stripe-Texte. |
| F7 | Domain (C11) | In `payments-onboarding` beim `refresh`: Konto `active` → `registerPaymentDomain(accountRef, "{slug}.{APP_BASE_DOMAIN}")`. Idempotent, Fehler nur loggen. DEV-Skript `scripts/dev/register_payment_domain.mjs <slug>`. |
| F8 | Logs | `createServiceLogger`: Aktion, `attempt_id`, `pi_…`, Ergebnis-Code. Nie `client_secret`, Confirmation Token, `acct_…`, E-Mail. |

### Provider-Jobs Outbox (2.2a-4, 01.10.2026) — gelten für 4a–4c

| # | Frage | Entscheidung |
|---|---|---|
| W1 | Wer spricht mit Stripe, wenn SQL etwas auslöst? | Outbox wie bei E-Mails (S6): Tabelle `provider_jobs`. SQL legt Aufträge an, Cron jede Minute → `pg_net` → Function `payments-jobs`. Träger für Ablauf-Job, `remove_member` und `complete_online_payment` (SQL erreicht Stripe nicht selbst). Auftrag in derselben Transaktion geht nicht verloren. |
| W2 | Abbrechen offener PaymentIntents | Eine Stelle: Trigger auf `payment_attempts`. Statuswechsel auf `failed`/`canceled` mit `provider_ref` und ohne `payment_id` → Auftrag `cancel_payment_intent`. Deckt Ablauf, SUPERSEDED, Ablehnung, MEMBER_REMOVED. Direkter Abbruch in prepare (F2) entfällt in 4b. |
| W3 | Automatische Erstattung (C4) | `complete_online_payment` legt bei `REFUND_REQUIRED` denselben Transaktions-Auftrag `refund_payment` an (eindeutig je `payment_id`). Job erstattet voll (Idempotency-Key = `payment_id`, Q7) und ruft `record_online_refund`. Gebucht sobald Stripe die Erstattung annimmt (`pending`/`succeeded`). `refund.failed` → 3.2. |
| W4 | Wiederholen | Rückoff 1 · 5 · 15 · 60 Min., danach stündlich, höchstens 10 Versuche → `failed` + Log `provider_job.failed`. Abholen mit `FOR UPDATE SKIP LOCKED`; `running` länger als 10 Min. darf neu abgeholt werden. |
| W5 | Personen entfernen | Versuch mit `provider_ref` → anonymisieren statt löschen. Aktive Versuche → `canceled`/`MEMBER_REMOVED` → W2 legt Cancel an. Versuche mit `pi_…` nie löschen. |
| W6 | Haltefelder | `COMPLETED` leert `hold_expires_at`/`hold_reason` nicht mehr (Verlauf). Leser filtern nach Status, nicht nach „Haltefeld gesetzt“. |
| W7 | Webhook (4b) | Jedes `payment.updated` → `retrievePayment` (Q6) → `complete_online_payment` / `mark_online_payment_failed`. Beide Ziele; Doppelte fängt Idempotenz über `pi_…`. Unbekannte `pi_…` mit `succeeded` → Log `payment.orphan`, 200. Vorübergehende Fehler → 500. |
| W8 | Antwort von `payments-checkout` (4b) | Geschäftscode durchreichen (`COMPLETED`, `RESTORED`, `REFUND_REQUIRED`, `ALREADY_COMPLETED`). Text in 2.2b für `REFUND_REQUIRED`: „Zahlung eingegangen, aber der Platz war inzwischen vergeben. Du bekommst den Betrag automatisch zurück.“ |
| W9 | Bestätigung (4b) | RPCs bleiben einzige Schreiber von Glocke und Outbox (D15). `dispatch-emails` lernt `payment_succeeded` und `payment_refunded` mit eigener Gültigkeitsprüfung. Bei `REFUND_REQUIRED` keine Erfolgs-Mail, nur Erstattungs-Mail nach `record_online_refund`. |
| W10 | Schnitt | 4a Datenbank → 4b Functions (`payments-jobs`, Webhook-Zweig, Checkout-Codes, E-Mails) → 4c Deploy + Rauchtests. Jeweils STOPP. |

### Edge Functions Outbox / Webhook / Checkout / E-Mails (2.2a-4b, 01.10.2026)

| # | Frage | Entscheidung |
|---|---|---|
| J1 | Aufruf `payments-jobs` | Wie `dispatch-emails`: `verify_jwt = false`, Prüfung eines geteilten Secrets. Vault `provider_jobs_secret` = Function-Secret `PROVIDER_JOBS_SECRET`. Cron sendet `Authorization: Bearer …` (Migration 4a); Vergleich mit konstanter Zeit. Ohne gültiges Secret → 401, nichts tun. Nur POST. |
| J2 | Ablauf je Lauf | `claim_provider_jobs(20)` → Aufträge nacheinander → `finish_provider_job`. Zeitbudget ca. 25 s: danach keine neuen Aufträge anfassen; nicht angefasste mit `retry` zurückgeben. |
| J3 | `cancel_payment_intent` | `cancelPaymentIntent(accountRef, pi)`. Ergebnis `canceled` → `done`. Ergebnis `succeeded` (doch bezahlt) → `retrievePayment` + `complete_online_payment` (idempotent: RESTORED/REFUND_REQUIRED/ALREADY_COMPLETED) → `done`, Log `provider_job.cancel_too_late`. |
| J4 | `refund_payment` | `refundPayment({ accountRef, ref: pi, idempotencyKey: payment_id })` → `pending`/`succeeded` → `record_online_refund(payment_id, re_…, Betrag, jetzt)` → `done` (`ALREADY_REFUNDED` ebenfalls `done`). `failed` → `failed` + Log. |
| J5 | Fehler → Ergebnis | `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, DB vorübergehend → `retry`. `NOT_FOUND`, `INVALID_REQUEST`, Konto fehlt/getrennt → sofort `failed`. Unerwartet → `retry` mit Code `UNEXPECTED`. |
| J6 | Webhook `payment.updated` (W7) | Versuch über `(stripe, pi_…)`. Mandanten-Schutz: Event-Konto = Stripe-Konto genau des Studios des Versuchs; sonst Log `payment.account_mismatch`, 200, nichts. Dann `retrievePayment` (Q6): `succeeded` → `complete_online_payment` · Fehlversuch → `mark_online_payment_failed(pi, code)` · `canceled` → `mark_online_payment_failed(pi, 'CANCELED', 'canceled')` · `processing`/`requires_action` → nichts. Bereits beendet → no-op. |
| J7 | Unbekannte `pi_…` | Kein Versuch: bei `succeeded` → Log-Fehler `payment.orphan` (mit `pi_…`, ohne `acct_…`), sonst Info. Immer 200. |
| J8 | Antwortcodes Webhook | Vorübergehende Fehler (Stripe/DB) → 500. Fachliche Ergebnisse → 200 + `markProcessed`. |
| J9 | `payments-checkout` | `confirm` und `status` geben zusätzlich `code` aus `complete_online_payment` zurück (`COMPLETED`, `RESTORED`, `REFUND_REQUIRED`, `ALREADY_COMPLETED`). Direkter Abbruch älterer PaymentIntents in prepare (F2) entfällt (W2 übernimmt das über den Trigger). |
| J10 | E-Mails (W9) | `dispatch-emails` lernt `payment_succeeded` und `payment_refunded`. Gültigkeit: `payment_succeeded` nur bei Buchung `registered`/`paid` und Zahlung nicht erstattet; `payment_refunded` nur, wenn die Erstattung existiert. Sonst `skipped` mit Code. Promotion unverändert. |

**E-Mail-Texte (Du-Form)**

- **payment_succeeded** — Betreff: „Zahlung eingegangen – dein Platz ist sicher“. Text: „Deine Zahlung über {Betrag} für „{Kurs}“ am {Datum} um {Uhrzeit} ist eingegangen. Dein Platz ist gebucht.“ Knopf „Meine Anmeldungen“.
- **payment_refunded** — Betreff: „Zahlung erstattet“. Text: „Wir haben dir {Betrag} für „{Kurs}“ am {Datum} erstattet.“ Bei bekanntem Grund `REFUND_REQUIRED` davor: „Dein Platz war leider inzwischen vergeben.“ Danach: „Je nach Bank dauert die Gutschrift einige Werktage.“
- Beträge deutsch (`24,00 €`), Zeiten Europe/Berlin. Studioname/Branding wie Nachrücker-Mail. Keine Kartendaten, keine `pi_…`.

### Story 2.2b — Bezahlformular (01.10.2026), Z1–Z13

| # | Frage | Entscheidung |
|---|---|---|
| Z1 | Form | Sheet über der Seite (mobil von unten, Desktop mittig), Muster `PassBookChoiceDialog`. Keine eigene Route. |
| Z2 | Nach dem Buchen | Bei `pending_payment` öffnet sich das Sheet sofort. Nie „Erfolgreich angemeldet.“ Client-Typ um `status`, `registration_id`, `hold_expires_at` (RPC liefert sie schon). |
| Z3 | Knopf „Jetzt bezahlen“ | Primär in Meine Anmeldungen und Kursdetail; Kursliste/Dashboard nur Status. |
| Z4 | Ablauf im Sheet | prepare → loadStripe(pk, { stripeAccount }) → Payment Element deferred → Confirmation Token → confirm → ggf. handleNextAction → status. |
| Z5 | 3-D-Secure-Rückkehr | `attempt_id` in sessionStorage je Buchung; `/my-registrations?payment=return` ruft status. |
| Z6 | processing | Poll alle 3 s, max. 60 s; danach Timeout-Text, Sheet schließbar. |
| Z7 | Frist im Sheet | Text mit Uhrzeit und Restminuten; nach Ablauf HOLD_EXPIRED, Knopf gesperrt. |
| Z8 | Schlüssel-Sperre | `VITE_PAYMENTS_MODE` (test/live) + Key müssen passen; sonst ausgeblendet. Zentral `paymentsClientConfig()`. |
| Z9 | Grenze | `@stripe/stripe-js` / `@stripe/react-stripe-js` nur in `StripePaymentForm.tsx`; Boundary-Ausnahme. |
| Z10 | C8 bei Online-Pflicht + Karte | „Mit deiner Karte …“ oder „Online bezahlen“; „Vor Ort“ entfällt. |
| Z11 | Doppelklick | busy sperrt Knopf und Schließen während confirm/handleNextAction. |
| Z12 | Owner-Anzeige | `method = card` → „online“ (Umsetzung 2.2b-2). |
| Z13 | RPC | `public.booking_payment_options()` → nur `{ online_required }`; Migration `20261001120000`. |

**Texte:** `src/lib/paymentTexts.ts` (Titel „Online bezahlen“, Betragsknopf, Stripe-Hinweis, Codes inkl. REFUND_REQUIRED / HOLD_EXPIRED / …).

---

## 11. Entscheidung 10 – Online-Erstattung (02.10.2026)

Gilt vor Online-Zahlung auf PROD (R10). Story-Schnitt: **3.2a** Schema/RPCs (diese Migrationen), **3.2b** Edge/Webhook/E-Mail, **3.2c** UI-Texte.

| # | Entscheidung |
|---|---|
| R1 | Teilnehmerin bekommt immer den vollen Betrag zurück; das Studio trägt die Stripe-Gebühr (24 € → 0,61 €). |
| R2 | Automatisch voll (Restbetrag) erstatten bei: Kursabsage durch das Studio · Selbstabmeldung vor `cancellation_deadline` · Abmeldung durch das Studio (fristunabhängig) · Person entfernen (künftige online bezahlte Buchungen). |
| R3 | Selbstabmeldung nach der Frist: nichts zurück; der Dialog sagt es vorher (3.2c). |
| R4 | Manuelle Erstattung in Omlify: Owner/Admin (nicht Lehrende), voll oder Teilbetrag, Pflichtgrund. Summe aller Erstattungen ≤ Zahlungsbetrag. |
| R5 | Erstattungen aus dem Stripe-Dashboard werden per Webhook nachgebucht, auch Teilbeträge (3.2b). |
| R6 | Disputes: speichern, Glocke an Owner/Admin, „Rückbuchung offen“; Hauptbuch dafür mit 1b. |
| R7 | Fehlgeschlagene Erstattung: Status failed, Glocke an Owner/Admin, erneut möglich. |
| R8 | Erstattung = eigener Datensatz mit Betrag und eigenem Idempotency-Key; mehrere je Zahlung; gilt auch für die Auto-Erstattung aus W3 (`REFUND_REQUIRED`). |
| R9 | Teilnehmende sehen „Erstattung läuft“ / „Erstattet (24,00 €)“ / „Teilweise erstattet (10,00 € von 24,00 €)“ (3.2c). |
| R10 | R1–R9 vor Online-Zahlung auf PROD; 3.1 direkt danach. |

**H5' (ersetzt H5, Freigabe 02.10.2026):** Gegenbuchung anteilig je Seite (Soll/Haben): Zeile × Erstattung ÷ Seitensumme, kaufmännisch gerundet (H8); Rundungsrest auf die betragsgrößte Zeile der Seite, Summe = Erstattung. Erreicht die Summe aller Gegenzeilen den Originalbetrag, bucht diese Gegenbuchung exakt „Originalzeilen minus bereits gebuchte Gegenzeilen“ (Abschluss). Abschluss nur, wenn alle früheren Gegenbuchungen derselben Zahlung schon gebucht sind, sonst waiting. Vollerstattung in einem Schritt = Abschluss = bisheriges Spiegeln.

**Umsetzung 3.2a (DEV 02.10.2026):** Migrationen `20261002110000`…`20261002114100` auf DEV. Tabelle `payment_refunds` / `payment_disputes`; `request_refund` + Trigger auf Soft-Cancel; `record_online_refund` mit `refund_id`; Hauptbuch H5'; Test `scripts/test/s3_2a_refunds.mjs` grün.

**Umsetzung 3.2b (DEV 02.10.2026):** Edge Functions + Port deployed (`payments-jobs`, `payments-webhook`, `dispatch-emails`). Rauchtest F1–F4/F6 grün; F5 Dispute-Webhook angehalten (siehe `docs/berichte/3_2ab_erstattung.md`).

| # | Entscheidung (E1–E7) |
|---|---|
| E1 | `refundPayment({ accountRef, ref: pi, amountCents, refundId, idempotencyKey: refundId, tenantId, paymentId })` → Stripe `refunds.create({ payment_intent, amount, metadata: { refund_id, tenant_id, payment_id } })`. Kein reason-Freitext an Stripe. |
| E2 | `payments-jobs`: Betrag und `refund_id` aus `claim_provider_jobs`. pending/succeeded → `record_online_refund(..., refund_id)` → done. failed oder Stripe `INVALID_REQUEST`/`NOT_FOUND` → `mark_refund_failed` → failed. Vorübergehend → retry (J5). |
| E3 | Webhook Erstattungen: `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed` → `listRefunds` → je Erstattung `record_online_refund` / `mark_refund_failed`. Mandanten-Schutz wie J6. Idempotent über `re_…` und `refund_id`. |
| E4 | Webhook Disputes: `charge.dispute.created/updated/closed` → `retrieveDispute` → `record_payment_dispute`. Kein Hauptbuch. |
| E5 | E-Mail `payment_refunded`: Betrag + Grund-Satz je reason; Teilerstattung „10,00 € von 24,00 €“; Bank-Hinweis unverändert. |
| E6 | Owner-Glocken: Erstattung fehlgeschlagen / neuer Dispute nur Glocke (keine E-Mail). Texte: „Eine Erstattung über X,XX € ist fehlgeschlagen. Du kannst sie erneut anstoßen.“ · „Rückbuchung offen: Eine Kartenzahlung wurde bei Stripe bestritten.“ |
| E7 | Pause-Schalter: `node scripts/dev/provider_jobs_secret.mjs --pause` leert Vault `provider_jobs_url` (Cron loggt nur); `--resume` setzt URL wieder. Nur DEV. |

Pfade: `supabase/functions/_shared/payments/{port,stripe/adapter,fake/adapter}.ts`, `payments-jobs/{handler,store}.ts`, `payments-webhook/{handler,store}.ts`, `dispatch-emails/{handler,index}.ts`, `scripts/dev/provider_jobs_secret.mjs`.