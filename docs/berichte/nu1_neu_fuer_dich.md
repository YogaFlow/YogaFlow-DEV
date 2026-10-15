# NU-1 — „Neu für dich" (Owner/Admin-Neuigkeiten + Glocken-Versand)

Stand: 2026-10-15 · Branch `Julius` · **STOPP** (Klicktest Julius)

## Teil 0 / 0b

| Punkt | Befund |
|-------|--------|
| Nachrichten | Kein Studio-Broadcast; `messages.course_id` NOT NULL; INSERT ohne Rollenprüfung |
| E-Mail | Nachrichten lösen keine `email_deliveries` aus |
| Entscheidung Julius | Versand über `user_notifications` + RPC `send_studio_update` (additive Migration) |
| `user_notifications.type` | **Kein CHECK** (DEV) → `'studio_update'` ohne Schema-Änderung |
| Glocke Text | Bisher voller Body; bei langem Text jetzt Kürzung (~140) + Modal „Mehr lesen"; `action_path` leer → kein Link |
| Ungelesen | localStorage `omlify:updates_read:{tenant}:{user}` |
| Gesendet | nur lokal `omlify:updates_sent:…` |

## Migration

- `20261015180000_nu1_send_studio_update.sql` auf DEV applied (`--include-all` wegen ausstehender `20261004205900`)
- Zusätzlich Allow-Kopf an `20261004205900_align_users_grants_prod.sql` (war lokal pending ohne Header)
- DEV Migrationen: **206** bis `20261015180000`
- PROD-Differenz Runbook: **91** fehlend (vorher 85)

## Dateien

- `src/content/updates.ts` — 4 Neuigkeiten
- `src/lib/studioUpdates.ts`, `sendStudioUpdate.ts`, `useUnreadUpdates.ts`
- `src/pages/Updates.tsx` — `/updates`
- Sidebar/Header/App/routeTitles/types
- Tests: `scripts/test/nu1_studio_updates.ts`, `nu1_send_studio_update.mjs`

## Tests

- Unit (Platzhalter, showIf, Ungelesen): grün
- Integration DEV: Teacher → FORBIDDEN; Owner sent=2 + Fremd skipped; Admin alle=3; 0 neue `email_deliveries`; anon 42501; EMPTY_MESSAGE
- `npm run check:ci`: grün

## Klicktest Julius (demoalpha)

1. Owner: Menü „Neu für dich" mit Ungelesen → Seite → Hinweis weg (auch nach Neuladen)
2. Neuigkeit Kurskarten: Text ändern, Kopieren → stimmt
3. Senden an 2 Ausgewählte → Bestätigung „2" → als einer davon: Glocke; anderer: keine; keine E-Mail
4. Online aus → Nr. 4 unsichtbar; an → sichtbar
5. Lehrer: kein Menüpunkt, `/updates` → Übersicht
6. Mobil: Seite, Auswahl, Kopieren, Senden; lange Glocken-Nachricht → Mehr lesen

## Freeze / Deploy-Nachweis

| Beleg | Wert |
|-------|------|
| HEAD / Tag | `7d68f03` = `release-2026-10-freeze` |
| Check-Run CI | `Typen, Lint und Build` → success |
| Check-Run DEV | `Workers Builds: omlify-dev` → success |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-Picg4PEw.js` |
| Merkmal | `2026-10-zahlungen-im-blick`, `Kurskarte anlegen`, `send_studio_update` im Bundle |
