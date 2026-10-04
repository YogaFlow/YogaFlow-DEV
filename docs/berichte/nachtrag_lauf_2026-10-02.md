# Nachtrag Lauf 02.10. — Antworten Julius — 2026-10-04

Status: **angehalten** (Haltestelle 5 — Klicktest). Umsetzung der Antworten aus dem Lauf-Bericht.

## Antworten → Umsetzung

| # | Antwort | Umsetzung |
|---|---|---|
| 1 | Stornierte Buchungen bis Kursende sichtbar, **zusätzlich** solange Erstattung pending oder failed | `isCancelledEnrollmentVisible` in `refundTexts.ts`; `MyRegistrations.tsx` (Absage und Abmeldung); Unit-Test |
| 2 | Kein Erstatten aus der Teilnehmerliste | unverändert (schon so); bestätigt |
| 3 | Bar/PayPal/Überweisung bleiben in der Kasse | unverändert (schon so); bestätigt |
| 4 | Entscheidung 11: Platzhalter ohne Inhalt | **weiter vorläufig** — Julius hat „bestätigt / Änderungen“ nicht eingetragen |
| 5 | `setup-cli@v1` bis nach dem Release | `OFFENE_PUNKTE.md` angepasst |
| 6 | Generalprobe-Guard: Env + Flag, Stripe/demoalpha skippen | `_helpers.mjs` `assertDevEnv` + `run_geldkette.mjs --probe`; Smoke-Skripte Exit 0 auf Probe. **Nur gebaut, nichts gegen Probe/PROD ausgeführt** |
| 7 | PROD-Replay als Runbook, DEV-Skript unverändert | `RELEASE_GELDKETTE_PLAN.md` §0.11 |
| — | DEP0190 `scripts/dev/*` | `_spawn.mjs` ohne Shell; Wrapper umgestellt |

## Commits

(siehe `git log` nach Push)

## DoD

- ✅ Unit-Test `isCancelledEnrollmentVisible` (in `refund_texts.ts`, 12/12)
- ✅ `npx tsc -p tsconfig.app.json --noEmit`
- ✅ Probe-Guard: falsche URL / PROD-Ref → Abbruch (lokal belegt)
- ✅ npm über `_spawn` ohne Shell (`npm --version` Exit 0)
- ⏸ Klicktest Julius (unten)

## Klickliste

1. Teilnehmerin, online bezahlt, vor Kursende abmelden: Eintrag bleibt in Meine Anmeldungen mit „Erstattung läuft“ / „Erstattet“.
2. Nach Kursende: Eintrag mit „Erstattet“ / ohne offenen Stand verschwindet; mit „Erstattung läuft“ oder „verzögert sich“ bleibt.
3. Kursabsage: abgesagte Buchung bis Kursende sichtbar; danach nur bei pending/failed.

## Offene Fragen

1. **Entscheidung 11** weiterhin vorläufig — bitte „bestätigt“ oder konkrete Änderungen nachtragen.
