# NU-1 — „Neu für dich" (Owner/Admin-Neuigkeiten + Glocken-Versand)

Stand: 2026-10-15 · Branch `Julius` · **STOPP** (Klicktest Teil 2)

## Teil 0

| Frage | Befund |
|-------|--------|
| Frontend `platform_flags` | Kein Direktzugriff. Online-Flag über RPC `get_payment_setup_status` → `platform_enabled` (Allowlist-Logik). |
| `send_studio_update` metadata | Immer `update_id` + `sent_by` (Migration + DEV-Beleg `user_notifications`). |
| Freigabe in `platform_flags`? | **Nein.** CHECK `^[a-z_]{3,64}$` erlaubt weder `update:` noch Ziffern/Bindestriche. → neue Tabelle `studio_update_releases` (additiv, keine Policy-Änderung an Bestehendem). Keine Haltestelle. |

## Teil 2 — Freigabe + Zuklappen

| Punkt | Umsetzung |
|-------|-----------|
| Freigabe | `studio_update_releases (update_id PK, enabled)`; Schreiben nur `service_role` |
| Lesen | RPC `list_released_updates()` → nur IDs, nur Owner/Admin |
| Versand-Übersicht | RPC `list_studio_update_sends()` → letzter Versand je `update_id` im eigenen Tenant |
| Senden | `send_studio_update` → `UPDATE_NOT_RELEASED` wenn nicht freigegeben |
| DEV-Seed | alle 4 aktuellen IDs (bei Demo-Slug); PROD: leer |
| Frontend | sichtbar = freigegeben ∧ showIf; Badge nur darüber; Leer „Noch keine Neuigkeiten“; Ladefehler → nichts; Karte mit Teilnehmer-Nachricht nach Versand zugeklappt (DB) |

### Rechte-Audit

| Objekt | anon | authenticated | service_role |
|--------|------|---------------|--------------|
| `studio_update_releases` | kein SELECT/INSERT | kein SELECT/INSERT | SELECT/INSERT/UPDATE/DELETE |
| `list_released_updates` | kein EXECUTE | EXECUTE (Manager sieht IDs, sonst leer) | — |
| `list_studio_update_sends` | kein EXECUTE | EXECUTE (nur eigener Tenant) | — |
| `send_studio_update` | kein EXECUTE | EXECUTE (Manager + freigegebene ID) | — |

Runbook-SQL: [RELEASE_2026-10_ABEND.md](../RELEASE_2026-10_ABEND.md) Abschnitt „Neuigkeiten freigeben“ (nicht Abend-Schritt).

## Migration

- `20261015193000_nu1_studio_update_releases.sql` auf DEV applied
- DEV Migrationen: **207** bis `20261015193000`
- PROD-Differenz: **92** fehlend (vorher 91)

## Tests

- Unit: Freigabe × showIf; 0 ohne Freigaben; zugeklappt bei Versand — grün
- Integration DEV: unreleased → nicht in Liste + UPDATE_NOT_RELEASED; Owner schreibt Tabelle nicht; Sends ohne Fremd-Tenant — grün
- `npm run check:ci`: grün

## Freeze / Deploy

| Beleg | Wert |
|-------|------|
| Freeze-Tag | `release-2026-10-freeze` → dieser Commit (annotiert) |
| Check-Run CI / DEV | nach Push belegen |
| Live-Bundle | Studio-Subdomain + Asset-404-Probe |

## Klicktest Julius (Teil 2)

1. Owner: unter Einstellungen „Neu für dich“ — freigegebene Neuigkeiten sichtbar; Badge = ungelesene Freigegebene
2. (SQL) eine ID `enabled=false` → verschwindet; Badge ggf. 0; Seite „Noch keine Neuigkeiten“ wenn leer
3. Senden → Karte zugeklappt mit „✓ Gesendet am … an N“; Neuladen / anderes Gerät gleich; Aufklappen → erneut senden zeigt „Bereits am …“
4. Karten ohne Teilnehmer-Nachricht bleiben offen
5. Lehrer: kein Unterpunkt / `/updates` → Übersicht
6. Asset-Check: JS aus `index.html`; missing probe = 404
