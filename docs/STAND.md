# STAND — Omlify DEV

Stand: 2026-10-17 · Branch `Julius` · HEAD FS-1 Klicktest-Nachtrag · Release 2026-10 **live** · Freeze `ba97419` · Merge `main` `bc89631`

## DEV

- Migrationen bis `20261017130000` (**210** applied) — FS-1 ops-monitor 15 s + Webhook Tenant-Retry; BC-1 `booking_confirmed` + AGB v3
- Functions: `payments-webhook` FS-1 Retry (DEV deployed); `dispatch-emails` mit `booking_confirmed`
- Neuigkeiten: DEV alle 4 IDs freigegeben; PROD ohne Freigaben
- Plattform: `online_payments` an (DEV); Modus `allowlist`
- Studio-AGB-Vorlage aktuell `2026-10-16` (v3); Demos accepted noch `2026-10-08` (Banner)

## PROD

- Release 2026-10 live seit 15.10.2026. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)
- Migrationen bis `20261015193000` — BC-1 und FS-1 noch nicht
- 19 Edge Functions, Frontend Worker `yogaflow-dev`
- `online_payments` an, Modus `allowlist`, Studios `omlifytest` und `yomita`
- Neuigkeiten: keine Freigaben

## Zuletzt abgeschlossen

- **FS-1 Klicktest-Nachtrag** — Datenschutz-Freigabe VERSION_MISMATCH (Client), Widerruf-Dialog. [fs1_klicktest_nachtrag.md](berichte/fs1_klicktest_nachtrag.md)
- **FS-1 Teil A–F** — Gebührenhinweis, Kosten-Text, ops-monitor 15 s, Widerruf-UI, Webhook-Retry. Bericht [fs1_feinschliff.md](berichte/fs1_feinschliff.md)
- **BC-1 Teil A–D** — Outbox + Dispatcher + AGB v3 + Owner-Kasten. Bericht [bc1_buchungsbestaetigung.md](berichte/bc1_buchungsbestaetigung.md) — wartet auf Klicktest
- **Neuigkeit „Online bezahlen“** — Teilnehmerbrief live, Merge `bc89631`. Bericht [nu1_online_bezahlen_brief.md](berichte/nu1_online_bezahlen_brief.md)
- **Release 2026-10** — live, GO. Bericht [release_2026-10_abend.md](berichte/release_2026-10_abend.md)

## Nächste Schritte

- Klicktest FS-1 (demoalpha), dann PROD: Migration → `payments-webhook` → Merge
- Klicktest BC-1 (demoalpha), dann PR / PROD-Migration + `dispatch-emails`
- Weitere Punkte in [OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)

## Haltestellen / wartet auf Julius

- **FS-1 STOPP vor PROD** — Nachtrag-Klicktest; PROD braucht Frontend für Tanja (Datenschutz-Freigabe). Siehe [fs1_klicktest_nachtrag.md](berichte/fs1_klicktest_nachtrag.md)
- **BC-1 STOPP vor Merge** — Reihenfolge Function → Merge → Migration; Befehle in [bc1_buchungsbestaetigung.md](berichte/bc1_buchungsbestaetigung.md)

## hier weitermachen

Nach FS-1-Klicktest: PROD Migration → payments-webhook → Merge (Frontend).

## Verweise

- Regeln: [.cursor/rules/omlify-autonom.mdc](../.cursor/rules/omlify-autonom.mdc)
- Offene Punkte: [docs/OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)
- Abend-Checkliste: [RELEASE_2026-10_ABEND.md](RELEASE_2026-10_ABEND.md)
