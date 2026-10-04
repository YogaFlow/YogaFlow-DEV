# Bericht UX-5 — Buchungsleiste, Toast-Regel, Demo-Studio

Status: **angehalten** (Haltestelle 5: Klicktest).  
Stand 04.10.2026 · Branch `Julius` · Migration `20261004230000_ux5_archived_at` auf DEV

Vorgabe: [docs/stories/ux5_buchungsleiste_toast_demo.md](../stories/ux5_buchungsleiste_toast_demo.md).  
Freigabe C1: Julius, 04.10. (Leitplanken 0–5).

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

## C1 — Inventur demoalpha (vorher, nur lesen)

Zählung DEV, Studio `demoalpha`, 04.10.2026 (vor Reset):

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
| Benachrichtigungen (`user_notifications`) | 137 |
| AVV/Legal-Zustimmungen | 2 |
| Events / Audit (append-only) | 912 / 893 |

## C2 — Reset (`npm run dev:demo:reset -- demoalpha`)

Leitplanken eingehalten: kein `cancel_course` / `remove_member` / `unregister_*`; Jobs + E-Mail pausiert (`dev:jobs:pause`, `dev:email:pause`), danach Resume; nur demoalpha; Geldspur nur `archived_at` (keine Anonymisierung).

### Dry-run (vor Apply)

```json
{
  "delete_registrations": 45,
  "delete_courses": 59,
  "delete_users": 11,
  "archive_courses": 73,
  "archive_users": 74,
  "delete_messages": "all tenant",
  "delete_notifications": "all tenant"
}
```

### Apply — Änderungen

| Aktion | Anzahl |
|---|---|
| Anmeldungen gelöscht (ohne Geldspur) | 45 |
| Kurse gelöscht (ohne Geldspur) | 59 |
| Teilnehmende gelöscht (ohne Geldspur) | 11 |
| Kurse `archived_at` gesetzt | 73 |
| Teilnehmende `archived_at` gesetzt | 74 |
| Nachrichten / Glocken | geleert (Tenant) |

### Side-effects während Apply (vorher → nachher)

Skript prüft `provider_jobs`, `email_deliveries`, `events`, `ledger_entries` (Tenant).  
Ergebnis: **Δ ≤ 0** für alle vier (keine neuen Zeilen; Löschen von Alt-Outbox bei FK-Kindern der gelöschten Anmeldungen ist erlaubt). Apply endete mit `OK: 0 neue provider_jobs / email_deliveries / events / ledger`. Jobs und E-Mail danach wieder aktiv.

### Zweiter Lauf (Idempotenz, vor Seed)

```json
{
  "delete_registrations": 0,
  "delete_courses": 0,
  "delete_users": 0,
  "archive_courses": 0,
  "archive_users": 0
}
```

→ keine Änderungen.

Hinweis: Ein Reset **nach** dem Seed würde die neuen Demokurse ohne Geldspur wieder löschen — Reset nur einmal vor Seed laufen lassen.

## C3 — Seed v2 (`npm run dev:demo:seed -- demoalpha`)

| Artefakt | Stand |
|---|---|
| Kommende Kurse (sichtbar) | 6: Hatha am Morgen, Vinyasa Flow, Yin Yoga, Yoga für Rücken, Workshop Atem & Entspannung (35 €), Pilates |
| Lehrende (sichtbar) | Ben Lehrer, Lena Lehrerin (+ bestehend Tom Teacher) |
| Vera Vorort | 3 vergangene Buchungen vor Ort |
| Karla Karte | aktive 10er, Einheiten-Summe **6** |
| Olaf Online | 2 vergangene Online-Zahlungen |
| Nina Neu | 0 Buchungen |
| Zugangsdaten | nur `supabase/.env.dev` (`DEMO_*_EMAIL`, `DEMO_PASSWORT`) — nicht im Repo |

### Nachher (nach Reset + Seed, DEV 04.10.)

| Kennzahl | Wert |
|---|---|
| Kurse gesamt | 88 |
| davon sichtbar (`archived_at` null) | 15 |
| davon archiviert | 73 |
| davon kommend sichtbar | 6 |
| Anmeldungen gesamt | 107 |
| Teilnehmende `role=user` sichtbar / archiviert | 4 / 74 |
| Zahlungen | 204 |
| Belege / Erstattungen | 158 / 78 |
| Karten (`passes`) | 10 |
| Hauptbuch / Events | 396 / 923 |
| Nachrichten / Glocken | 0 / 0 |

(Zahlungen/Hauptbuch/Events steigen durch den Seed; Belege/Erstattungen unverändert zum Inventur-Stand.)

## Stellen, die `archived_at` berücksichtigen

### Server (Migration `20261004230000`)

- Spalten `courses.archived_at`, `users.archived_at` (Client-UPDATE entzogen)
- Trigger `registrations_archived_guard` → `COURSE_ARCHIVED` / Mitglied archiviert
- `register_for_course` → `COURSE_ARCHIVED` bei archiviertem Kurs
- `get_studio_payments(..., p_include_archived boolean DEFAULT false)` — Standard ohne Archiv

### Client

| Datei | Verhalten |
|---|---|
| `Courses.tsx` | Kurse nur `archived_at` null |
| `MyCourses.tsx` | wie oben |
| `CourseDetail.tsx` | archivierter Kurs nicht ladbar |
| `CourseCheckout.tsx` | nicht buchbar |
| `CalendarInvite.tsx` | ausgeblendet |
| `Dashboard.tsx` | Listen/Check-in ohne Archiv; Personenfilter |
| `Participants.tsx` | Kurse + Personen ohne Archiv |
| `Users.tsx` | Mitgliederliste ohne Archiv |
| `MyRegistrations.tsx` | archivierte Kurse ausgefiltert |
| `useMessagesData.ts` | Kurse/Personen ohne Archiv |
| `studioPayments.ts` / `Payments.tsx` | Standard ohne Archiv; Umschalter `payments-include-archived` |
| `types/index.ts` | Felder an Course/User |

Kartenprodukte (`pass_products.archived_at`) unverändert — eigene Story A4.

## Tests

| Lauf | Ergebnis |
|---|---|
| `npm run check:ci` | grün (nach C inkl. Migration/UI) |
| Unit `ux5_buchungsleiste_toast` | grün |
| E2E `e2e/ux5.spec.ts` (e2eapp) | **1/1** |
| E2e `e2e/zw1.spec.ts` | **1/1** |

## STOPP — Haltestelle 5 (Klickliste)

Konto-Angaben: Owner = Olivia Owner; Teilnehmende wie genannt. Passwörter in `supabase/.env.dev`.

1. **Owner · Kurse** — nur die 6 Seed-Kurse (+ ggf. keine Altlasten); keine 70+ Testkurse.
2. **Owner · Teilnehmer** — Vera, Karla, Olaf, Nina sichtbar; archivierte Alt-Personen weg.
3. **Owner · Zahlungen** — Standard ohne Archiv (kürzere Liste); Umschalter „Archiv anzeigen“ zeigt Alt-Zahlungen der archivierten Personen/Kurse.
4. **Owner · Einstellungen** — Studio, Anbieter, Stripe, AVV, Kartenprodukte unverändert.
5. **Vera** — Kursdetail: „Neu“-Hinweis an der Zahlart (nie online); Buchung → Toast **ohne** Rückgängig, ~4 s, ✕ schließt.
6. **Karla** — Karte noch 6; Buchung mit Karte möglich.
7. **Olaf** — Zahlart ohne „Neu“ (schon online); Buchung ok.
8. **Nina** — leere Anmeldungen; Abmelden-Toast mit Rückgängig nur testen, wenn sie sich anmeldet und bar abmeldet (~6 s + Balken).

## Commits (A/B bereits)

- `a136524` Toast-Regel
- `f4e2950` Buchungsleiste
- C: Migration + Reset/Seed + UI-Filter (siehe `git log`)
