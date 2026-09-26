# Release 2026-09e — Sicherheits-Hotfix Rolle bei Registrierung

**Stand:** live auf PROD seit 26.09.2026. Merge `e5f7b80` (PR #171).
**Migration:** `20260926160500_security_handle_new_user_role_from_trusted_source.sql`.
Kein A1, kein A2.

## Befund

`handle_new_user` hat `role` und `tenant_id` aus `raw_user_meta_data` gelesen. Das setzt jedes `signUp` selbst. Eine Anmeldung konnte damit eine andere Rolle als `user` und ein schon vorhandenes Studio wählen.

## Lagebild

Auf PROD nicht ausgenutzt. Kein Login, der nach dem Studio angelegt wurde und in den Metadaten eine Rolle ungleich `user` trug. Die vorhandenen erhöhten Rollen stammen aus dem Onboarding oder aus älteren Logins.

## Was der Hotfix tut

Die Rolle kommt nur noch aus `raw_app_meta_data` (Admin-API, `service_role`). `owner` aus dem Browser nur für ein Studio, das jünger als zehn Minuten ist und noch keinen Owner hat. GoTrue schreibt `app_metadata` erst nach dem INSERT; der Trigger `on_auth_user_app_metadata` übernimmt sie. `prevent_role_escalation` lässt diese Änderung nur in der GoTrue-Session zu (`supabase_auth_admin`).

## PROD

Backup vor dem Push. Snapshot 26.09.2026, 16:48:01 und 17:15:55 Uhr Europe/Berlin: 54 Logins, 53 Profile, Rollen je Studio unverändert. Neu nur der Trigger `on_auth_user_app_metadata` neben `on_auth_user_created`.

## Probe

`signUp` mit `role: owner` auf das Studio `a95a11ec-5260-4bde-b7f4-6abffe7347cd` wurde `user`. Genau eine Audit-Zeile `security.role_downgraded_on_signup`. Weiterhin ein Owner. Der Probe-Login ist danach gelöscht: 0 Logins, 0 Profile, 0 Teilnehmende in diesem Studio.
