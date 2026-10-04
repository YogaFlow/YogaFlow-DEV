# Bericht 3.1 — Zahlungsübersicht — 2026-10-02

Status: **angehalten** (Haltestelle 5 — Klicktest Julius). Entscheidung 11 gilt seit 04.10.2026.
Logik, Gestaltung, Tests und E2E sind grün und gepusht.

Vorgabe: Lauf-Auftrag vom 02.10.2026, festgehalten als
[docs/entscheidungen/11_Zahlungsuebersicht.md](../entscheidungen/11_Zahlungsuebersicht.md) (Z1–Z7).

## Commits

- `dc70787` feat(geldkette): 3.1 Lese-RPC get_studio_payments, Status-Ableitung, Test, Entscheidung 11 vorlaeufig
- `a1e8735` feat(geldkette): 3.1 Glocke Rueckbuchung/fehlgeschlagene Erstattung fuehrt zur Zahlung
- `c454b90` feat(geldkette): 3.1 Zahlungsuebersicht Texte, Monate, Datenzugriff, Unit-Tests
- `0b6317d` feat(geldkette): 3.1 Bereich Zahlungen (Liste, Filter, Karten mobil, Detail mit Erstatten)
- `32fae53` test(geldkette): 3.1 E2E Zahlungen Online-Filter und Teilerstattung

## DEV-Stand

- `20261002220000_s3_1_payment_overview.sql` — `get_studio_payments`, Helfer `payment_overview_status`, `payment_refunded_cents`
- `20261002223000_s3_1_notification_payment_path.sql` — Glocken-Ziel von `record_payment_dispute` und `mark_refund_failed`
- Keine Edge Function, keine Secrets geändert

## Was gebaut wurde

**RPC `get_studio_payments(p_month, p_kind, p_status, p_search, p_page)`** — `SECURITY DEFINER`,
`search_path ''`, nur Owner/Admin im Studio-Kontext (`get_my_tenant_id` + `is_tenant_manager`),
sonst `FORBIDDEN`. `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT … TO authenticated`;
Selbstprüfung im `DO`-Block; Helfer ohne Client-EXECUTE. Serverseitig 50 je Seite, `total` für das
Blättern. Eine Zeile je positiver Zahlung (Gegenbuchungen sind keine Zeilen, Z2). Suche escaped
`%`/`_` (Test „Suche % ist kein Joker“).

**Status (Z3)**, Reihenfolge bei Überschneidung: Rückbuchung offen → Erstattung läuft →
Erstattung fehlgeschlagen (letzte Erstattung gescheitert) → erstattet → teilweise erstattet →
storniert → bezahlt.

**Bereich „Zahlungen“** (`/payments`, Sidebar für Owner/Admin über „Offene Zahlungen“):
Filter Monat (Standard aktueller Monat, 13 Monate zurück), Art, Status, Namenssuche (300 ms
verzögert). Mobil Karten, ab `md` Tabelle. Status mit Icon und Text. Hinweis auf den CSV-Export
statt Summen (Z5). Detail über `?payment=<id>` mit dem `PaymentRefundSheet` aus 3.2c (Z6).

**Glocke:** „Rückbuchung offen“ und „Erstattung fehlgeschlagen“ führen jetzt zu
`/payments?payment=<id>` (Knopf „Zur Zahlung“) statt zu „Offene Zahlungen“. Funktions-Diff:
md5 der DEV-Definition vor und nach der Migration ist identisch, wenn man das geänderte Ziel
herausnimmt (`b67eff…` / `b8d86e…`). Alte Benachrichtigungen behalten ihr altes Ziel (keine
Datenänderung).

## Entscheidungen, die ich selbst getroffen habe

1. **Detail nur für Online-Zahlungen** (`src/pages/Payments.tsx`, `rowAction`). Das Sheet zeigt
   Erstattungen; Bar/PayPal/Überweisung haben keine, sie werden in der Kasse zurückgegeben. Darum:
   Online → Sheet; Bar/PayPal/Überweisung zu einem Kurs → Link zur Kasse; Kartenverkauf → keine
   Aktion. Abweichung von Z6 („Tipp auf eine Zahlung öffnet das Detail“). Frage unten.
2. **„Storniert“** für Bar/PayPal/Überweisung mit Gegenbuchung (Kassieren rückgängig, Rückgabe nach
   Absage) und stornierte Karten. Eine Bar-Rückgabe nach Kursabsage heißt damit auch „storniert“,
   nicht „erstattet“.
3. **Monat nach Zahlungseingang** (`received_at`, sonst `created_at`) in Berlin-Zeit, nicht nach
   Kursdatum.
4. **Status-Filter serverseitig nach der Ableitung** — die Ableitung läuft je Zahlung im Monat.
   Bei sehr vielen Zahlungen pro Monat wäre eine gespeicherte Spalte schneller; heute nicht nötig.
5. **Sheet-Titel bleibt „Online-Zahlung“**, Untertitel „Person · Kurs, Termin“.

## Definition of Done

- ✅ `npm run dev:apply` — `20261002220000`, `20261002223000`
- ✅ Funktions-Diff gegen `pg_get_functiondef` — nur das Glocken-Ziel (siehe oben)
- ✅ RPC-Test `s3_1_payment_overview.mjs` grün (Rechte owner/admin/teacher/user/fremdes Studio/anon,
  sieben Status, Filter Art/Status/Kombination/Name/Vormonat/Seite 2, ungültige Werte, Glocken-Ziel)
- ✅ Unit-Tests `scripts/test/payment_overview.ts` — 5 Tests (in `dev:check`)
- ✅ E2E `e2e/payments.spec.ts` grün (17,7 s)
- ✅ `npm run dev:check` — Exit 0 (40 Unit-Tests)
- ✅ `npm run dev:test` — 27/27 grün, ohne Wiederholung

## E2E

```
ok 1 › Owner filtert Online und sieht die Teilerstattung im Detail (17.7s)
1 passed (33.3s)
```

Screenshots (nicht committet): `docs/screenshots/3_1/zahlungen-liste-{360,1280}.png`,
`zahlungen-detail-{360,1280}.png`.

## Klickliste für Julius

1. Sidebar „Zahlungen“ über „Offene Zahlungen“ — Name und Reihenfolge klar?
2. 360 px: Karten lesbar (Person, Betrag, Wofür, Datum · Art, Status)?
3. Desktop: Tabelle, Spalte „Wofür“ bricht um — ok?
4. Filter Monat/Art/Status/Name zusammen benutzen; Leerzustand.
5. Online-Zahlung antippen → Sheet mit Erstattungen und „Erstatten“; nach dem Erstatten Status in der Liste.
6. Barzahlung antippen → Kasse des Kurses. Erwartet?
7. Glocke bei Rückbuchung (DEV-Testereignis) → „Zur Zahlung“ öffnet das Sheet.

## Fragen an Julius

1. **Z6 für Bar/PayPal/Überweisung:** eigenes Detail (nur Anzeige) oder Sprung zur Kasse wie jetzt?
   Empfehlung: Sprung zur Kasse — dort passiert Zurückgeben ohnehin.
2. **Entscheidung 11** — gilt seit 04.10.2026 (Story UX-1).
