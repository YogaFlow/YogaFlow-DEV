# STAND — Omlify DEV

Stand: 2026-10-16 · Branch `Julius` · Release 2026-10 **live** · Freeze `ba97419` · Merge `main` `bc89631`

## DEV

- Migrationen bis `20261016121000` (**208** applied) — BC-1 `booking_confirmed` + AGB-Vorlage v3
- Functions: `dispatch-emails` mit `booking_confirmed` (DEV deployed)
- Neuigkeiten: DEV alle 4 IDs freigegeben; PROD ohne Freigaben
- Plattform: `online_payments` an (DEV); Modus `allowlist`
- Studio-AGB-Vorlage aktuell `2026-10-16` (v3); Demos accepted noch `2026-10-08` (Banner)

## PROD

- Release 2026-10 live seit 15.10.2026. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)
- Migrationen bis `20261015193000` — BC-1 noch nicht
- 19 Edge Functions, Frontend Worker `yogaflow-dev`
- `online_payments` an, Modus `allowlist`, Studios `omlifytest` und `yomita`
- Neuigkeiten: keine Freigaben

## Zuletzt abgeschlossen

- **BC-1 Teil A–D** — Outbox + Dispatcher + AGB v3 + Owner-Kasten. Bericht [bc1_buchungsbestaetigung.md](berichte/bc1_buchungsbestaetigung.md) — wartet auf Klicktest
- **Neuigkeit „Online bezahlen“** — Teilnehmerbrief live, Merge `bc89631`. Bericht [nu1_online_bezahlen_brief.md](berichte/nu1_online_bezahlen_brief.md)
- **Release 2026-10** — live, GO. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)

## Nächste Schritte

- Klicktest BC-1 (demoalpha), dann PR / PROD-Migration + `dispatch-emails`
- Weitere Punkte in [OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)

## Haltestellen / wartet auf Julius

- **BC-1 Haltestelle 5** — Klicktest [bc1_buchungsbestaetigung.md](berichte/bc1_buchungsbestaetigung.md)

## hier weitermachen

Nach Klicktest-GO: Push-Deploy-Nachweis / PR Julius → main; PROD 1 Migration + Functions.

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
- Abend-Checkliste: [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md)
