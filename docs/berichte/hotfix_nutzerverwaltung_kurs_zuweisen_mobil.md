# Bericht — Hotfix Nutzerverwaltung › Kurs zuweisen mobil

Status: **angehalten** (Haltestelle 5 — iPhone-Klicktest Julius)  
Stand: 2026-10-08 · Story [hotfix_nutzerverwaltung_kurs_zuweisen_mobil.md](../stories/hotfix_nutzerverwaltung_kurs_zuweisen_mobil.md)

## Teil 0

| Branch | Mobil (`lg:hidden`) | Desktop (`hidden lg:block`) |
|--------|---------------------|-----------------------------|
| `origin/main` | `src/pages/Users.tsx` ~794 | ~1108 |
| `Julius` | `src/pages/Users.tsx` ~990 | ~1368 |

**Ursache (beide gleich):** Flex-Zeile `flex gap-2` mit `select.flex-1` ohne `min-w-0`. Native `<select>` behält intrinsische Mindestbreite nach Optionsinhalt (Titel + Datum) → Select ragt über den rechten Rand, Plus-Knopf ist auf dem iPhone nicht sichtbar. Desktop ok (breiteres Panel).

**Gleiche Konstruktion:** dieselbe Select+Knopf-Zeile nochmals in der Desktop-Ansicht derselben Datei (mitfix mitgezogen). „Kurskarte verkaufen“ / Checkout: kein Select+Knopf-Flex — kein weiterer Fix.

## Fix

Unter 640 px (`sm:`): Select volle Breite, Knopf darunter volle Breite (`h-12`), Abstand `gap-2` (8 px). Ab 640 px: nebeneinander, Select `min-w-0 flex-1`, Knopf `sm:w-auto sm:h-auto`.

## Ablage

| Schritt | Beleg |
|---------|-------|
| Hotfix-Branch von `origin/main` | `hotfix/nutzerverwaltung-kurs-zuweisen-mobil` @ `6a9f380` |
| Diff | nur `src/pages/Users.tsx` (+6/−6) |
| CI-Äquivalent auf Hotfix (`tsc --noEmit`, lint, build) | grün (main hat noch kein `check:ci`) |
| Julius-Commit | `bfc7f9b` |
| `npm run check:ci` auf Julius | grün |
| Check-Run **Workers Builds: omlify-dev** | `success` für `bfc7f9b` (2026-10-08T18:05:27Z) |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-Do4v4OPN.js` |
| Merkmal im Bundle | `h-12 w-full flex-shrink-0` @860434; `min-w-0 w-full flex-1` @860076 |

PR-Kandidat (noch nicht erstellt / nicht gemerged):  
https://github.com/YogaFlow/YogaFlow-DEV/compare/main...hotfix/nutzerverwaltung-kurs-zuweisen-mobil

## Klickliste Julius (iPhone / 360–390)

1. `https://demoalpha.omlify-dev.de` — Nutzerverwaltung → Person aufklappen → „Kurs zuweisen“.
2. Select und Hinzufügen-Knopf beide sichtbar (Knopf unter dem Select).
3. Kurs wählen, Hinzufügen — Zuweisung klappt.
4. Optional Tablet ≥640: weiterhin nebeneinander, nichts abgeschnitten.

Screenshots 360 vorher/nachher nach Abnahme in diesen Bericht.

## Offen nach iPhone-OK

1. PR `hotfix/…` → `main`, CI grün, **Julius merged** (Agent merged nicht).
2. Cloudflare-Build PROD-Worker abwarten; Live-Bundle auf omlify.de prüfen.
3. `origin/main` in `Julius` mergen.
