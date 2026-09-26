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
3. **Altzeilen auf PROD:** Inventur vor A1: 8 Zeilen mit `cancellation_timestamp` vor Kursbeginn (5 `registered`, 3 `waitlist`). Nach Datei 2 → alle `cancelled` / `legacy_closed`. Erwartung per `GROUP BY status, cancel_reason` prüfen.
4. **A1 geht nicht allein auf PROD.** Frühestens zusammen mit **A9** (Kurs absagen): Kurse mit Stornierungen lassen sich sonst weder löschen (`RESTRICT`) noch absagen.

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
- **Kein Beleg für Barzahlungen** (E14). Hinweistext einmal im Studio sichtbar
- Funktioniert ohne Stripe und ohne aktivierte Online-Zahlung (B2, B3)

**Akzeptanz:** Vermerk bar → Zahlung, Event, Audit, Deckung `paid`. Gegenzeile → Deckung `open`, beide Zeilen
bleiben. Lehrerin in fremdem Kurs → Fehler. `amount` im Request eines `teacher` wird ignoriert (curl).
**Schema → Freigabe. STOPP.**

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

**Akzeptanz:** Kartenverkauf 150 € bar, Studio regulär 19 %: Rechenweg im Bericht (150 € / 1,19 = 126,05 €
netto, 150 € − 126,05 € = 23,95 € USt) → Zeilen `cash` 150,00 Soll · `revenue_standard` 126,05 Haben ·
`vat_output` 23,95 Haben. Einlösung → keine Zeile. Doppelte Verarbeitung desselben Events → Zeilen genau
einmal. **Schema → Freigabe. STOPP.**

### A8 — Teilnehmerliste mit Deckung (Design-Story)
*Als Lehrerin möchte ich fünf Minuten vor dem Kurs sehen, wer offen ist, und es mit einem Tipp erledigen.*

- Je Person: offen · bar · PayPal · Überweisung · Karte (Rest n) · erlassen. Nicht allein über Farbe
- Schnellaktionen: „bar“, „PayPal“, „mit Karte“ (wenn gültige Karte vorhanden), „Karte verkaufen“ (wenn E13 es
  erlaubt)
- `owner`/`admin`: Übersicht „Offene Beträge“ (Summe je Kurs, je Person), Sammelaktion „erledigt vor Omlify“
  für vergangene Kurse
- Grundlage `docs/DESIGNSYSTEM.md`. **Zustände zuerst festlegen, dann gestalten.** Design-Commits getrennt

**Akzeptanz:** Screenshots aller Deckungszustände, mobil und Desktop. **STOPP.**

### A9 — Kurs absagen (ohne Online-Erstattung)
*Als Studio möchte ich einen Kurs absagen, statt ihn zu löschen.*

- `courses.status = 'canceled'` über RPC. Alle aktiven Anmeldungen → `cancelled` mit `course_cancelled`
- Karteneinlösungen → automatisch zurückgebucht
- Bar/PayPal-Vermerke → **nicht** automatisch erstattet. Das Studio sieht die Liste „diese Personen haben bar
  bzw. per PayPal bezahlt“ und vermerkt die Rückgabe als Gegenzeile
- Benachrichtigung über das bestehende `send-email`
- Online-Erstattung ergänzt später **3.2**
- Die Übergabe-oder-Absage-Logik beim Entfernen einer Lehrerin (3.2) nutzt dieses RPC

**Akzeptanz:** Kurs mit je einer Buchung „Karte“, „bar“, „offen“ absagen → Karte +1, Bar-Liste angezeigt, alle
drei informiert, Kurs in allen Listen als abgesagt. **STOPP.**

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
- **3.2:** Nutzt A9, ergänzt die Online-Erstattung
- **4.2:** Belege für Kartenverkauf und Kursbuchung per Überweisung/PayPal/online. **Nicht für bar** (E14)
- **4.3 (Löschen/Aufbewahren):** FKs von `passes`, `pass_movements` ebenfalls `RESTRICT`
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
| **E13** | Dürfen Lehrende Karten verkaufen? | **Empfehlung: ja**, zum Listenpreis, ohne Rabatt, nur mit Zahlungsvermerk. In Studios verkauft meist die Lehrerin im Kurs. Bei Solo-Lehrenden ist `owner` = Lehrerin ohnehin | offen, Julius |
| **E14** | Barbeleg aus Omlify? | **Nein, nur Vermerk** (Abschnitt 3) | entschieden 21.09. |
| **E15** | Rechte der Lehrenden bei Deckung | Vermerk bar/PayPal/Überweisung und Einlösen **nur in eigenen Kursen**, Betrag vom Server, keine Korrektur, kein `waived`, keine Studio-Übersicht der Beträge | entschieden 21.09. |
| **E16** | Gültigkeit von Karten | Studio setzt sie. Standard „3 Jahre zum Jahresende“, Hinweis unter 12 Monaten. Rechtsprüfung im Rechts-Epic | entschieden 21.09. |
| **E17** | Einheit bei Absage auf abgelaufene Karte | Hinweis ans Studio, Studio entscheidet per `manual_adjustment` | entschieden 21.09. |
| **E17b** | Ist- oder Soll-Versteuerung im Hauptbuch | **Ist** (nur Zahlungseingänge) in 1a, Einstellung je Studio in 1b | entschieden 21.09. |
