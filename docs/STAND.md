# STAND — Omlify DEV

Stand: 2026-10-05 · Branch `Julius` · HEAD siehe `git log -1` · Lauf [rt1_studio_rechtstexte.md](berichte/rt1_studio_rechtstexte.md) (Haltestelle 1b)

## DEV

- Migrationen bis `20261005095000` (K1-2 Karten-Beleg lesbar; davor W3 `20261005030000`)
- Functions (deployt, 05.10. inkl. K1-2): `payments-checkout`, `payments-onboarding`, `dispatch-emails`, `payments-jobs`, `payments-webhook` (+ bestehende)
- Secrets (Namen): `CALENDAR_ICS_SECRET`; `OPS_MONITOR_SECRET`, `OPS_ALERT_EMAIL`; `OPS_HEARTBEAT_URL` nicht gesetzt
- Cron: `yogaflow_expire_pass_payment_attempts`, `yogaflow_pass_expiry_reminders` (+ bestehende)
- E2E: K1 `e2e/k1.spec.ts` (e2eapp); ZW-1 / UX-5 zuvor grün
- Legal: AVV-Kanon `b90051ca…` in `legal_document_versions`; Studio-Vorlagen v1 nur Quelle `docs/legal/studio/vorlagen_v1_quelle.md` (noch nicht aufgeteilt)
- Deno: `npm run test:deno` 200/200 grün
- CI: lokal `npm run check:ci` (inkl. `k1_pass_texts`, `k1_pass_history`)
- Demo: demoalpha 5er 65 € / 10er 120 € online kaufbar 12 Monate; Karla behält Karte

## Zuletzt abgeschlossen

- **K1-2** — Apple Pay gleiche Elements-Konfig, Verlauf mit Verlängerung, Belegnummer als Text (Klicktest 3/3 ok)
  - Bericht: [docs/berichte/k1_karten_online.md](berichte/k1_karten_online.md)
- **K1 Nachtrag Widerruf W1–W3** — sofort void, ALREADY_WITHDRAWN, kommende Termine transparent (K12)
- **K1 A–F** — Online-Kartenkauf, Meine Karten, Widerruf, Mails, E2E e2eapp
- **ZW-1 Z8** — Neu-Hinweis unabhängig vom Standard-Weg
- **UX-5 RLS-Korrektur** — `20261004250000`; Regel `rls-access-not-display`

## Nächste Schritte

- RT-1 nach Klärung Haltestelle 1b: Vorlagen aufteilen, dann A–G
- Klicktest Z8 (Vera Neu-Hinweis; Nina Rückgängig Vor Ort) — parallel offen

## Haltestellen / wartet auf Julius

- **RT-1 Haltestelle 1b** — Spät-Abmeldung Vor Ort vs. „bleibt geschuldet“ / `get_open_coverage`: [rt1_studio_rechtstexte.md](berichte/rt1_studio_rechtstexte.md)
- Freigabe Teil 0 liegt vor: [rt1_freigabe_teil0.md](stories/rt1_freigabe_teil0.md)
- **Z8 Haltestelle** — genau 2 Klickpunkte in [zw1_zahlungswege.md](berichte/zw1_zahlungswege.md)
- Klicktest UX-4 Nachtrag N1–N3 (Toast-Balken mit neuem Kontrast erneut prüfen)
- UX-2 B1: Test-Mail + Screenshots (falls noch offen)
- Optional: `OPS_HEARTBEAT_URL` (Haltestelle 3)
- Testkundin PROD: AVV nach Release über Banner — nichts extra
- PROD: Altfehler `reviewed_at` nach Release-Plan 0.12 (Julius)

## hier weitermachen

Nach Antwort zu Haltestelle 1b: Vorlagen aufteilen, dann A–G.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc), [.cursor/rules/rls-access-not-display.mdc](../.cursor/rules/rls-access-not-display.mdc)
- Entscheidungen: [17_Studio_Rechtstexte.md](entscheidungen/17_Studio_Rechtstexte.md) (RT-1), [15_Karten_online.md](entscheidungen/15_Karten_online.md), [14_Zahlungswege.md](entscheidungen/14_Zahlungswege.md)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
