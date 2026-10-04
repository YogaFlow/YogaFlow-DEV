# Bericht UX-5 — Buchungsleiste, Toast-Regel, Demo-Studio

Status: **angehalten** (Haltestelle 4: Inventur demoalpha — Julius bestätigt vor Datenänderung).  
Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux5_buchungsleiste_toast_demo.md](../stories/ux5_buchungsleiste_toast_demo.md).

## A — Buchungsleiste mobil

Gestapelt unter `lg` (`course-booking-bar-mobile`):

1. Preis links (20 px fett + „pro Termin“) · Frist rechts (klein grau, max. 2 Zeilen)
2. Zahlart als Auswahlfeld (48 px): Rahmen + Chevron nur bei mehreren Wegen; „Ändern“ entfällt; „Neu“-Abzeichen vor dem Chevron, Hinweis darunter
3. Primärknopf volle Breite, 52 px

Innenabstand 16 px, Trennlinie oben + leichter Schatten, `safe-area-inset-bottom`.  
Desktop-Buchungskarte: gleiche Reihenfolge (Preis+Frist → Zahlart → Knopf), Belegung dazwischen unverändert.

## B — Toast-Regel (ersetzt N2)

| Art | Rückgängig | Dauer | Balken |
|---|---|---|---|
| Bestätigung (gebucht, …) | nein | 4 s | nein |
| Entfernen/Abmelden (ohne Erstattung) | ja | 6 s | 2 px, 60 % |
| Fehler | — | bis ✕ | nein |

- Buchungen ohne Rückgängig (auch mit Karte)
- Jeder Toast: Wischen oder ✕ schließt; Pause bei Hover/Fokus bleibt
- Designsystem-Tabelle ersetzt

**Offen (bewusst nicht in diesem Schritt):** Staff-Abmelden in `Participants.tsx` hat weiterhin keinen Undo-Knopf (nur Bestätigungs-Toast 4 s). Story-Tabelle nennt „Teilnehmer entfernen“ — nach Klicktest nachziehen, wenn gewünscht.

## C1 — Inventur demoalpha (nur lesen)

Zählung DEV, Studio `demoalpha`, 04.10.2026:

| Tabelle / Kennzahl | Anzahl |
|---|---|
| Kurse kommend | 117 |
| Kurse vergangen | 15 |
| Kurse abgesagt | 0 |
| Anmeldungen gesamt | 143 |
| davon mit Geld-/Karten-Spur | 98 |
| davon ohne Geldspur | 45 |
| Kurse mit mind. einer Geldspur-Anmeldung | 73 |
| Teilnehmende (`role=user`) | 85 |
| davon mit Geldspur | 74 |
| davon ohne Geldspur | 11 |
| Nutzer gesamt (alle Rollen) | 88 |
| Karten (`passes`) | 9 |
| Zahlungen | 198 |
| Belege | 158 |
| Erstattungen (`payment_refunds`) | 78 |
| Hauptbuch (`ledger_entries`) | 384 |
| Nachrichten | 0 |
| Benachrichtigungen | 137 |
| AVV/Legal-Zustimmungen | 2 |
| Events / Audit (append-only) | 912 / 893 |

### Einstufung für Reset

| löschbar (kein Geld-/Beleg-/Hauptbuch-/AVV) | nicht löschbar → ausblenden / stehen lassen |
|---|---|
| Kommende/vergangene Kurse ohne Geldspur-Anmeldungen; Anmeldungen ohne Zahlung/Kartenbewegung; Teilnehmende ohne Geldspur; Nachrichten; Benachrichtigungen ohne Prüfspur-Zwang | Zahlungen, Belege, Erstattungen, Hauptbuch, Events, Audit, AVV-Zustimmungen; Kurse/Personen mit Geldspur — Vergangenheit belassen; abgesagte Testkurse mit Geldspur → intern `archived` (noch zu bauen), nicht löschen |

Owner-Profil (Konto, Design, Anbieter, Zahlungs-/Steuer, Stripe, AVV) bleibt unangetastet.

## Tests (A/B)

| Lauf | Ergebnis |
|---|---|
| `npm run check:ci` | grün |
| Unit `ux5_buchungsleiste_toast` (Toast-Regel + 4 Snapshots) | grün |
| Unit ux3/ux4 Toast-Dauer angepasst (4 s) | grün |
| E2E `e2e/ux5.spec.ts` (e2eapp) | **1/1** — Buchung ohne Undo 4 s; Abmelden mit Undo 6 s; Zahlart-Feld öffnet |
| E2E `e2e/zw1.spec.ts` | **1/1** (angepasst: kein „Ändern“, Buchungs-Toast ohne Undo) |

Screenshot (nicht committen): `docs/screenshots/ux5/booking-bar-onsite-360.png`.

## Nächste Schritte nach Freigabe

1. **C2** Reset-Skript `npm run dev:demo:reset -- demoalpha` (`--dry-run` zuerst), DEV-Guard, idempotent  
2. **C3** Seed v2 (6 Kurse, Vera/Karla/Olaf/Nina, …)  
3. Haltestelle 5: Klickliste (max. 8)

## STOPP — Haltestelle 4

Bitte bestätigen, dass demoalpha wie oben aufgeräumt werden darf (löschbar entfernen, Geldspur-Kurse/Personen nur ausblenden/`archived`, Owner-Profil behalten).  
Ohne deine Bestätigung keine Schreibzugriffe auf Studio-Daten.
