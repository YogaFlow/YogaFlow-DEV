# Bericht K1 — Karten online kaufen, „Meine Karten“, Widerruf

Status: **angehalten** (Haltestelle 5 — Klicktest Nachtrag Widerruf).  
Stand 05.10.2026 · Branch `Julius` · HEAD siehe `git log -1`  
Vorgabe: [docs/stories/k1_karten_online.md](../stories/k1_karten_online.md) · [Nachtrag Widerruf](../stories/nachtrag_k1_widerruf.md) · [Entscheidung 15](../entscheidungen/15_Karten_online.md) · Freigabe Teil 0: [k1_freigabe_teil0.md](../stories/k1_freigabe_teil0.md)

---

## Teil 0 — Inventur (nur lesen)

### Kurzfazit

Kartenverkauf läuft heute **nur vor Ort** (`sell_pass` → `payments.subject_type='pass_purchase'` → Pass + Movement `purchase` → Ledger `sale_kind='pass'`). Einlösen/Zurückbuchen ändert nur `pass_movements` und die Buchungsdeckung, **kein** Geld im Hauptbuch.

Der Online-Pfad (Attempts, Checkout, Webhook→`complete_online_payment`, Hold-Expiry, Belege, Zahlungs-Mails) ist **fest auf `registration` verdrahtet**. Polymorphie existiert schon auf **`payments`** (`registration` | `pass_purchase`) und im Ledger (`course` | `pass`, `card` → `psp_clearing`) — **nicht** auf `payment_attempts`, Belegen und der Checkout-Kette.

Online-Kartenkauf-Code: **keiner**.

---

### A — Karten heute (A4–A7)

#### Tabellen

| Tabelle | Rolle | Wichtige Spalten |
|---|---|---|
| `pass_products` | Stammdaten | `name`, `units` 1–100, `price_cents` ≤ 1_000_000, `validity_rule` (`years_to_year_end`\|`months`), `validity_value`, `archived_at` — **kein** `online_purchasable`, **keine** Beschreibung |
| `passes` | Verkaufte Karte | Snapshot vom Produkt; `valid_from`/`valid_until`; `payment_id` UNIQUE; `status` active\|expired\|revoked; Rest = Summe Movements |
| `pass_movements` | Append-only | `delta`, `kind` purchase\|redeem\|redeem_reversal\|expire\|revoke\|manual_adjustment; bei redeem: `registration_id` |
| `payments` | Geld | bei Kasse: `subject_type='pass_purchase'`, `subject_id=pass.id`, `registration_id NULL`, `provider=manual` |
| `registrations` | Einlösung | `pass_id`, `coverage_status='pass'`, `coverage_intent` |
| `courses.pass_eligible` | Buchbarkeit mit Karte | DEFAULT true |

Gültigkeit (`pass_valid_until`, A5): `months n` → Kaufdatum + n Monate; `years_to_year_end n` → 31.12.(Kaufjahr+n).

#### RPCs

| RPC | Zweck | Quelle |
|---|---|---|
| `create/update/set_pass_product_archived` | Produkte | A4 `20260927183209` |
| `sell_pass(member, product, method)` | Vor-Ort-Verkauf cash\|bank\|paypal_manual | A5 `20260927213000` ~544–774 |
| `revoke_pass` | Unbenutzte Karte stornieren + Payment-Gegenzeile | A5 ~790–977 |
| `get_member_passes` / `get_sellable_pass_products` | Lesen | A5 |
| `pick_pass_for_registration` / `redeem_pass` / `reverse_redemption` | Einlösen privat | A6-1 |
| `register_for_course(…, p_use_pass)` / `apply_pass_to_registration` / `undo_pass_redemption` | Buchung mit Karte | A6-2 (+ Folgefassungen) |
| `unregister_*` / Kursabsage | Rückbuchung Termin | A6-3 |
| `adjust_pass_units` | ±Einheiten mit Pflichtgrund | A6-3 — **kein** Verlängern von `valid_until` |
| `expire_passes` | Cron stündlich; Rest → `expire`; Event `pass.expiring` bei **14 Tagen** | A6-3 |
| `process_ledger` | bucht `payment.recorded`/`reversed` | A7 |

#### Flows

**Vor-Ort-Verkauf**

```
sell_pass → payments(pass_purchase, manual, method)
         → passes(active, Snapshot, valid_*)
         → events payment.recorded + pass.purchased
         → pass_movements purchase +units
         → (Cron) process_ledger → sale_kind=pass
              Soll: cash|bank|paypal_clearing
              Haben: revenue_* (+ vat_output)
```

**Kurs mit Karte**

```
register_for_course(p_use_pass) → pick (FOR UPDATE, frühester Ablauf)
  → redeem −1 → coverage=pass → event pass.redeemed
```

Kein Ledger bei Einlösung (H4).

**Rückgabe / Storno**

| Fall | Movement | Ledger |
|---|---|---|
| Abmelden in Frist / Studio / Absage / undo | `redeem_reversal` +1 | nein |
| `revoke_pass` (unbenutzt) | `revoke` −Rest + Payment-Gegenzeile | ja |
| `adjust_pass_units` | `manual_adjustment` | nein |
| `expire_passes` | `expire` −Rest | nein |

#### UI heute

| Ort | Datei | Stand |
|---|---|---|
| Einstellungen › Karten | `PassProductsSection` / `PassProductDialog` | Name, Termine, Preis, Gültigkeit — Default UI: **Jahresende / 3 Jahre**, nicht 12 Monate |
| Kasse „Karte verkaufen“ | `CourseCheckout` + `SellPassDialog` | nur manual methods |
| Personen › Karten | `MemberPassesSection` | Verkauf, Storno, Korrektur |
| „Meine Karten“ | `MyPassesSection` in **Meine Anmeldungen** | Anzeige + Verlauf; kein Kauf, kein Widerruf, **kein** eigener Menüpunkt |
| Mit Karte buchen | `useCourseEnrollment` / Zahlungswege ZW-1 | wie heute |

#### Ledger & Online-Konto

- `ledger_sale_kind('pass_purchase')` → `'pass'` (A7)
- `ledger_money_account('card')` → `'psp_clearing'` (2.2a-1)
- H5' Teilerstattung anteilig je Ledger-Seite: **bereits umgesetzt** für `payment_refunds` — passt fachlich zu Wertersatz/Kulanz, sobald eine Online-`pass_purchase`-Zahlung existiert

---

### B — Online-Zahlung heute (fest auf Registration)

#### Schema-Kopplung

| Schicht | Polymorph? | Stand |
|---|---|---|
| `payments.subject_type` / `subject_id` | ja | `registration` \| `pass_purchase` |
| `payment_attempts` | **nein** | CHECK nur `'registration'`; Spalte `registration_id`; **kein** `subject_id` (`20260929140001` ~276–279) |
| Stripe-Metadaten / Port | **nein** | `CreatePaymentIntentCommand.registrationId` Pflicht (`port.ts` 46–53); description „Omlify Kursbuchung“ |
| `receipts` | indirekt | nur über `payment_id`; Snapshot kursbezogen; Gate `subject_type='registration'` (`20261004122000` ~33–37) |
| `email_deliveries` | **nein** | `registration_id NOT NULL`; kinds: waitlist / `payment_succeeded` / `payment_refunded` |
| `payment_refunds.reason` | — | kein `withdrawal` (nur course_cancelled, self_cancel_in_window, staff_unregister, member_removed, late_payment, manual, provider_dashboard) |

#### Checkout-Kette (Kurs)

```
register → pending_payment + Hold 15 Min
  → PaymentSheet(registrationId)
  → payments-checkout prepare { registration_id }
  → prepare_online_payment / create_payment_attempt
  → PI metadata.registration_id
  → confirm (check_before_confirm: Hold + Status)
  → Webhook → complete_online_payment
       → payments(subject=registration) + Reg→registered/paid
       → Beleg + Outbox payment_succeeded (Kurs-Text)
```

Hold-Expiry: Cron `expire_payment_holds` nur auf `registrations.pending_payment`.

#### Was für Online-Karten **schon passt**

- `payments` CHECK inkl. `pass_purchase` + `registration_id IS NULL`
- Ledger `sale_kind=pass` + Geldkonto `psp_clearing` bei `method=card`
- `get_studio_payments` join auf Pass bei `pass_purchase`
- Preisgrenze-Konstante `ONLINE_AMOUNT_LIMIT_CENTS = 25000` (`legalCheckoutTexts.ts`)
- Checkout-UI-Komponente existiert (müsste Subject bekommen)
- Einlösen/Buchen mit Karte unverändert wiederverwendbar nach Kauf

---

### C — Lücken gegenüber Story K1

| Story | Heute | Lücke |
|---|---|---|
| A Online kaufbar | — | Spalte/Schalter + Guard (Online bereit ∧ ≤ 250 €) |
| A Beschreibung 140 | — | Spalte |
| A Vorbelegung 12 Monate | UI Default Jahresende/3 J. | Default auf `months=12` stellen (K3) |
| B Menü „Meine Karten“ | Abschnitt in Meine Anmeldungen | eigener Menüpunkt + Sichtbarkeitsregel K10 |
| B Kauf / Widerruf-UI | — | neu |
| C Checkout für Produkt | nur Registration | Attempt + Sheet + Port generalisieren |
| C Pflicht-Häkchen Sofortnutzung | — | Nachweis speichern (nicht AVV-`legal_acceptances`) |
| D Beleg Kartenkauf | Gate nur registration | `issue_receipt_for_payment` + Snapshot-Text |
| D Mails Karte/Ablauf/Widerruf | nur Kurs-Zahlungsmails; Event `pass.expiring` 14 Tage ohne Mail-Kind | Outbox kinds + `registration_id` lockern; Cron 30/7 |
| D Widerruf-Erstattung | Reasons ohne `withdrawal` | Reason + RPC + Entwertung |
| E öffentliche `/widerruf` | — | Route + Lookup Beleg+E-Mail |
| F Kursdetail-Hinweis | — | neu |
| K4 Verlängern | nur `adjust_pass_units` (Einheiten) | neues RPC: `valid_until` + Notiz + Verlaufseintrag |
| K9 Kulanz entwertet Rest | Erstatten-Knopf existiert; entwertet Pass **nicht** | bei Erstattung auf `pass_purchase` Rest entwerten |

---

## Vorschlag: „Zahlung für eine Karte“ einhängen

### Leitidee

**Kein Pending-Pass vor Zahlung.** Attempt zeigt auf das **Produkt** (wie Registration beim Kurs die Buchung ist). Erst `complete_*` legt atomar an: `payments(pass_purchase)` + `passes` + Movement `purchase` + Zustimmung + Beleg + Mail. Doppelter Webhook: gleiche Idempotenz wie heute über Attempt→`payment_id` / Unique `passes.payment_id`.

Kein Platz-Hold nötig (keine Kapazität). Stale Attempts: PI cancelen + Attempt `canceled` (Timeout analog 15 Min oder kürzer — Entscheidung offen, siehe Fragen).

### Ziel-Flow

```
Teilnehmerin wählt Produkt (online_purchasable, ≤250€, Studio online bereit)
  → Pflicht-Häkchen Sofortnutzung (Client; Server prüft Flag + speichert Textfassung)
  → prepare_pass_online_payment(product_id)
       → payment_attempts(subject_type='pass_product', subject_id=product_id,
                          registration_id NULL, amount=product.price_cents)
       → PI: metadata subject_type/subject_id/member_id; description „Omlify Kartenkauf“
  → gleiches Payment Element / PaymentSheetView (Subject statt nur registrationId)
  → confirm (Betrag + Produkt noch kaufbar + Zustimmung gesetzt)
  → Webhook/Jobs → complete_pass_online_payment(attempt)
       → payments(pass_purchase, stripe, card, subject_id=NEUE_pass.id)
       → passes + movement purchase (Logik aus sell_pass extrahieren/teilen)
       → receipt (service_text Kartenleistung)
       → email_deliveries kind pass_purchased (+ Beleg-Link, Widerrufshinweis)
       → (Cron) process_ledger → psp_clearing / revenue_* / sale_kind=pass
```

**Widerruf**

```
withdraw_pass / confirm_pass_withdrawal(pass|beleg+email)
  → genutzte = units_total − remaining (nur redeem − reverse)
  → wertersatz_cents = price_cents / units_total * genutzte  (kaufmännisch; Rest auf Cent)
  → refund_cents = price_cents − wertersatz
  → Pass entwerten (revoke-ähnlich für Rest; status revoked; movement)
  → payment_refunds(reason='withdrawal', amount=refund_cents) → bestehender Job/Webhook
  → Ledger H5' anteilig
  → Mail Eingangsbestätigung sofort; später Erstattungsmail
```

Kulanz nach Frist: bestehender Owner-Erstatten-Pfad + neuer Hook „bei `pass_purchase`-Erstattung Resttermine entwerten“.

### Stellenliste (Hook-Punkte)

#### Schema / SQL

1. `pass_products` — `online_purchasable boolean`, `description text` (≤140), Guards in create/update
2. `payment_attempts` — CHECK um `'pass_product'`; Spalte `subject_id uuid`; Unique „ein aktiver Attempt pro (member, subject)“; `registration_id` nur bei registration
3. `create_payment_attempt` — Überladung/Zweig Betrag aus Produktpreis
4. `prepare_pass_online_payment` / `check_before_confirm_pass` — neu (oder generisches prepare mit Subject)
5. `complete_pass_online_payment` — neu; Pass-Anlage aus `sell_pass`-Kern teilen (`yogaflow_private.fulfill_pass_purchase`)
6. Attempt-Expiry für Pass-Attempts (ohne Registration-Hold)
7. `payment_refunds.reason` + `'withdrawal'`
8. `withdraw_pass` / öffentliche Lookup-RPC (Belegnummer + E-Mail, verrät nichts bei Missmatch)
9. `extend_pass(pass, new_until, note)` — Owner/Admin; Movement/Event für Verlauf (neues `kind` oder `manual_adjustment` mit Code — siehe Frage)
10. `issue_receipt_for_payment` + Trigger + Retry + RLS — Zweig `pass_purchase`; Snapshot ohne Kurs
11. `email_deliveries` — `registration_id` nullable; `pass_id` oder `subject_*`; neue kinds (`pass_purchased`, `pass_expiring_30`, `pass_expiring_7`, `pass_units_low`, `pass_withdrawal_received`, `pass_withdrawal_refunded`)
12. `expire_passes` / neuer Job — Mails 30/7 statt nur Event Tag 14; Mail „Noch 1 Termin“ einmal
13. Kulanz-Hook: bei Refund auf `pass_purchase` Rest entwerten (auch `manual`)
14. Nachweis Sofortnutzung: eigene append-only Tabelle oder Spalten an `passes`/`payments` (Zeit + Textfassung + Hash)

#### Edge / Provider

15. `CreatePaymentIntentCommand` — `registrationId` optional; `subjectType` + `subjectId` (+ member)
16. Stripe-Adapter — Metadata/Description je Subject
17. `payments-checkout` prepare/confirm — Body akzeptiert Pass-Produkt
18. `payments-webhook` / `payments-jobs` — Complete-Zweig über Attempt.subject_type (Jobs bleiben payment-zentriert)
19. `dispatch-emails` — Templates/Kinds für Karte, Ablauf, Widerruf

#### Client

20. `PaymentSheet` / `usePaymentCheckout` / Storage-Keys — Subject statt nur `registrationId`
21. Einstellungen › Karten — Schalter, Beschreibung, Vorschauzeile, 250-€-Hinweis, Online-Guard
22. Seite/Menü „Meine Karten“ — Kacheln, Kauf, Widerruf-Link, Verlauf, abgelaufen eingeklappt
23. Kursdetail-Hinweis (K10/F)
24. Öffentliche `/widerruf`
25. `refundTexts` — Label Widerruf
26. E2E in Studio **`e2eapp`** (nie demoalpha): Kauf 4242 → buchen; Widerruf nach 2; Owner verlängert; >250 nicht online

#### Unverändert wiederverwenden

- `redeem_pass` / `register_for_course(p_use_pass)` / Rückbuchung
- Ledger `process_ledger` / H5' (sobald Payment korrekt `pass_purchase` + `card`)
- `get_studio_payments` Pass-Join
- Vor-Ort `sell_pass` (manual) bleibt

---

## Offene Punkte für Haltestelle 1 (Claude)

1. **Attempt-Subject:** Vorschlag `pass_product` + `subject_id=product_id` (kein Pending-Pass). Alternative: Pending-Pass-Zeile analog `pending_payment`-Registration — aufwendiger, unnötig ohne Kapazität. **Empfehlung: Produkt-Attempt.**
2. **Timeout ohne Hold:** 15 Min wie Kurs (C2) oder kürzer? Kein Platzverlust.
3. **UI-Default Gültigkeit:** Story K3 = 12 Monate; UI heute Jahresende/3 Jahre „empfohlen“. Default auf `months=12` umstellen — `years_to_year_end` weiter wählbar?
4. **Verlängerung im Verlauf:** neues Movement-`kind` `extend` (delta 0 verboten heute) vs. nur Event + Spaltenupdate ohne Movement vs. Movement mit `delta` ungenutzt. Braucht Entscheidung, weil `pass_movements.delta ≠ 0`.
5. **Wertersatz-Rundung:** `price_cents / units * used` ganzzahlig — Rest-Cent-Regel (wie H8 kaufmännisch)?
6. **Kulanz nach Frist:** bestehender Erstatten-Dialog Betrag frei; Story: Resttermine **immer** entwerten bei Erstattung auf Kartenkauf — auch bei Teilbetrag?
7. **Zustimmung Sofortnutzung:** eigene Tabelle `pass_purchase_consents` (append-only) vs. JSON an Payment/Pass — Nachweispflicht.
8. **Öffentliche Widerrufsseite:** Rate-Limit / Enumeration-Schutz über Belegnummer+E-Mail (Story: verrät nichts) — reicht fail-closed RPC?
9. **Mail „Noch 1 Termin“:** Trigger bei redeem wenn Rest=1, oder täglicher Job?
10. **`pass.expiring` 14-Tage-Event:** ersetzen durch 30/7-Mails oder parallel lassen?

---

## Umsetzung (nach Freigabe Teil 0)

Schichten auf `Julius` (Commits): SQL `debe870` · Functions `f3b49c5` · Logik `bb5e649` · UI `cbc0489` · E2E/Demo `85a4920` (+ Doku-Commit).  
`check:ci` grün vor jedem Push. Cron `yogaflow_expire_pass_payment_attempts` und `yogaflow_pass_expiry_reminders` in Migration.

### Inventur-Hooks (Stellenliste abgehakt)

| # | Stelle | Status |
|---|---|---|
| 1–14 | Schema/SQL (Produkte, Attempts, prepare/complete, Widerruf, extend, Belege, Mails, Cron, Consents) | angepasst |
| 15–19 | Edge/Port (CreatePaymentIntent subject, Checkout prepare pass, Webhook/Jobs complete, dispatch-emails) | angepasst |
| 20–25 | Client (Checkout, Einstellungen, Meine Karten, Kursdetail, /widerruf, refundTexts) | angepasst |
| 26 | E2E e2eapp | angepasst |
| — | `redeem_pass` / `register_for_course(p_use_pass)` / Rückbuchung | bewusst nicht betroffen |
| — | Ledger `process_ledger` / H5' (pass_purchase + card → psp_clearing) | bewusst nicht betroffen (Wiederverwendung) |
| — | `get_studio_payments` Pass-Join | bewusst nicht betroffen |
| — | Vor-Ort `sell_pass` (manual) | bewusst nicht betroffen |

### Tests

- Unit: `scripts/test/k1_pass_texts.mjs` (in `check:ci`)
- SQL: `scripts/test/k1_pass_online.mjs` (in `run_geldkette`)
- Deno: Checkout prepare-pass + Consent (199 Tests)
- E2E: `e2e/k1.spec.ts` (e2eapp) — 1/1 grün; Kauf über synthetische `pi_…` + `complete_online_payment` (kein Connect-Konto in e2eapp). Echtes 4242: Klickpunkt 3 demoalpha.

---

## Haltestelle 5 — Klickliste (max. 12)

1. **Owner demoalpha** — Einstellungen › Karten: 5er 65 € / 10er 120 €, Schalter „Online kaufbar“, Vorschauzeile, Default 12 Monate.
2. **Owner demoalpha** — Produkt > 250 €: Schalter gesperrt mit Hinweis „nur bis 250 €“.
3. **Teilnehmerin ohne Karte (z. B. Vera)** — Menü „Meine Karten“ sichtbar (Online-Produkte); Kauf 10er mit Consent-Häkchen + „Zahlungspflichtig kaufen“; Erfolg „Deine … ist bereit“.
4. **Vera** — Nach Kauf: Kachel „noch 10 von 10“, gültig bis, Link Widerruf in Frist.
5. **Vera** — Kursdetail (pass_eligible, ohne aktive Karte vorher): Ersparnis-Hinweis → Meine Karten; nach Kauf mit Karte buchbar.
6. **Vera** — Widerruf nach 2 genutzten Terminen: Rechenweg 120 − 2×12 = 96 € → bestätigen → Mail-Eingang / Karte entwertet.
7. **Owner demoalpha** — Zahlungen: Erstattung mit Grund „Widerruf“.
8. **Owner demoalpha** — Personen › Karla: Karte verlängern (neues Datum + Pflichtnotiz) → Verlauf „Verlängert“.
9. **Karla** — bestehende Karte bleibt (noch 6); Menü „Meine Karten“; kein erneuter Zwangsverkauf.
10. **Öffentlich** — `/widerruf?tenant=demoalpha` ohne Login: Beleg+E-Mail → Zusammenfassung oder neutraler Hinweis.
11. **Owner** — Online-Zahlung nicht bereit: Schalter „Online kaufbar“ gesperrt mit Grund.
12. **Mail** — Bestätigung „Karte ist bereit“ (UX-3-Shell) mit Widerrufshinweis im Fuß (DEV-Mail-Zeile / Inbox).

### Offene Lücken

- E2E kauft ohne Stripe-4242 (kein chargebares Connect-Konto in e2eapp); 4242 im Klicktest.
- Studio-Fuß ohne dedizierten Widerruf-Link außer `/legal` → Widerruf (Klickpunkt 10).
- Demoalpha-Produkte auf DEV gesetzt (5er 65 € / 10er 120 €, online, 12 Monate); Karlas bestehende Karte unverändert. Vollständiger `demo_seed_v2` optional.

---

## Nachtrag Widerruf (W1–W3, 05.10.2026)

Migrationen `20261005010000` / `20261005020000` / `20261005030000` auf DEV.  
SQL-Test `k1_pass_online.mjs` + Unit `k1_pass_texts.mjs` grün. Entscheidung 15 um **K12** ergänzt.

| # | Fix | Nachweis |
|---|---|---|
| W1 | `void_pass_remaining` vor `request_refund` — Karte sofort `revoked` | Test: Buchung → `NO_VALID_PASS` bei noch `pending` Erstattung |
| W2 | Früh `ALREADY_WITHDRAWN` (Event/Refund/void); Refund-Fehler → `RAISE` | Test: 2× confirm → 1 Event, 1 Mail, 1 Erstattung |
| W3 | Preview `units_used_upcoming` + `upcoming_dates`; Dialog/öffentliche Seite mit Hinweis + Rechenweg „davon X kommend“ | Unit-Texte + Preview-Test |

### Klickliste Nachtrag (kurz)

1. **Vera** — 10er online kaufen (4242); danach 2 Kurse mit Karte buchen; Widerruf: Hinweis auf kommende Termine + Rechenweg „2 genutzt (davon 2 kommend)“ → bestätigen → sofort nicht mehr mit Karte buchbar.
2. **Vera** — Widerruf ein zweites Mal (App oder `/widerruf`): Meldung „bereits widerrufen“, keine zweite Mail.
3. **Owner demoalpha** — Zahlungen: eine Erstattung „Widerruf“; Karte der Vera `revoked`.

### Klickpunkt 3 (Stripe-Ende) — nach Julius’ Kauf festhalten

Nach echtem 4242-Kauf bitte notieren (nur IDs/Zähler, keine Secrets):

| Prüfung | Wert |
|---|---|
| PaymentIntent-Ende (Status) | |
| `payment_attempts.status` | |
| `passes.id` + status | |
| Beleg vorhanden (`receipts`) | |
| Hauptbuch-Zeilen zu `payment.recorded` (Anzahl) | |

STOPP — wartet auf Julius’ Klicktest Nachtrag.

---

## Nachtrag K1-2 (Klicktest 05.10.2026)

Klickpunkte 1–8, 10, 12 ok. Punkt 9 (Verlauf) korrekt als Lücke. Drei Fixes.

### 1 — Apple Pay im Karten-Checkout

Kurs- und Karten-Checkout nutzen dieselbe `StripePaymentForm`. Die Init-Werte standen bisher inline (`paymentMethodTypes: ['card']`, Wallets auto/auto/never, Betrag und Currency aus prepare). Sie liegen jetzt in `stripePaymentElementsOptions` und `STRIPE_PAYMENT_ELEMENT_OPTIONS` (Accordion ohne „Mehr“, Reihenfolge Apple Pay, Google Pay, Karte). Der Karten-Fuß zeigt das Payment Element oben; Zustimmung und Preis sitzen direkt über dem Knopf, damit die Wallet-Zeile beim Öffnen im sichtbaren Bereich liegt.

**Payment Method Domains auf DEV** (Liste am Connected Account, 05.10.2026, ohne Kontorefs):

| Subdomain | Konto | Domain | Apple Pay |
|---|---|---|---|
| demoalpha.omlify-dev.de | aktiv, charges | registriert, enabled | active |
| demobeta.omlify-dev.de | in_progress | keine | — |
| juliusteststudio, sonnengruss, testerstudio, teststudio, yomita | kein Stripe-Konto | — | — |

Registrierung lief bisher nur beim Onboarding-`refresh` (Konto aktiv). Neu: Schalter „Online-Zahlung“ an → `refresh` (Domain). Jeder Checkout-`prepare` registriert best-effort, Fehler stoppt die Kartenzahlung nicht. PROD: [Release-Plan 0.10](../RELEASE_GELDKETTE_PLAN.md) — Functions deployen, bereits aktive Studios einmalig nachziehen.

