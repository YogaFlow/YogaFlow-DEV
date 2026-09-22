# Release 2026-09c

**Stand:** live seit 22.09.2026. Expand-Merge `4cad142` (17:31 Europe/Berlin, PR #168), Contract-Merge `89a597c` (17:38, PR #169).
**Vorher auf `main`:** `da19a0d` (22.09.2026, PR #167).
**Umfang:** E4 (Staff-Sichtbarkeit) und Glocke beim Nachrücken.

## Inhalt

| Commit | Inhalt | Migration |
|---|---|---|
| `4d9a1f5` | RPC `staff_names`; Nachrücken schreibt `user_notifications` (`type = waitlist_promoted`) statt Chat | `20260922154500`, `20260922154530` |
| `5a68ca7` | Frontend liest Staff-Namen über `staff_names`, nicht mehr über Embeds auf `users` | |
| `c4af885` | Sichtbarkeits-Skript für DEV | |
| `3b9a3f7` | Policy `users_select_participant_staff` entfernt | `20260922154700` |

Auf PROD danach: `public.staff_names(uuid[])` existiert. `users_select_participant_staff` ist weg.
SELECT-Policies auf `users`: `users_select_own`, `users_select_managers`,
`users_select_teacher_participants`, `users_select_teacher_staff`.
`user_notifications` mit `type = waitlist_promoted`: 2, nur Tenant `omlifytest`.

Frist E4 (24.09.) eingehalten.

## Ablauf

Expand/Contract mit zwei Pushes und zwei Merges. Zeiten Europe/Berlin, 22.09.2026.

| Zeit | Schritt |
|---|---|
| 17:05:23 | Snapshot vorher |
| 17:17:51 | Prüfung nach Expand: `20260922154500`, `20260922154530` vorhanden, `20260922154700` fehlt |
| 17:31 | Merge 1 `4cad142` (PR #168) |
| | Smoke 1 bestanden |
| 17:38 | Merge 2 `89a597c` (PR #169), Contract `20260922154700` |
| | Smoke 2 bestanden |
| 17:55:10 | Snapshot nachher |

## Abweichungen vom Ablauf

- Im Worktree lief die Supabase CLI 2.117.0 (`npx` ohne `npm ci`), sonst 2.77.0. Ohne Folgen.

## Vorfall ohne Bezug zum Release

Login-Sperre eines Teilnehmerkontos durch `email_verified = false`. Ursache:
`create_verification_token` setzt die Bestätigung auf allen Profilen eines Logins zurück.
Gehört nicht zu 2026-09c. Nächster Auftrag: Epic Konto und Zugang, Story K1
(`docs/EPIC_KONTO_ZUGANG.md`).

## Snapshot

Nur Zahlen. Vorher 17:05:23, nach Expand 17:17:51, nachher 17:55:10 (Europe/Berlin).
Kommende Kurse: Start `date + time` als Ortszeit Europe/Berlin, nach dem jeweiligen
Erfassungszeitpunkt.

| Gegenstand | 17:05 | 17:17 | 17:55 | Δ 17:05→17:55 |
|---|---:|---:|---:|---:|
| `tenants` | 5 | 5 | 5 | 0 |
| `users` gesamt | 51 | 51 | 51 | 0 |
| `users` role `admin` | 2 | 2 | 2 | 0 |
| `users` role `owner` | 4 | 4 | 4 | 0 |
| `users` role `teacher` | 1 | 1 | 1 | 0 |
| `users` role `user` | 44 | 44 | 44 | 0 |
| `courses` gesamt | 45 | 46 | 47 | +2 |
| `courses` kommend | 16 | 17 | 18 | +2 |
| `courses` mit `time IS NULL` | 0 | 0 | 0 | 0 |
| `registrations` gesamt | 316 | 318 | 317 | +1 |
| `registrations` status `registered` × `is_waitlist` false | 300 | 301 | 301 | +1 |
| `registrations` status `waitlist` × `is_waitlist` true | 16 | 17 | 16 | 0 |
| `messages` | 12 | 12 | 12 | 0 |
| `user_notifications` | 49 | 49 | 51 | +2 |
| `user_notifications` `type = waitlist_promoted` | 0 | 0 | 2 | +2 |

Die Abweichungen stammen vom Smoke-Test im Test-Studio `omlifytest`. Andere Studios unverändert.
