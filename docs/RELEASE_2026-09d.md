# Release 2026-09d

**Stand:** live seit 26.09.2026. Merge `3d41292`.
**Vorher auf `main`:** `89a597c` (22.09.2026, PR #169).
**Release-Head vor dem Merge:** `4210efe`. Push aus dem Worktree auf diesem Stand, nicht aus dem Alltag-Branch `Julius`.
**Umfang:** K1, K2 (a–d), 0.3 (a–c). Kein Stripe.

## Inhalt

| Teil | Commit | Was auf PROD ankommt | Migration |
|---|---|---|---|
| K1 | `c6df666`, `2f724f0` | Bestätigung bleibt erhalten. `create_verification_token` setzt `email_verified` nicht mehr zurück. Bestätigte Logins bekommen keine zweite Mail. | `20260923170600` |
| 0.3a | `72509b3` | `events`, `audit_log`, Append-only, `record_service_ping`. `delete_tenant_complete` löscht die neuen Tabellen mit. | `20260925163414` |
| 0.3b | `207c949` | Service-Gerüst `initService` und Maskierer | |
| 0.3c | `ee235a9` | Function `service-ping` | |
| K2a | `db8f520` | Passwort setzen: `studio_member_login_exclusive`, `record_studio_password_notice` (nur `service_role`) | `20260925172848` |
| K2b | `f04c776` | Function `set-participant-password`, Leitplanken serverseitig | |
| K2c | `f001222`, `c3dfb3b` | Feld in der Nutzerverwaltung, Glocken-Text aus `action_path` | |
| K2d | `730e721` | `update-user` liest den Aufrufer über `get_current_member()` | |

## Ablauf

Migrationen vor dem Merge, aus dem Worktree auf `4210efe`. Zeiten Europe/Berlin, 26.09.2026, soweit nicht anders angegeben.

| Zeit | Schritt |
|---|---|
| | Backup |
| 12:58:37 | Snapshot vorher |
| | Drei Migrationen: `20260923170600`, `20260925163414`, `20260925172848` |
| 13:07:02 | Prüfung nach Migration |
| 11:09 UTC | Fünf Functions deployed |
| | Merge `3d41292` |
| | Smoke-Test im Studio `omlifytest` |
| 13:46:54 | Snapshot nachher |

## Functions

| Function | Stand auf PROD |
|---|---|
| `service-ping` | neu, Version 1 |
| `set-participant-password` | neu, Version 1 |
| `update-user` | Version 4 |
| `send-verification-email` | Version 18 |
| `request-verification-email` | Version 18 |

## Smoke-Test

Bestanden, Studio `omlifytest`:

- Passwort setzen inklusive Glocke und Login mit dem neuen Passwort
- Stammdaten speichern
- Registrierung mit Bestätigung
- „Erneut senden“ für einen bereits bestätigten Login, ohne Mail
- Buchen und Abmelden
- Konsole ohne Fehler

**Offen geblieben:** `service-ping` mit echtem Owner-Token auf PROD nicht belegt (abgelaufene Sitzung im Agenten, Client nicht global im Browser). Auf DEV vollständig belegt. Nachholen, wenn die erste fachliche Function über `initService` entsteht (A3).

## Snapshot

Nur Zahlen. Vorher 12:58:37, nachher 13:46:54 (Europe/Berlin). Kommende Kurse: Start `date + time` als Ortszeit Europe/Berlin, nach dem jeweiligen Erfassungszeitpunkt. Zwischen beiden Zeitpunkten hat kein Kurs begonnen.

| Gegenstand | 12:58 | 13:46 | Δ |
|---|---:|---:|---:|
| `tenants` | 5 | 5 | 0 |
| `users` gesamt | 52 | 53 | +1 |
| `users` role `admin` | 2 | 2 | 0 |
| `users` role `owner` | 4 | 4 | 0 |
| `users` role `teacher` | 1 | 1 | 0 |
| `users` role `user` | 45 | 46 | +1 |
| `auth.users` | 53 | 54 | +1 |
| `courses` gesamt | 47 | 48 | +1 |
| `courses` kommend | 13 | 14 | +1 |
| `registrations` gesamt | 316 | 317 | +1 |
| `registrations` status `registered` × `is_waitlist` false | 301 | 302 | +1 |
| `registrations` status `waitlist` × `is_waitlist` true | 15 | 15 | 0 |
| `messages` | 12 | 12 | 0 |
| `user_notifications` | 52 | 53 | +1 |
| Profile `id <> auth_user_id` | 4 | 5 | +1 |
| `events` | — | 0 | |
| `audit_log` | — | 0 | |

Die Abweichungen stammen vom Smoke-Test im Test-Studio `omlifytest` (Passwort-Glocke 13:13, neues Profil 13:14, Kurs und Anmeldung 13:16). `yomita` und die übrigen Studios ohne neue Zeilen. `events` und `audit_log` bleiben 0, weil der Service-Ping auf PROD nicht belegt ist.
