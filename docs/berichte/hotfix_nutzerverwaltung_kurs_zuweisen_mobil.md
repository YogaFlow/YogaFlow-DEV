# Bericht — Hotfix Nutzerverwaltung › Kurs zuweisen mobil

Status: **fertig** (PROD live, `main` in Julius gemerged)  
Stand: 2026-10-08 · Story [hotfix_nutzerverwaltung_kurs_zuweisen_mobil.md](../stories/hotfix_nutzerverwaltung_kurs_zuweisen_mobil.md)

## Teil 0

| Branch | Mobil (`lg:hidden`) | Desktop (`hidden lg:block`) |
|--------|---------------------|-----------------------------|
| `origin/main` (vor Fix) | `src/pages/Users.tsx` ~794 | ~1108 |
| `Julius` (vor Fix) | `src/pages/Users.tsx` ~990 | ~1368 |

**Ursache (beide gleich):** Flex-Zeile `flex gap-2` mit `select.flex-1` ohne `min-w-0`. Native `<select>` behält intrinsische Mindestbreite nach Optionsinhalt (Titel + Datum) → Select ragt über den rechten Rand, Plus-Knopf ist auf dem iPhone nicht sichtbar. Desktop ok (breiteres Panel).

**Gleiche Konstruktion:** dieselbe Select+Knopf-Zeile nochmals in der Desktop-Ansicht derselben Datei (mitfix mitgezogen). „Kurskarte verkaufen“ / Checkout: kein Select+Knopf-Flex — kein weiterer Fix.

## Fix

Unter 640 px (`sm:`): Select volle Breite, Knopf darunter volle Breite (`h-12`), Abstand `gap-2` (8 px). Ab 640 px: nebeneinander, Select `min-w-0 flex-1`, Knopf `sm:w-auto sm:h-auto`.

## Ablage DEV

| Schritt | Beleg |
|---------|-------|
| Hotfix-Branch von `origin/main` | `hotfix/nutzerverwaltung-kurs-zuweisen-mobil` @ `6a9f380` |
| Diff | nur `src/pages/Users.tsx` (+6/−6) |
| CI-Äquivalent auf Hotfix (`tsc --noEmit`, lint, build) | grün (main hat noch kein `check:ci`) |
| Julius-Commit | `bfc7f9b` |
| `npm run check:ci` auf Julius | grün |
| Check-Run **Workers Builds: omlify-dev** | `success` für `bfc7f9b` (2026-10-08T18:05:27Z) |
| Live-Bundle DEV | `https://demoalpha.omlify-dev.de/assets/index-Do4v4OPN.js` |
| Merkmal DEV | `h-12 w-full flex-shrink-0` @860434 |

## PROD (nach Merge #175)

| Schritt | Beleg |
|---------|-------|
| Merge-Commit `main` | `5a40976` — Merge pull request #175 |
| Check-Run **Workers Builds: yogaflow-dev** | `success` für `5a40976` (2026-10-08T18:16:45Z) |
| Live-Bundle PROD (Studio-Subdomain; Apex `omlify.de` = Marketing) | `https://demo.omlify.de/assets/index-DvYDaclZ.js` (gleich auf `yomita.omlify.de`) |
| Merkmal PROD | `h-12 w-full flex-shrink-0` @645350 |
| `origin/main` → `Julius` | Merge `88c0694` (Konflikt `Users.tsx`: Julius Coverage-`onChange` behalten) |
| `npm run check:ci` nach Merge | grün |
| Julius HEAD (nach Doku) | siehe Push |

## Abschluss

Hotfix auf PROD live. Julius enthält `main`. Keine offenen Schritte zu diesem Hotfix.
