# Release 2026-09b

**Stand:** live seit 22.09.2026, Merge `da19a0d` (14:52 Europe/Berlin, PR #167).
**Vorher auf `main`:** `55aaad1` (21.09.2026, PR #166).
**Umfang:** Story 0.2 aus `docs/EPIC_GELDKETTE_1A.md` (Buchungskern härten).

## Inhalt

| Commit | Inhalt | Migration |
|---|---|---|
| `62cb72c` | Offene Punkte nach Priorität | |
| `5ed6664` | Kurszeile beim Buchen sperren, Löschen von Kurs und Lehrer nicht mehr per Kaskade | `20260921233700`, `20260921233800` |
| `7ac04bb` | Aufruf von `close_past_course_registrations` entfernt, gesperrtes Löschen erklärt | |
| `9ff03ee` | Race-Skript für DEV | |
| `b00c3c7` | Löschen gesperrt, solange Anmeldungen bestehen | |
| `1b414fd` | Nachrück-Nachricht setzt `tenant_id` | `20260922093812` |
| `32fca3f` | Epic: Story 0.2 auf DEV festgehalten | |

Zusätzlich auf PROD angewendet, im Repo schon seit `1bb7d72` (20.09., mit PR #166 auf `main`):
`20260920132143` entfernt `users.gdpr_consent` und `users.gdpr_consent_date`.

Edge Function `delete-user`: Version 17.

Auf PROD danach: `registrations_course_id_fkey` und `courses_teacher_id_fkey` sind `RESTRICT`,
Namen wie auf DEV. `public.close_past_course_registrations()` ist weg. `messages` mit
`tenant_id` NULL: 0.

## Ablauf

Zeiten Europe/Berlin, 22.09.2026.

| Zeit | Schritt |
|---|---|
| 14:35:21 | Snapshot vorher |
| gegen 14:45 | Migrationen auf PROD. Prüfung 14:44:19: `20260920132143`, `20260921233700`, `20260921233800`, `20260922093812` vorhanden |
| 14:52 | Merge `da19a0d` |
| | `delete-user` Version 17 |
| 15:10:16 | Snapshot nachher |

Smoke-Test im Test-Studio bestanden.

## Abweichungen vom Ablauf

- Push aus dem Haupt-Repo statt aus einem Worktree. HEAD war der Freeze-Hash, der Arbeitsbaum war sauber.
- Das Test-Studio wurde erst nach dem Merge vorbereitet.

## Snapshot

Nur Zahlen. Vorher 14:35:21, nachher 15:10:16 (Europe/Berlin). Kommende Kurse: Start `date + time` als Ortszeit Europe/Berlin, nach dem jeweiligen Erfassungszeitpunkt.

| Gegenstand | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `tenants` | 5 | 5 | 0 |
| `users` gesamt | 49 | 51 | +2 |
| `users` role `admin` | 2 | 2 | 0 |
| `users` role `owner` | 4 | 4 | 0 |
| `users` role `teacher` | 1 | 1 | 0 |
| `users` role `user` | 42 | 44 | +2 |
| `auth.users` | 51 | 52 | +1 |
| `courses` gesamt | 44 | 45 | +1 |
| `courses` kommend | 15 | 16 | +1 |
| `courses` mit `time IS NULL` | 0 | 0 | 0 |
| `registrations` gesamt | 315 | 316 | +1 |
| `registrations` status `registered` × `is_waitlist` false | 299 | 300 | +1 |
| `registrations` status `waitlist` × `is_waitlist` true | 16 | 16 | 0 |
| `messages` gesamt | 11 | 12 | +1 |
| `messages` mit `tenant_id IS NULL` | 0 | 0 | 0 |
| `user_notifications` | 49 | 49 | 0 |

`messages` mit `tenant_id IS NULL` bleibt 0. Die Abweichungen stammen vom Smoke-Test im Test-Studio.
