# Bericht Nachtrag F — Fixes aus dem Gesamt-Klicktest

Stand: 2026-10-08 · Branch `Julius` · HEAD `6bc8607` · Status: **Haltestelle 5 (Klicktest)**

Grundlage: [nachtrag_gesamtklicktest_fixes.md](../stories/nachtrag_gesamtklicktest_fixes.md), L3 in [17_Studio_Rechtstexte.md](../entscheidungen/17_Studio_Rechtstexte.md).

## Erledigt

| Fix | Inhalt |
|---|---|
| F1 | `studio_tpl_accepted` = irgendeine Freigabe (nicht aktuelle Version). Anzeige/Resync/Anhang: zuletzt freigegebene Vorlagen-Version. `agb.v1`/`datenschutz.v1` wiederhergestellt, Kurskarte als `v2` (`2026-10-08`). CI-Hash-Prüfung + Regel in `omlify-autonom.mdc`. |
| F2 | Offene Zahlung = Anmeldungszeile aus `get_open_coverage`. Badge/Offen zählen `rows.length`. Sammel-Preview/Waive mit Archiv-Filter. |
| F3 | `demo_v3.mjs`: Termine relativ zum Seed-Zeitpunkt; Klarnamen; Teilerstattung = vergangenes „Vinyasa am Sonntag“. |
| F4 | Sammel-Abhaken unter der Überfällig-Liste, eingeklappt („Ältere Kurse … ›“), nur wenn offene Anmeldungen vor gestern. |
| F5 | Abschnitt „Kommt noch · zahlt vor Ort“ im Live-Bundle; nach frischem Seed sichtbar, wenn kommende offene Buchungen existieren (Morgen-Vinyasa). |

## F2 — woher kamen 11 und 9?

| Zahl | Ursache |
|---|---|
| Badge/Offen **8** | `countOpenCoveragePeople` → Distinct `user_id` (eine Person, zwei Kurse = 1) |
| Zu erledigen **8 + 1 = 9** | Summe der **Anmeldungen** (heute/gestern + ältere Sammelzeile) |
| Sammel **11** | `preview_pre_omlify_waive` ohne Archiv-Filter (+2 archivierte Anmeldungen) |

Nach Fix: Badge = Offen = offene Anmeldungen aus `get_open_coverage`. Abhaken = Teilmenge „vor Datum“, gleicher Archiv-Filter.

## Nachweise

- `npm run check:ci` — grün
- Migrationen: `20261008180000_f1_legal_template_l3`, `20261008190000_f2_open_count_archive_waive` (`npm run dev:apply`)
- Rauchtest F1: `node --experimental-strip-types scripts/test/f1_legal_l3.mjs` (v1→v2, Online bleibt bereit)
- Unit F2: `scripts/test/f2_open_counts.ts`
- Demo: Reset + Seed `2026-10-08T17:06:44.358Z` UTC — Heute Hatha, Gestern Yin, Morgen Vinyasa, Vinyasa am Sonntag 2026-10-04
- demoalpha/demobeta: `texts_ready` blieb bei `new_template` **true** (F1); danach auf v2 freigegeben für Klicktest

## Deploy-Nachweis (vor Haltestelle 5)

| Prüfung | Ergebnis |
|---|---|
| HEAD | `6bc8607` |
| Check-Run **Workers Builds: omlify-dev** | `success` für `6bc8607` (2026-10-08T17:19:55Z) |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-D4nwEN5e.js` |
| Merkmal | `Ältere Kurse auf einmal als erledigt markieren` @1492189; `Kommt noch · zahlt vor Ort` @1498531; `## 8. Kurskarten` @715322 |

## Haltestelle 5 — Klickliste (max. 8)

1. **F1 demobeta** — Rechtliches: Banner „Neue Vorlage“ bzw. nach Freigabe aktuell; Online bleibt bereit (Skript-Nachweis: `f1_legal_l3.mjs`).
2. **F2 demoalpha Owner** — Seitenleiste Zahlungen, Reiter Offen, Zu-erledigen-Offen-Summe: gleiche Zahl.
3. **F3** — Übersicht: Heute-/Gestern-Fälle; Namen ohne „Filler“; kein „Olaf Flow Teilerstattung“ in der Zukunft.
4. **F4** — Zahlungen › Offen: unter Überfällig nur Zeile „Ältere Kurse … ›“; aufgeklappt wie bisher.
5. **F5** — Zahlungen › Offen: Abschnitt „Kommt noch · zahlt vor Ort“ (Morgen-Kurs); Screenshot 360/1280.
6. **F1 demoalpha** — `/agb` zeigt Kurskarte-Wording (v2 freigegeben).
7. Optional: Sammel-Abhaken-Zahl ≤ Badge (Teilmenge vor Datum).
8. Screenshots 360/1280: Offen mit beiden Abschnitten + eingeklapptes Abhaken.
