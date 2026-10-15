# Bericht UX-1 — Erstatten in einem Schritt, Zahlungen mit Reitern, Einstellungen — 2026-10-04

Status: **fertig**. Klicktest Julius 04.10.2026, alle Punkte ok, 360 + 1280 px.
Nur Oberfläche. Keine Migration, keine Edge Function.

Vorgabe: [docs/stories/ux1_zahlungen_erstatten_einstellungen.md](../stories/ux1_zahlungen_erstatten_einstellungen.md).
Grundlage: [DESIGNSYSTEM.md](../DESIGNSYSTEM.md), [Entscheidung 10](../entscheidungen/10_Erstattung.md),
[Entscheidung 11](../entscheidungen/11_Zahlungsuebersicht.md) (gilt, bestätigt 04.10.2026).

## Commits

- `d781c94` docs(geldkette): Entscheidung 11 gilt, bestaetigt von Julius
- `6fba410` feat(geldkette): UX-1 Erstatten in einem Schritt, Zahlungen-Reiter, Einstellungen
- `98f8fc8` fix(geldkette): UX-1 E2E Buchungen nach Speichern ohne Dialog-Blockade
- `cb01b2c` docs(geldkette): UX-1 Bericht und STAND, Haltestelle Klicktest

## DoD

- `npx tsc -p tsconfig.app.json --noEmit` Exit 0
- Unit `refund_texts.ts` + `ux1_ui.ts`: 18/18
- E2E: UX-1 5/5, refund 3/3, payments 1/1, datefields 2/2
- Screenshots 360/1280 unter `docs/screenshots/ux1/` (nicht committet)
- Keine Migration, keine Function, keine Secrets

## Teil 1 — Erstatten in einem Schritt

Gleiche Komponente `PaymentRefundSheet` in Kasse und Zahlungen.

Kasse: Online-Zahlung und 10er-Karte als getrennte Zeilen. „Erstatten“ sitzt rechts in der
Online-Zeile (nur Owner/Admin, nur Rest > 0). „Mehr“ hat kein Erstatten mehr.

Sheet in einem Schritt: Kopf Name · Kurs · Termin, „Bezahlt … · noch erstattbar …“, Segment
Alles / Teilbetrag, Grund-Chips (Kulanz · Doppelt gebucht · Krankheit · Sonstiges), ein
Primärknopf mit Betrag. Kein „Weiter“. Gebührenhinweis darunter. Erfolg kurz im Sheet
(„10,00 € werden erstattet“), Liste lädt neu.

Fehler: Betrag zu hoch oder leer am Feld mit Icon; Serverfehler in der Hinweisbox über dem Knopf
(`role="alert"`). Gespeicherte Notiz: Chip-Text plus optionaler Zusatz (bei Sonstiges Pflicht).

## Teil 2 — Ein Menüpunkt „Zahlungen“

Sidebar: nur noch „Zahlungen“, Badge wenn offene Zahlungen existieren (Personen, 9+).
Reiter [ Offen ③ ] [ Alle ], sticky. Standard Offen wenn > 0, sonst Alle. URL `?tab=offen|alle`.
`/open-payments` → `/payments?tab=offen`. Inhalte unvermischt (bisherige Seiten).
Dashboard-Karte „Offene Zahlungen“ zielt auf `?tab=offen`.

## Teil 3 — Einstellungen mit Kategorien

Mobil: Übersicht, dann Unterseite mit Zurück. Desktop: linke Spalte + rechter Inhalt.
Routen `/settings/<kategorie>`. Alte Anker `#steuern` / `#online-zahlung` leiten auf
`/settings/zahlungen` um (datefields-E2E bleibt grün).

Studio nur Owner (wie bisher `StudioDesignSection`). Benachrichtigungen und Rechtliches
ausgeblendet — kein Inhalt. Warteliste/Nachrücken sind keine Studio-Schalter; die Statuszeile
sagt „Warteliste an“, weil die Produktfunktion immer da ist. Studio-Adresse gibt es nicht
(kein Backend).

### alt → neue Kategorie

| Bisher | Neue Kategorie |
|---|---|
| StudioDesignSection (Name, Logo, Farben, Anzeige) | Studio |
| Systeminformationen (Anwendungsname) | Studio, unten. „Datenbankstatus: Verbunden“ entfällt — war fest, keine Prüfung |
| Buchungseinstellungen (Standard-Plätze, Stornofrist) | Buchungen |
| OnlinePaymentSection (Online, Vor Ort, Stripe-Konto) | Zahlungen |
| TaxSettingsSection (Steuerstatus, CSV-Export) | Zahlungen |
| PassProductsSection | Karten |
| Team (Lehrende/Admins/Rollen) | Team — Liste plus Link zur Nutzerverwaltung. Rollen ändern bleibt `/users` |
| Benachrichtigungen | nicht gezeigt (kein Inhalt) |
| Rechtliches / Impressum | nicht gezeigt (keine Studio-Texte) |

## Tests

```
ok 1 › 1 — Owner erstattet in der Kasse Alles in einem Schritt
ok 2 › 2 — Teilbetrag zu hoch sperrt, dann gültig Erfolg
ok 3 › 3 — Zahlungen: Reiter, URL, alte Route leitet um
ok 4 › 4 — Einstellungen: Übersicht → Buchungen → Stornofrist speichern
ok 5 › 5 — Aufmerksamkeit bei fehlendem Steuerstatus (Test-Studio)
```

Test-Studio in (5): eigener Tenant ohne Steuerstatus, Aufräumen über `delete_tenant_complete`.

## Abweichungen / eigene Entscheidungen

- Team ändert Rollen nicht selbst, sondern verweist auf `/users` — sonst wäre die
  Nutzerverwaltung verdoppelt worden.
- Aufmerksamkeit „Steuerstatus fehlt“ auch, wenn die Plattform an ist (nicht nur wenn Online
  schon aktiv ist) — sonst wäre (5) auf einem neuen Studio unsichtbar.
- „Datenbankstatus: Verbunden“ nicht übernommen (war tot).

## Klickliste (360 px, omlify-dev.de)

1. Kasse, online bezahlt: Zeile „Online bezahlt · 24,00 €“ mit „Erstatten“; 10er-Karte eigene Zeile.
2. Erstatten: Alles vorausgewählt, Chip, ein Knopf — kein Weiter. Erfolg kurz im Sheet.
3. Teilbetrag 99 €: Fehlerrand + „Höchstens … möglich“, Knopf gesperrt; dann 10 € → Erfolg.
4. Sidebar: ein Punkt „Zahlungen“, Badge wenn etwas offen ist.
5. `/open-payments` landet auf Reiter Offen; Reiter Alle ändert `?tab=alle`.
6. Einstellungen mobil: Übersicht mit Statuszeilen; Buchungen → Stornofrist speichern → neuer Wert.
7. „Braucht deine Aufmerksamkeit“ nur wenn etwas fehlt (Steuerstatus / Stripe).
8. Studio-Kategorie nur als Owner; Admin sieht sie nicht.
9. Zahlungen-Reiter Alle: Tipp auf Online-Zahlung öffnet dasselbe Erstatten-Sheet.
10. Desktop 1280: Einstellungen links Liste, rechts Inhalt.

## Klicktest Julius

04.10.2026 — alle Punkte der Klickliste ok, 360 + 1280 px. Keine Nacharbeit.
