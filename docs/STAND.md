# STAND — Omlify DEV

Stand: 2026-10-05 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [k1_karten_online.md](berichte/k1_karten_online.md) (Nachtrag Widerruf)

## DEV

- Migrationen bis `20261005030000` (K1 W3 kommende genutzt; davor W1/W2 Widerruf-Fixes)
- Functions (deployt): `payments-checkout`, `dispatch-emails`, `payments-jobs`, `payments-webhook` (+ bestehende)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: K1 `e2e/k1.spec.ts` (e2eapp); ZW-1 / UX-5 zuvor grün
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`
- Deno: `npm run test:deno` 199/199 grün
- CI: lokal `npm run check:ci` (inkl. `k1_pass_texts`)
- Demo: demoalpha 5er 65 € / 10er 120 € online kaufbar 12 Monate; Karla behält Karte

## Zuletzt abgeschlossen

- **K1 Nachtrag Widerruf W1–W3** — sofort void, ALREADY_WITHDRAWN, kommende Termine transparent (K12)
  - Bericht: [docs/berichte/k1_karten_online.md](berichte/k1_karten_online.md) → STOPP kurze Klickliste
- **K1 A–F** — Online-Kartenkauf, Meine Karten, Widerruf, Mails, E2E e2eapp
- **ZW-1 Z8** — Neu-Hinweis unabhängig vom Standard-Weg
- **UX-5 RLS-Korrektur** — `20261004250000`; Regel `rls-access-not-display`

## Nächste Schritte

- Klicktest K1 Nachtrag Widerruf (3 Punkte) + ggf. Klickpunkt 3 Stripe-Ende notieren
- Klicktest Z8 (Vera Neu-Hinweis; Nina Rückgängig Vor Ort) — parallel offen

## Haltestellen / wartet auf Julius

- **K1 Haltestelle 5 (Nachtrag)** — kurze Klickliste in [k1_karten_online.md](berichte/k1_karten_online.md)
- **Z8 Haltestelle** — genau 2 Klickpunkte in [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Klicktest Nachtrag Widerruf: Freigabe oder nächste Story.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [docs/entscheidungen/15_Karten_online.md](entscheidungen/15_Karten_online.md) (K1/K12), [14_Zahlungswege.md](entscheidungen/14_Zahlungswege.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
