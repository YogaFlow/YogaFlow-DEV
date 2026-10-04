# Bericht UX-3 — Feinschliff nach Klicktest UX-2

Status: **fertig** (Haltestelle 5: Klicktest Julius). Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux3_feinschliff.md](../stories/ux3_feinschliff.md).  
Sonderregel wie UX-2: Kursdetail mobil 360 pixelgleich; Kasse mobil nur C1-Wording geändert (neue Baseline).

## Commits

Siehe `git log` nach Push — Schichten A / B / C / D / Doku+E2E.

## A — Toast statt Erfolgsdialog

| Stelle | Alt | Neu |
|---|---|---|
| `FeedbackDialog` (alle Aufrufer) | Modal + OK, Abdunklung ohne Unschärfe | Toast via `ToastProvider` (Erfolg 4 s, `role=status`; Fehler bis Schließen, `role=alert`) |
| `CourseEnrollmentDialogs` | Eigenes OK-Modal | `FeedbackDialog` → Toast |
| `useCourseEnrollment` Abmelden | Erfolgsdialog | Toast + **Rückgängig** (5 s), solange keine Erstattung |
| `Participants` / `Users` / `Messages` / Settings / Deletion / Cancellation / OpenPayments | FeedbackDialog | unveränderte Call-Sites, Toast-Adapter |
| Destruktiv (absagen, löschen, erstatten, entfernen) | ConfirmDialog | unverändert + `ModalBackdrop` |

Designsystem: Abschnitt „Rückmeldungen (Toast)“ ergänzt.

## B — Mails / Kalender

| Punkt | Ergebnis |
|---|---|
| `calendar-ics` Edge Function | GET `?t=` HMAC → `text/calendar`; gefälscht/abgelaufen → 404 (Deno-Unit) |
| Secret | `CALENDAR_ICS_SECRET` in DEV gesetzt + deployt |
| Knopf „In Kalender eintragen“ | https auf `…/functions/v1/calendar-ics?t=…` |
| Sekundär | „Google Kalender“ TEMPLATE-Link |
| ICS-Anhang | bleibt |
| Entwickler-Hinweis „Block 2“ | entfernt; Test `mail_copy_test.ts` prüft Block/TODO/Story |
| Akzent | Bestätigung + Erstattung über `resolveBrandAccent` (Marke / Omlify-Grün) |
| Datumsblock | `MO / 5 / OKT` |
| Abmeldezeile | vor Frist „Kostenlos abmelden bis …“; nach „Die kostenlose Abmeldefrist ist abgelaufen.“ |
| Erstattungs-Mail | „… € sind auf dem Weg zu dir“, Terminkarte muted, Erstattungskasten, Fuß wie Bestätigung |
| Nachrücken / ops-monitor | gleiche Shell/Akzent |

**Mail-Clients (Julius, Haltestelle 5):** iPhone Mail, Gmail Web, Gmail Android, Outlook Web — echte Screenshots ausstehend.

## C — Wording + Export

### Check-in (C1) — geänderte Nutzertexte

| Alt | Neu | Ort |
|---|---|---|
| Kassieren | Check-in | Seitentitel, Dashboard-Sektion, Participants-Link, aria-labels |
| Zur Kasse | Zum Check-in | RemovePersonDialog |
| Kassieren geht erst… | Check-in geht erst… | courseCheckout/passes/Users |
| (Primärknopf) Bar | Einchecken | CourseCheckout mobil+Desktop |
| Vermerken | Zahlung vermerken | Betragsdialog |
| — | Wer ist da, wer hat bezahlt. | Unterzeile Check-in |
| — | Check-in öffnen / Teilnehmerliste | Kursdetail Desktop Staff |

Route `/kassieren` und interne Namen unverändert.

### Export (C2)

Chips Dieser/Letzter Monat · Dieses Jahr · Eigener Zeitraum; Monats-Umschalter; Vorschauzeile „N Zahlungen im Zeitraum“; zwei Auswahlkarten statt Radio-Liste.

## D — Kursdetail Desktop

- Inhalt `max-w-[1120px]`, Brotkrumen „Kurse ›“, Titel 32 px, Chips, ⋯-Menü (Bearbeiten / absagen / löschen)
- Links: 3 Kacheln Dauer · Lehrende · Ort; „Über den Kurs“ ~70 ch
- Rechts sticky: Preis, Balken „n von max · frei“, Abmeldefrist, CTAs
- Mobil: Struktur wie UX-2-Referenz (`coursedetail-360` pixelgleich)

## Tests

| Lauf | Ergebnis |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | grün |
| `npm run test:deno` | **195/195** |
| Unit `scripts/test/ux3_toast_export.ts` | 3/3 |
| E2E `e2e/ux3.spec.ts` | **3/3** (Toast+Undo, ⋯ Absage, Export-Chip) |
| E2E `e2e/ux2-b3.spec.ts` | **4/4** (360 Kursdetail pixelgleich; Kasse-360 neue C1-Baseline) |

DEV-Deploy: `calendar-ics`, `dispatch-emails`, `send-email` → `mufxhtctutfpzklwqnze`.

## Klickliste (Julius, max. 12) — Haltestelle 5

1. Beliebige Aktion (z. B. Abmelden): Toast unten, kein OK-Dialog; bei Abmelden ohne Erstattung „Rückgängig“.
2. Fehlerfall (z. B. doppelte Anmeldung): Toast Fehlerfarbe bleibt bis Schließen.
3. Kurs absagen / löschen: Bestätigung mit Abdunklung + Unschärfe.
4. Bestätigungsmail: https-Kalender-Knopf öffnet ICS; darunter „Google Kalender“.
5. Mail: keine Entwickler-Hinweise; Datumsblock mit Wochentag; Abmeldetext freundlich.
6. Erstattungsmail: neues Layout inkl. Beleg-Link und Fuß.
7. Navigation/Dashboard: „Check-in“ statt „Kassieren“; Seite Unterzeile „Wer ist da…“.
8. Check-in: „Einchecken“ / „Zahlung vermerken“.
9. Zahlungen › Exportieren: Chips + Monats-Umschalter + Vorschauzeile + zwei Karten.
10. Kursdetail mobil 360: wie UX-2 (Leiste unten).
11. Kursdetail Desktop ≥1024: Brotkrumen, ⋯, Kacheln, sticky Buchungskarte, „Check-in öffnen“.
12. Optional: Mail-Screenshots Gmail Web + iPhone hell/dunkel → `docs/screenshots/ux3/`.

## Offen

- Echte Mail-Client-Checks (Punkt 4–6, 12) nur durch Julius im Postfach.
- Live-Probe gefälschtes Token im Browser: Deno-Unit deckt 404-Logik; Deploy erledigt.
