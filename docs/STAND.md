# STAND — Omlify DEV

Stand: 2026-10-04 · Branch `Julius` · HEAD siehe `git log -1`

## DEV

- Migrationen bis `20261004122000` (B1 Belege: Resilience N1–N4, retry N2, keine Umkehr-Belege)
- Functions (deployt): `payments-jobs`, `payments-webhook` (du_ + `PAYMENT_NOT_READY`), `dispatch-emails` (B1 Bestätigung + N5 §-19-Satz), `send-email` (fromName/replyTo)
- E2E: `npm run dev:e2e` (Playwright, nur DEV-Guard, Studio `demoalpha`) — B1 3/3 grün (04.10.)
  (dazu 3.2c ×3, 3.1 ×1, Datumsfelder ×2, UX-1 ×5)
- Probe-Guard: `OMLIFY_PROBE_REF` + `--probe` / `OMLIFY_ALLOW_PROBE=1` (nicht gegen Probe/PROD ausgeführt)

## Zuletzt abgeschlossen

- **B1 Nachtrag N1–N6** — Belegfehler blockiert nie Zahlung; `retry_missing_receipts`; Steuer zum Zahlungsdatum; kein §-19-Raten; voller Satz auf Beleg/Mail; E2E 3/3
  - Bericht: [docs/berichte/b1_bestellknopf_belege.md](berichte/b1_bestellknopf_belege.md)
  - demoalpha Belege: `2026-00001`/`00002` receipt, `2026-00004` refund_receipt (`00003` Fehlbeleg vor Umkehr-Fix)
- **B2 V0** AVV-Text Version 2 — Ergänzungen zu Zahlungen/Belegen, Stand 04.10.2026, gerendert, kein PROD-Deploy
- **B1** Studio-Angaben, Bestellknopf, Bestätigung, Belege — **fertig** (Klicktest offen)
- **UX-1** Erstatten / Zahlungen-Reiter / Einstellungen — **fertig**
  (Klicktest Julius 04.10.2026, alle Punkte ok, 360 + 1280 px)
  - Bericht: [docs/berichte/ux1_zahlungen_erstatten_einstellungen.md](berichte/ux1_zahlungen_erstatten_einstellungen.md)
- Entscheidungen 12 (Kaufprozess) und 13 (Überwachung/AVV) gelten
  - [12_Kaufprozess_Rechtliches.md](entscheidungen/12_Kaufprozess_Rechtliches.md)
  - [13_Ueberwachung_AVV.md](entscheidungen/13_Ueberwachung_AVV.md)

## Nächste Schritte

- Story B2 (Überwachung `ops-monitor` inkl. Prüfung (i) fehlende Belege, AVV-Zustimmung) — **hier weitermachen**
- Klicktest B1 (siehe Bericht)
- Klicktest Nachtrag (stornierte Buchungen bis Kursende / pending / failed)
- Klicktest 3.2c + 3.1

## Haltestellen / wartet auf Julius

- Nachtrag + 3.2c + 3.1: Klicktest
- B2: Heartbeat-Konto / `OPS_HEARTBEAT_URL` optional (Haltestelle 3)
- Optional: Probe-Lauf freigeben (nicht autonom gegen Probe)
- Info: Testkundin bestätigt AVV auf PROD nach Release über Banner (V4) — nichts extra bauen

## hier weitermachen

B1 Nachtrag N1–N6 fertig. **Als Nächstes B2:**
1. Überwachung: `ops-monitor` (15 min), `ops_alerts`, Secret `OPS_ALERT_EMAIL=support@omlify.de` via `npm run dev:secrets`. `OPS_HEARTBEAT_URL` nicht setzen. Am Laufende `retry_missing_receipts()`; Prüfung U2 (i) Stripe-Zahlung/-Erstattung > 10 min ohne Beleg.
2. AVV-Zustimmung: `legal_acceptances`, Onboarding-Checkbox, Banner, `AVV_MISSING` an K2.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Entscheidungen: [docs/entscheidungen/](entscheidungen/)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
