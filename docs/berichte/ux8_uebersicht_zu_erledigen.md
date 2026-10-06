# Bericht UX-8 — Übersicht: eine Liste „Zu erledigen“

Stand: 2026-10-06 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

## Freigabe Teil 0

Umgesetzt nach [ux8_freigabe_teil0.md](../stories/ux8_freigabe_teil0.md): U0/U0b zuerst, dann U1–U3 + Story.

## Erledigt

| Teil | Inhalt |
|---|---|
| U0 | `demo_v3.mjs`: Online nur Stripe-Testmodus (`payments-checkout` + `pm_card_visa`); Regel in `.cursor/rules/omlify-autonom.mdc` |
| U0b | Fake-Kurse archiviert; `provider_jobs` failed → done; `ops_monitor_collect` zählt failed-Erstattungen zu archivierten Kursen nicht; Alarme `refunds_failed` + `provider_jobs` resolved |
| U1 | `buildTodoItems`: Online (`card`) nie als „Geld zurückgeben“ |
| U2 | failed Online-Erstattung oben, nur Owner/Admin → `/payments?payment=…` |
| U3 | Demo: „Yoga am Samstagmorgen“ (Online, Erstattung succeeded) + „Abend-Yoga mit Vera“ (Bar → Rückgabe) |
| UX-8 | Eine Karte „Zu erledigen“ ersetzt die drei alten; Unit + E2E |

## U0b — archivierte Kurse / Alarme

| Aktion | Details |
|---|---|
| Kurse archiviert | `Hatha am Nachmittag` (alt/Fake-PI), `Abgesagt mit Erstattung`, `Olaf Teilerstattung Demo` |
| provider_jobs | 2× `failed` → `done` |
| ops_alerts | `demoalpha:refunds_failed` und `demoalpha:provider_jobs` → resolved (via collect→apply) |
| Fake-Pass Wiebke | `pi_test_v3_wiebke_…` Pass per Guard-Bypass revoked (append-only payment bleibt); neue echte 5er mit 27-Zeichen-`pi_` |

## Nach Seed — SQL-Akzeptanz

- Neue Online-Zahlungen (nicht-archivierte Kurse / aktive echte Pass-Käufe): `provider_ref` Länge 27, Muster `pi_[A-Za-z0-9]{24}` (Hatha, Samstagmorgen, Olaf Flow, Wiebke neu).
- Yoga am Samstagmorgen: `payment_refunds.status = succeeded` (1800).
- Abend-Yoga mit Vera: `cash` 1800, unreversed → Todo „zurückgeben“.
- `ops_alerts`: `demoalpha:refunds_failed` resolved; `demoalpha:disputes` bleibt offen (Test-Disputes, nicht Teil dieser Story).
- Alte `pi_test_…`-Zahlungszeilen bleiben append-only an archivierten Kursen.

## Nachweise

- Migration `20261006180000_ux8_ops_refunds_archived.sql` auf DEV (`npm run dev:apply`)
- `npm run check:ci` — grün
- Unit `scripts/test/ux8_todo_items.ts` — 11/11
- E2E `e2e/ux8.spec.ts` (e2eapp) — zurückgeben + offen/vor Ort ohne Doppelung + Leerzustand
- `node scripts/dev/demo_v3.mjs` — OK

## Haltestelle 5 — Klickliste (max. 6)

1. **Owner demoalpha** — Übersicht: eine Karte „Zu erledigen“; kein „Rückgaben offen“ / „Offene Zahlungen“ / „Heute zu erledigen“.
2. **Owner** — Zeile „18,00 € bar an Vera Vorort zurückgeben“ (Abend-Yoga) → Teilnehmerliste Rückgaben.
3. **Owner** — „1 Zahlung offen · Yin Yoga“ (Gestern) und „n zahlen vor Ort · Hatha…“ (Heute); Nina nicht doppelt.
4. **Owner** — Yoga am Samstagmorgen (Online-Absage): **keine** Rückgabe-Zeile; Erstattung succeeded in Zahlungen.
5. **Lehrende Lena** — nur eigene Kurse; Rückgabe ohne Betrag/Methode („1 Rückgabe offen · …“); keine failed-Erstattungszeile.
6. **Owner** — Screenshots 360/1280 (mit Zeilen + optional nach Erledigen Leerzustand).

## Commits (geplant / siehe git log)

- Migration + Regel
- `buildTodoItems` + Dashboard + Unit
- Demo-Seed
- E2E + Bericht
