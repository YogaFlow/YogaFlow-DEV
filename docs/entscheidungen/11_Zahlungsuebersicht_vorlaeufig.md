Entscheidung 11 – Zahlungsübersicht für das Studio (Story 3.1) – VORLÄUFIG

Stand: 02.10.2026 · Vorgegeben von: Julius im Lauf-Auftrag vom 02.10.2026 · Status: **vorläufig**, bis Julius sie im Claude-Projekt bestätigt
Grundlage: Entscheidung 10 (R10: Übersicht direkt nach R1–R9), Story 3.2c (Erstatten-Sheet)

Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| Z1 | Wer | Nur Owner und Admin. Lehrende und Teilnehmende sehen den Bereich nicht. |
| Z2 | Was | Neuer Bereich „Zahlungen“: alle Zahlungen des Studios — Bar, PayPal, Überweisung, online, Kartenverkäufe. Erstattungen und Stornos sind ein **Status** der Zahlung, keine eigenen Zeilen. |
| Z3 | Spalten | Datum · Person · Wofür (Kurs + Termin oder Kartenname, z. B. „10er-Karte“) · Art · Betrag · Status. Status: bezahlt, teilweise erstattet („10,00 € von 24,00 €“), erstattet, Erstattung läuft, Erstattung fehlgeschlagen, Rückbuchung offen, storniert. Mobil (360 px) als Karten. |
| Z4 | Filter | Monat (Standard: aktueller Monat), Art, Status, Namenssuche. 50 je Seite, Blättern serverseitig. |
| Z5 | Summen | Keine Summen, kein Umsatz. Hinweis auf den CSV-Export. |
| Z6 | Detail | Tipp auf eine Zahlung öffnet das Detail mit Erstattungsliste und „Erstatten“ — dieselbe Komponente wie in 3.2c. |
| Z7 | Kartenmarke / letzte vier Ziffern | Nicht in dieser Story. |

Umsetzung (Ableitung, im Bericht 3.1 begründet)

- Status-Reihenfolge, falls mehreres zutrifft: Rückbuchung offen → Erstattung läuft → Erstattung fehlgeschlagen (letzte Erstattung gescheitert) → erstattet → teilweise erstattet → storniert → bezahlt.
- „Storniert“: Bar/PayPal/Überweisung mit Gegenbuchung (z. B. Kassieren rückgängig, Rückgabe nach Absage) oder stornierte Karte. Online-Zahlungen werden nie „storniert“, sondern erstattet.
- Monat nach Zahlungseingang (`received_at`, sonst `created_at`) in `Europe/Berlin`.
- Art-Filter: Bar, PayPal, Überweisung, Online.

Offen für Julius

- Bestätigen oder ändern; danach „vorläufig“ entfernen.
