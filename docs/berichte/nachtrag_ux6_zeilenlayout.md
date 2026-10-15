# Bericht Nachtrag UX-6-2 — Personenzeile mobil luftiger

Stand: 2026-10-05 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

## Erledigt

| Teil | Inhalt |
|---|---|
| Gestaltung | Mobil (&lt; 640 px): gestapelte Zeile Name/Betrag/⋯ → Status eine Zeile mit Punkt → Aktionen; Erledigte eine Zeile; „Mit Karte“; Desktop-Tabelle ab 640 px unverändert im Aufbau |
| Demodaten | `demo_ux6.mjs`: Kurs „Hatha am Nachmittag“; Olaf online (prepare/complete); Karla offen mit gültiger Karte |

## Nachweise

- `npm run check:ci` — grün (vor Push)
- `node scripts/dev/demo_ux6.mjs` — OK
- Textsuche: Knopf „Mit Karte“ in Mobil- und Desktop-Aktion

## Haltestelle 5 — Klickliste (max. 4)

1. **Owner demoalpha**, Handy 360 — Kurs „Hatha am Nachmittag“: Vera gestapelt (Status 1 Zeile, „Bar erhalten“); Karla mit „Mit Karte“; Olaf eine Zeile „Bezahlt · online“.
2. **Owner**, 390 px — gleiche Liste, kein Status-Umbruch, Touch 44 px.
3. **Owner**, 1280 px — Desktop-Tabelle wie zuvor (Name · Zahlstatus · Karte · Aktion).
4. **Owner** — nach erneutem `node scripts/dev/demo_ux6.mjs`: Olaf online, nicht bar; Karla zeigt „Mit Karte“.

Screenshots 360 / 390 / 1280 nach Klicktest (Julius).
