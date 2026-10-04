# Lauf B1 / B2 — 04.10.2026

Branch `Julius`. Kein PROD, kein Stripe-Dashboard, kein Merge nach `main`.

## UX-1 Vorab

Status **fertig**. Klicktest Julius 04.10., 360 + 1280. Commit `fa3adad`.

## B1 — Studio-Angaben, Bestellknopf, Bestätigung, Belege

Status **fertig** (Klicktest offen). Bericht: [b1_bestellknopf_belege.md](b1_bestellknopf_belege.md).

| | |
|---|---|
| Commits | `6550508` Angaben/Sperre · `9aa624f` Belege · `cbbd323` Mail · `5391d5e` Oberfläche |
| Migrationen | `20261004090000`, `20261004100000`, `20261004110000` |
| Functions | `dispatch-emails`, `send-email` (DEV deployt) |
| DoD | apply + SQL-Tests + Unit-Texte + Deno + tsc grün |
| E2E | `e2e/b1.spec.ts` (3 Fälle) angelegt; Lauf nach SPA-Deploy |

## B2 — Überwachung, AVV v2, AVV-Zustimmung

Status **in Arbeit**.

| Teil | Stand |
|---|---|
| AVV-Text v2 | Ergänzungen aus `AVV_Aenderungen_v2_Zahlungen.md` in `docs/legal/AVV_Auftragsverarbeitung.md`, Stand 04.10.2026, gerendert, kein PROD-Deploy |
| Überwachung `ops-monitor` | **hier weitermachen** |
| AVV-Zustimmung `legal_acceptances` | wartet auf Überwachung nicht; K2-Sperre liegt aus B1 bereit |

## Fragen an Julius

1. Heartbeat-Konto (healthchecks.io o. Ä.) anlegen und `OPS_HEARTBEAT_URL` setzen? **Empfehlung:** ja, sonst merkt niemand, wenn Cron komplett steht. Bis dahin bleibt der Aufruf still.
2. `OPS_ALERT_EMAIL` auf DEV ist `support@omlify.de` (darf gesetzt werden). **Empfehlung:** so lassen; echte Mail nach erstem Test-Job prüfen.
3. Klicktest B1 vor B2-Oberfläche? **Empfehlung:** parallel; Halt 5 blockiert nicht.

## Gemeinsame Klickliste

**B1**
1. Einstellungen → Rechtliches: Anbieterangaben speichern (360 + 1280).
2. Ohne Angaben: Aufmerksamkeit; Kursknopf „Anmelden“.
3. Mit Angaben: „Weiter zur Buchung“.
4. Sheet: Pflichtangaben, Knopf genau „Zahlungspflichtig buchen“.
5. Mit 4242… buchen → Meine Anmeldungen → Beleg.
6. Echte Bestätigungsmail mit Beleg ansehen.
7. Owner erstattet 10 € → Erstattungsbeleg.
8. Kurs > 250 €: Hinweis vor Ort.

**B2**
9. Überwachungsmail ansehen (nach Test-Job).
10. AVV-Volltext v2 unter /legal/auftragsverarbeitung (Stand 04.10.).
11. Banner „Bitte bestätige den Vertrag…“ → AVV abschließen.
12. Danach Datum/Name/Version sichtbar, Banner weg.
13. Online-Schalter ohne AVV: `AVV_MISSING`; nach Abschluss frei.
14. Onboarding: ohne AVV-Häkchen kein Abschluss.
15. Einstellungen Rechtliches AVV-Abschnitt 360 + 1280.
