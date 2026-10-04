# Bericht UX-5 — Buchungsleiste, Toast-Regel, Demo-Studio

Status: **angehalten** (Haltestelle 5: Klicktest Nachzug Archiv).  
Stand 04.10.2026 · Branch `Julius` · Migrationen `20261004230000` + `20261004240000_ux5_archived_rls` auf DEV

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
| Kurse abgesagt (`status = canceled`) | **korrekt ≥ 1** — Inventur meldete fälschlich 0 (siehe Korrektur unten) |
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
| Nina Neu | Seed: 0 Buchungen; Klicktest: stornierte Hatha mit Geldspur bleibt — **Für Rückgängig Vor Ort wählen.** |
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

## Inventur-Korrektur: „abgesagt 0“

**Fehler:** Inventur zählte mit `status = 'cancelled'` (britisch). In der DB steht `canceled` (US, A9).  
**Korrekt (nach Reset, DEMO 04.10.):** 44 Kurse `canceled` (alle archiviert); darunter 31 Smoke (`S22A*`), davon 12 `canceled` / 19 `active`.

## C-Nachzug: Rückgaben zeigten archivierte Smoke-Kurse

**Ursache:** `Dashboard.tsx` „Rückgaben offen“ lud Registrierungen mit Embed `course:courses(...)` **ohne** `archived_at`-Filter. Client-Filter auf Kurslisten reichten nicht für Embeds; SECURITY-DEFINER-RPCs (z. B. `get_open_coverage`) umgingen Client-Filter ebenfalls.

**Zentrale Lösung (Anzeige, nicht RLS):**

1. Client-Helfer `src/lib/visibleScope.ts` (`visibleCourses` / `visibleMembers` / `onlyVisible` / `isArchivedRow`) für alle Listen und Embeds.
2. Listen-RPCs: `get_open_coverage` filtert `archived_at IS NULL`; `get_studio_payments(p_include_archived)` behält den Umschalter.
3. Buchbarkeit: `register_for_course` + Trigger prüfen weiter `archived_at` (seit 230000).
4. Kachel „Teilnehmer“ → **„Anmeldungen“** (belegte Plätze in kommenden Kursen; 0 bei Seed ohne kommende Anmeldung war kein Bug).

### Korrektur: `archived_at` darf nicht in RLS-SELECT

Migration `20261004240000` hatte `archived_at IS NULL` in vier SELECT-Policies gelegt. Das war ein Architekturfehler: RLS = Zugriffsschutz, nicht Anzeige. Owner/Admin brauchen archivierte Kurse/Personen für Zahlungen-Archiv, CSV-Export, Belege und Prüfspur.

**Korrektur:** Migration `20261004250000` stellt die vier Policies auf den Stand vor 240000 wieder her (`courses_select_own_tenant`, `users_select_managers`, `users_select_teacher_participants`, `users_select_teacher_staff`). `get_open_coverage` behält den Archiv-Filter in der Lese-Schicht. Regel: [.cursor/rules/rls-access-not-display.mdc](../../.cursor/rules/rls-access-not-display.mdc).

### Audit: Stelle → filtert `archived_at`?

| Stelle | Art | filtert? | Anmerkung |
|---|---|---|---|
| RLS `courses_select_own_tenant` | Policy | **nein** (ab 250000) | nur Tenant; Zugriff ja, Anzeige nein |
| RLS `users_select_managers` / teacher_* | Policy | **nein** (ab 250000) | wie vor 240000 |
| `register_for_course` + Trigger Guard | RPC/Trigger | **ja** | seit 230000 — Buchbarkeit |
| `get_studio_payments` | RPC | **ja** (Default) | Umschalter `p_include_archived` |
| `get_open_coverage` | RPC | **ja** (ab 240000) | Lese-Schicht |
| `get_course_participant_counts` | RPC | n/a | nur IDs, die der Client schon gefiltert hat |
| `staff_names` | RPC | nein | nur IDs aus sichtbaren Kursen |
| `visibleScope` + Kurse/Detail/Checkout/Kalender/MyCourses/Participants/Users/Messages/Dashboard | Client | **ja** | |
| `Dashboard` Rückgaben-Embed | Client | **ja** | `isArchivedRow` |
| `MyRegistrations` Embed | Client | **ja** | `isArchivedRow` |
| `Payments.tsx` / CSV-Export | Client/RPC | Ausnahme | Umschalter Archiv inkl. Kurs-/Personennamen |
| `CreateCourse`/`EditCourse` | Client | Lehrerliste | `visibleMembers` |
| `pass_products.archived_at` | Produkt | eigen | A4, nicht UX-5 |

Kartenprodukte (`pass_products.archived_at`) unverändert — eigene Story A4.

## Tests

| Lauf | Ergebnis |
|---|---|
| `npm run check:ci` | grün |
| Unit `ux5_buchungsleiste_toast` | grün |
| `scripts/test/security_ux5_archived_select.mjs` | grün — Owner liest archivierten Kurs; fremdes Studio nicht |
| E2E `e2e/ux5.spec.ts` (e2eapp) | **1/1** |
| E2E `e2e/ux5-archive.spec.ts` | **1/1** — Listen ohne Archiv; Zahlungen-Archiv zeigt Kurs- + Personenname; CSV mit Archiv enthält Kursnamen; Owner-SELECT archiviert |
| E2E `e2e/zw1.spec.ts` | **1/1** |

## Z8 — Neu-Hinweis (Nachtrag nach UX-5-Klicktest)

Entscheidung 14 Z8: Hinweis unabhängig vom Standard-Weg. Migration `20261004260000`. Vera auf DEV: `online_pay_hint_seen_at` null, `last_booking_pay_method = onsite`. Details und Klickliste: [zw1_zahlungswege.md](zw1_zahlungswege.md) (STOPP Z8, genau 2 Punkte).

## STOPP — Haltestelle 5 erledigt (Archiv/RLS)

Owner Olivia · Passwort in `supabase/.env.dev`. Archiv/RLS-Klicktest abgenommen; offener Rest war „Neu“-Hinweis → Z8.
