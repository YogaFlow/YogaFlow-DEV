Entscheidung 14 – Zahlungswege (Story ZW-1)

Stand: 04.10.2026 · Vorgegeben von: Julius in Story ZW-1 · Status: **gilt**
Grundlage: Story [zw1_zahlungswege_ein_klick.md](../stories/zw1_zahlungswege_ein_klick.md), Entscheidungen 09–12, DESIGNSYSTEM.

Entscheidungen

| # | Entscheidung |
|---|---|
| Z1 | Das Studio legt fest, welche Wege es anbietet: „Online (Karte, Apple Pay, Google Pay)“ und/oder „Vor Ort (bar o. ä.)“, mindestens einer. Ersetzt die heutige Logik „Online-Pflicht + Vor-Ort weiterhin erlauben“. |
| Z2 | Ist Online angeboten und technisch bereit (Plattform-Schalter, Stripe-Konto, Steuerstatus, Anbieterangaben, AVV, Preis ≤ 250 €), ist Online immer wählbar — unabhängig davon, ob Vor Ort zusätzlich erlaubt ist. (Heute verschwindet Online, sobald Vor Ort erlaubt ist → Fehler.) |
| Z3 | Karten (5er/10er) erscheinen nur, wenn die Person eine gültige, für den Kurs nutzbare Karte mit Guthaben besitzt. |
| Z4 | Standard-Weg (vorausgewählt, Ein-Tipp-Buchung): 1. gültige Karte → 2. Online → 3. Vor Ort. Alternativen sind immer über „Anders bezahlen“ erreichbar. |
| Z5 | Rechtlich: Auch eine Buchung mit „Vor Ort bezahlen“ ist ein Vertrag mit Zahlungspflicht, der online geschlossen wird (§ 312j BGB). Knopf deshalb ebenfalls „Zahlungspflichtig buchen“ mit Kurs, Termin, Preis direkt davor. Bei Buchung mit Karte entsteht keine neue Zahlungspflicht (bereits bezahlt) → Knopf „Mit 10er-Karte buchen“. |
| Z6 | Bestehende Einstellungen werden übernommen: online an + vor Ort an → beide; online an + vor Ort aus → nur online; online aus → nur vor Ort. Keine Studio-Einstellung geht verloren (Migration mit Vorher/Nachher-Zählung je Kombination im Bericht). |
