# NU-1 — „Neu für dich"

Stand: 2026-10-15 · Branch `Julius` · **STOPP** (Klicktest Zuklappen-Toggle)

## Fix — Zuklappen nach Aufklappen

Gesendete Karten schalten in beide Richtungen: Knopf „Aufklappen“ ↔ „Zuklappen“ (Pfeil dreht), Kopfzeile klickt um, `aria-expanded` gesetzt. Nach erneutem Senden zugeklappt. Neuladen → zugeklappt (DB), Session-Zustand nicht gespeichert.

Keine Migration.

## Freeze / Deploy

| Beleg | Wert |
|-------|------|
| Freeze-Hash | nach Push |
| Freeze-Tag | `release-2026-10-freeze` → Freeze-Hash |
| PROD-Migrationen fehlend | **92** |
| Check-Run CI / DEV | nach Push |
| Live-Bundle + Asset-404 | nach Deploy |

## Klicktest

1. Gesendete Karte: Aufklappen → Inhalt; Zuklappen → wieder zu; Kopfzeile ebenfalls
2. Erneut senden → wieder zugeklappt
3. Neuladen → zugeklappt
4. Asset-Check
