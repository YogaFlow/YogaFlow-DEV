# STAND — Omlify DEV

Stand: 2026-10-15 · Branch `Julius` · Release 2026-10 **live** · Freeze `ba97419` · Merge `main` `bc89631`

## DEV

- Migrationen bis `20261015193000` (**207** applied)
- Functions: `list_released_updates`, `list_studio_update_sends`; `send_studio_update` prüft Freigabe
- Neuigkeiten: DEV alle 4 IDs freigegeben; PROD ohne Freigaben
- Plattform: `online_payments` an (DEV); Modus `allowlist`

## PROD

- Release 2026-10 live seit 15.10.2026. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)
- Migrationen bis `20261015193000` (die 92 fehlenden sind angewendet)
- 19 Edge Functions, Frontend Worker `yogaflow-dev`
- `online_payments` an, Modus `allowlist`, Studios `omlifytest` und `yomita`
- Neuigkeiten: keine Freigaben

## Zuletzt abgeschlossen

- **Neuigkeit „Online bezahlen“** — Teilnehmerbrief live, Merge `bc89631`. Bericht [nu1_online_bezahlen_brief.md](berichte/nu1_online_bezahlen_brief.md)
- **Release 2026-10** — live, GO. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)

## Nächste Schritte

- **Vor Pilot-Onboarding Yomita** — drei Punkte in [OFFENE_PUNKTE.md](OFFENE_PUNKTE.md) (Vor-Ort-Bestätigung, Gebühr-Hinweis, Zahlungsseite)

## Haltestellen / wartet auf Julius

- keine aus dem Release-Abend

## hier weitermachen

Punkte „Bald — vor Pilot-Onboarding Yomita“ in [OFFENE_PUNKTE.md](OFFENE_PUNKTE.md).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
- Abend-Checkliste: [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md)
