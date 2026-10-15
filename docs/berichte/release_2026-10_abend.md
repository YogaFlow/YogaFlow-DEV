# Bericht — Release 2026-10 Abend

Stand: 2026-10-15 · Branch `Julius` · Status: **live (GO)**  
Checkliste: [RELEASE_2026-10_ABEND.md](../RELEASE_2026-10_ABEND.md)

## Ergebnis

Release 2026-10 ist live. Freeze `ba97419`, Merge `main` = `bcb2c95`. 92 Migrationen auf PROD (bis `20261015193000`), 19 Edge Functions, Frontend Worker `yogaflow-dev`.

## Ampel

| Block | Ampel | Kurz |
|-------|-------|------|
| T–60 | 🟢 | Backup, Snapshot, Extensions, Vault, Edge-Secrets, Cloudflare-Variablen |
| Phase 5 | 🟢 | Push, Post-Push, Functions, Cron von Hand, Merge, Build, Asset-Check, Plattform aus |
| 16a | 🟢 | Online-Bestätigung mit AGB-PDF. Vor-Ort ohne Mail = bekannte Lücke |
| Vor Phase 6 | 🟢 | Integrationsauswahl Direct Charges, danach erst Stripe live |
| Phase 6 | 🟢 | Webhooks, Secrets, Rauch omlifytest (Zahlung, Karte, Hauptbuch, Mails) |
| Schritt 24 | 🟢 | `omlifytest` und `yomita`, Modus `allowlist`, Plattform an |
| Abschluss | 🟢 | CLI auf DEV, Variablen gelöscht, PROD-DB-Passwort getauscht |
| Gesamt | **GO** | |

## T–60

Backup, Snapshot (327 Anmeldungen), `pg_cron` und `pg_net`, Vault (8 Einträge; Secrets 64-hex, Digest = Edge-Secrets), Edge-Secrets, Cloudflare-Variablen: grün.

## Phase 5

Push ohne Fehler. Post-Push grün: Flag aus, Allowlist leer, 10 Cron-Jobs, Bucket `studio-legal` privat, `studio_update_releases` 0 Zeilen bei RLS an und 0 Policies, PUBLIC EXECUTE = 0, genau 3 anon-RPCs. Snapshot 327 unverändert. 8 Alt-Abmeldungen auf `cancelled` (A1 = 8). Functions deployt, `verify_jwt` wie DEV. 10 Cron-Jobs von Hand grün, Retention-Zählung 0. Merge, Build, Asset-Check grün. Plattform-aus-Check grün.

## 16a

AGB-PDF-Jobs `done`. Online-Bestätigung mit AGB-PDF angekommen. Vor-Ort-Buchung ohne Bestätigungsmail ist eine bekannte Lücke, keine Regression. Offen: [OFFENE_PUNKTE.md](../OFFENE_PUNKTE.md) (vor Pilot-Onboarding Yomita).

## Phase 6

Live-Webhooks: Snapshot 12 Ereignisse, Thin 13, API `2026-08-26.dahlia`. Live-Secrets gesetzt, `PAYMENTS_MODE=live` per Digest geprüft. Rebuild und Asset-Check grün.

Stripe live erst nach „Integrationsauswahl bestätigen“ (Direct Charges). Vorher Fehler `account_create_activation_required`.

Live-Rauch `omlifytest`: Buchung 1 € per Apple Pay und Erstattung; Kurskarte 1 € und Widerruf. Zahlungen, 40 Webhooks, Hauptbuch und Mails grün. Vier Anfangs-Events `TENANT_NOT_RESOLVED` (Race beim Kontoanlegen), `reviewed_at` gesetzt.

## Schritt 24 und Abschluss

`omlifytest` und `yomita` freigeschaltet. Modus `allowlist`, Plattform an.

CLI wieder auf DEV verlinkt, Shell-Variablen gelöscht, PROD-DB-Passwort getauscht (Julius).

## Abweichungen

- Snapshot **327** Anmeldungen, Soll in der Checkliste war 325. Durch den Push unverändert.
- Vor-Ort ohne Buchungsbestätigung (siehe 16a).
- Direct Charges mussten im Stripe-Live-Dashboard bestätigt werden, bevor Konten angelegt werden konnten.
- Vier Webhooks `TENANT_NOT_RESOLVED` beim Kontoanlegen, danach `reviewed_at`.

## Checkliste nachgezogen

- Pooler-Host `aws-1-eu-west-1.pooler.supabase.com`
- Vor Phase 6: Integrationsauswahl Direct Charges
- 16a über Online-Buchung; Vor-Ort hat noch keine Bestätigung
