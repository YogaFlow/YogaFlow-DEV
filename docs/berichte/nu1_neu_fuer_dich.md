# NU-1 — „Neu für dich" (Owner/Admin-Neuigkeiten + Glocken-Versand)

Stand: 2026-10-15 · Branch `Julius` · **STOPP** (Klicktest Nachbesserung)

## Nachbesserung nach Klicktest (Freeze-Ausnahme)

Klicktest A (Assets) und B1–6 waren grün. Drei UX-Punkte nachgezogen:

| # | Thema | Änderung |
|---|-------|----------|
| 1 | Menü | „Neu für dich" nur noch unter Einstellungen (wie Rechtliches); Badge = `NavCountBadge` wie Zahlungen, an **Einstellungen** und am Unterpunkt |
| 2 | Glocke | Modal per `createPortal` auf `document.body` (`ModalBackdrop`); Popover schließt beim Öffnen; Scroll + Safe-Area; X / Hintergrund / Escape |
| 3 | Empfänger | Liste `max-h-48`, sichtbare Scrollbar, Verlauf am unteren Rand solange mehr folgt; „X ausgewählt" bleibt oberhalb |

Ursache Glocke: Modal hing in `Header.tsx` im sticky/`backdrop-blur`-Stacking-Kontext → abgeschnitten + Overlay blockiert. Portal + Popover-Schließen behebt das.

Route `/updates`, Rollen-Prüfung und Lehrer-Weiterleitung unverändert. CTAs in den Neuigkeiten zeigen weiter auf `/dashboard`, `/settings/karten`, `/settings/rechtliches`.

Keine Migration.

## Tests

- Unit: Badge Einstellungen = Zahlungen-Badge; Modal-Scroll-Lock weg nach unlock; Kategorie `updates` → `/updates`
- `npm run check:ci`: grün

## Freeze / Deploy

| Beleg | Wert |
|-------|------|
| Freeze-Tag | `release-2026-10-freeze` → Commit dieses Berichts (annotiert, lokal + origin); Hash = `git rev-parse release-2026-10-freeze` |
| Basis | Asset-404 `ce84e7b` / zuvor `bebf1fe` |
| Check-Run DEV | nach Push: `Workers Builds: omlify-dev` = success |
| Live-Bundle | Studio-Subdomain: JS aus `index.html`; fehlendes Asset = 404 |

## Klicktest Julius (Nachbesserung)

1. Owner: kein eigener Hauptmenüpunkt „Neu für dich"; unter Einstellungen mit Badge bei Ungelesenen; Badge auch an „Einstellungen"
2. Seite `/updates` → Hinweis weg; Zurück zu Einstellungen
3. Lehrer: kein Eintrag unter Einstellungen; `/updates` → Übersicht
4. Teilnehmende (iPhone + Desktop): Glocke → Mehr lesen → Modal voll sichtbar; Popover zu; X / Hintergrund / Escape → Seite wieder bedienbar
5. Empfänger „Auswählen …": scrollbar, Verlauf verschwindet am Ende; „X ausgewählt" sichtbar
6. Asset-Check: live `index-*.js` ist JavaScript; `/assets/index-missing-probe.js` = 404
