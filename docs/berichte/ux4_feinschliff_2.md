# Bericht UX-4 — Feinschliff 2 + Sammel-Nachtrag

Status: **angehalten** (Haltestelle 5: Klicktest Julius). Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux4_feinschliff_2.md](../stories/ux4_feinschliff_2.md).  
Sonderregel: Mobile Pixelgleichheit **nicht** für Kopfleiste (D2), Kursdetail-Aktionen (A3), Buchungskarte (B1); alles andere mobil unverändert. Logik-/Gestaltungs-Commits getrennt.

## A1 — Ursache „Rückgängig“ nicht sichtbar / Tippen wirkungslos

| Faktor | Befund |
|---|---|
| Kontrast | Undo war `text-brand` auf heller Surface-Pille — unauffällig (Julius: „nicht sichtbar“) |
| Textlänge | `toastDisplayText` baute „Titel — Nachricht“ → z. B. „Abmeldung erfolgreich — Erfolgreich abgemeldet.“, Knopf wurde gequetscht |
| E2E | `e2e/ux3.spec.ts` prüfte nur Sichtbarkeit von `toast-undo`, **kein Click** |
| Hit-Target | Viewport `pointer-events-none` / Item `auto` war korrekt; z-Index auf `z-[100]` angehoben |

Fix: dunkle Pille + heller Undo-Knopf ≥ 44 px + E2E tippt wirklich „Rückgängig“.

## A2 — Toast-Design

Dunkle Pille (`bg-text`, weiß), Radius 14 px, Schatten, max. 420 px; Icon-Kreis (Marke/Gefahr); Zeitbalken nur mit Rückgängig (5 s); ohne Undo 4 s; Hineingleiten 200 ms, wegwischbar; `prefers-reduced-motion` → nur Fade.  
Rückgängig nur wenn vollständig umkehrbar (keine Online-Erstattung) — Regel im Designsystem.

## A3 / B / C / D / E — Kurz

| Punkt | Ergebnis |
|---|---|
| A3 | Lose Absagen/Löschen-Links mobil entfernt; „⋯“ oben rechts wie Desktop |
| B1 | Gemeinsame `cancellationDeadlineLine` / `formatFriendlyCancellationDeadline` (Karte, Checkout-Label, Mail); keine „24 h vor Kursbeginn“-Zeile mehr |
| B2 | Karten-Icon + „Du bezahlst direkt bei der Buchung“; Schloss nur noch im Bezahl-Fuß |
| B3 | Erfolgszustand: Kopf aus, „Du bist dabei!“, eine Kurszeile, Kalender/Fertig/Beleg |
| C1 | SPA `/calendar?t=` (+ `?rid=` eingeloggt); Mail-Primärknopf → Studio-Kalenderseite; ICS `inline` für Apple; `format=json` Meta |
| D1 | Menüreihenfolge Owner/Admin wie Vorgabe; Profil unten |
| D2 | Mobil Markenstich ~8 % + Blur; Desktop unverändert; Kontrast-Unit ≥ 4,5:1 für 5 Farben |
| E AVV | Zwei Textänderungen § 2; Hash = SHA-256 normalisierter Markdown; ≠ alter HTML-Hash `081aa26d…`; neuer Hash `b90051ca…` |
| E FormField | Login/Register + Create/EditCourse Titel/Beschreibung |
| E E2E ux2 | auf DEV **2/2 grün** (Locator Backdrop angepasst) |

## AVV-Diff (nur die zwei Story-Änderungen)

```diff
-**Zweck:** Betrieb einer Kurs- und Buchungsverwaltung für den Verantwortlichen.
-Abwicklung von Online-Zahlungen …
+**Zweck:** Betrieb einer Kurs- und Buchungsverwaltung für den Verantwortlichen sowie die Abwicklung von Online-Zahlungen …

-Übermitteln an die betroffene Person, Einschränken, Löschen.
+Übermitteln an die betroffene Person und an den Zahlungsdienstleister des Verantwortlichen, Einschränken, Löschen.
```

Stand-Datum bleibt **04.10.2026**. Die eine DEV-Zustimmung demoalpha (alter Hash) bleibt append-only → Banner erscheint wieder (erwartet).

## Kalender — Grenzen (nicht lösbar) + Geräte-Tabelle

| Gerät / Client | Erwartung | Automatisiert | Manuell (Julius) |
|---|---|---|---|
| iPhone Safari | Primär Apple (ICS inline) → „Zum Kalender hinzufügen“ | UA-Mock Reihenfolge | offen |
| iPhone Gmail-App | Link oft in Chrome → Chrome entscheidet über .ics | — | offen |
| Android | Primär Google, darunter Andere (.ics) | Reihenfolge im Unit | offen |
| Desktop | Outlook/Apple (.ics) + Google gleichwertig | Unit | offen |
| Google-Termin-Link mobil ohne App | Desktop-Ansicht von Google | — | bekanntes Limit |

## Tests

| Lauf | Ergebnis |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | grün |
| `npm run test:deno` | **195/195** |
| Unit `ux4_feinschliff` + Hash + Toast + refund_texts | grün |
| E2E `e2e/ux4.spec.ts` | **4/4** (Undo-Tippen, online ohne Undo, ⋯ mobil, Kalender iPhone-UA) |
| E2E `e2e/ux2.spec.ts` | **2/2** |
| Functions DEV | `calendar-ics`, `dispatch-emails` deployt |

Screenshots (nicht committen): `docs/screenshots/ux4/`.

## Klickliste (Julius, max. 12) — Haltestelle 5

1. Abmelden (Bar/vor Ort): dunkler Toast, „Rückgängig“ tippbar → wieder angemeldet; Zeitbalken ~5 s.
2. Abmelden nach Online-Zahlung: Toast ohne „Rückgängig“.
3. Fehler-Toast: bleibt bis Schließen; dunkle Pille mit Gefahr-Icon.
4. Kursdetail mobil: „⋯“ oben rechts → Bearbeiten / Absagen / Löschen; keine losen roten Links unten.
5. Buchungskarte: „✓ Angemeldet · online bezahlt“ + eine konkrete Fristzeile (oder „… abgelaufen“); keine „24 h“-Floskel.
6. Nicht gebucht + Online: Karten-Icon + „Du bezahlst direkt bei der Buchung“.
7. Checkout Erfolg: „Du bist dabei!“, Kurs nur einmal, Kalender / Fertig / Beleg-Link.
8. Mail „In Kalender eintragen“ → Studio-Kalenderseite (nicht Direkt-Download).
9. Kalenderseite: Gerät-Reihenfolge; Apple-ICS inline; Google darunter.
10. Seitenmenü Owner: Übersicht → … → Profil ganz unten über Abmelden.
11. Kopfleiste mobil: leichter Markenstich, Titel lesbar; Desktop unverändert.
12. Einstellungen Rechtliches: AVV-Banner (neuer Hash) → Pop-up; Text enthält „Zahlungsdienstleister“.

## Offen / warte auf Julius

- Echte Geräte-Checks Kalender (Punkt 8–9, Tabelle oben).
- Nachzug Klicktest N1–N3 (siehe unten).

## Nachtrag UX-4 (Klicktest Julius) — N1–N3

Klickliste 1–12 ok bis auf N1–N3. Je ein Commit; `npm run check:ci` grün; Migration `20261004180000` auf DEV.

### N1 — AVV-Banner fehlte trotz neuem Hash

| | |
|---|---|
| Ursache | RPC verglich schon `content_hash`, aber `legal_document_versions` auf DEV hing noch am alten HTML-Hash `081aa26d…`. Die Demo-Zustimmung matchte den Kanon → `accepted: true` → kein Banner. |
| Fix | Migration setzt Kanon auf Markdown-SHA `b90051ca…`; `current_avv_accepted` / `get_legal_acceptance_status` nur noch per `content_hash`; Client: `accepted` nur wenn Server-Hash = `AVV_CONTENT_HASH`. |
| Test | `b2_legal_acceptances`: alte Hash-Zustimmung → `accepted: false`; Einschalten weiter gesperrt bis neue Zustimmung. |
| Commit | `c6de114` |

### N2 — Zeitbalken unsichtbar

| | |
|---|---|
| Ursache | Balken nur `h-0.5` (2 px) am unteren Rand der dunklen Pille — praktisch unsichtbar; Auto-Dismiss-Timer lief im Context ohne Pause-Kopplung. |
| Fix | 3 px `brandSoft` am unteren Rand; 5 s voll→leer; Hover/Fokus pausiert Balken und Dismiss; E2E prüft Sichtbarkeit und Schrumpfen. |
| Commit | `3ffb738` |

### N3 — Mobil Buchungsleiste unordentlich

| | |
|---|---|
| Fix | Zeile 1: Preis + „pro Termin“ links, Knopf „Zur Buchung“ rechts (`nowrap`, min. 48 px). Zeile 2: Icon-Spalte + „Bezahlung direkt…“ / Abmeldefrist. Padding 16 px + `safe-area-inset-bottom`. Desktop-Buchungskarte unverändert. Designsystem: Knöpfe brechen nie um. |
| Screenshots | `docs/screenshots/ux4/booking-bar-before-{360,390}.png` · `booking-bar-after-{360,390}.png` (nicht committen) |
| Commit | `c1687ee` |
