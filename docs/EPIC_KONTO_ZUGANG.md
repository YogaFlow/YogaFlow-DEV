# Scrum Epic: Konto und Zugang

**Stand:** 22.09.2026 · **Status: ENTWURF.** K1 Befund 22.09. (PROD), K2 Entscheidung Julius 22.09.
**Branch:** `Julius`.
**Verbindlich daneben:** `CLAUDE.md` (Harte Grenzen), `docs/DESIGNSYSTEM.md`,
`docs/SCHEMA_RELEASE_WORKFLOW.md`, `docs/DEV_PROD_SAFETY_WORKFLOW.md`
**Reihenfolge:** vor Geldkette Story 0.3. K2 schreibt ins `audit_log`, sobald 0.3 steht.

---

## 1. Epic-Ziel

Ein Login bleibt bestätigt, auch wenn dieselbe Person einem weiteren Studio beitritt.
Owner können das Passwort einer Teilnehmerin setzen, die mit E-Mail-Abläufen nicht
zurechtkommt — nur wenn der Login ausschließlich zu diesem Studio gehört, und die
Person erfährt davon.

**Fertig heißt:** Die Akzeptanzfälle von K1 und K2 sind auf DEV (`omlify-dev.de`)
grün und belegt. Auth-Code ist ein eigener Auftrag mit Inventur und STOPP; DEV-Test
vor PROD.

---

## K1 — Beitritt zu einem weiteren Studio setzt Bestätigung nicht zurück

*Als Teilnehmerin möchte ich in Studio A eingeloggt bleiben, wenn ich Studio B
beitrete oder dort eine Bestätigungsmail anfordere.*

**Befund 22.09.:** `create_verification_token` (`20260911185000`, Z. 45–49) setzt
`email_verified = false` auf **allen** Profilen eines Logins (`WHERE auth_user_id = p_user_id`).
Wer in Studio A bestätigt ist und in Studio B beitritt oder eine Bestätigungsmail
anfordert, wird in Studio A beim nächsten Login ausgesperrt (`AuthPage.tsx:69–75`).
Belegt an einem Teilnehmerkonto auf PROD.

`join_tenant` übernimmt die Bestätigung bereits (`20260911182000`, Z. 105–118):
ist irgendein Profil des Logins `email_verified`, bekommt das neue Profil `true`.
`create_verification_token` macht das hinterher wieder rückgängig.

**Soll:**

- Ist irgendein Profil des Logins bereits `email_verified = true`, setzt
  `create_verification_token` nichts zurück. Neue Profile desselben Logins
  übernehmen `true` (wie `join_tenant` bereits).
- Ist kein Profil bestätigt: Verhalten wie bisher.
- Prüfen, ob `send-verification-email` / `request-verification-email` bei bereits
  bestätigtem Login überhaupt eine Mail senden sollten (sonst Hinweis „bereits bestätigt“).

**Akzeptanz (DEV):** Login in `demoalpha` bestätigt → Beitritt `demobeta` → Mail
anfordern → Login in `demoalpha` weiterhin möglich. Unbestätigter Login: Sperre wie bisher.

**Offen, nicht Teil von K1:** Zwei Yomita-Teilnehmerkonten (PROD) haben die
App-Bestätigung nie abgeschlossen (seit vor dem 17.09.). Keine Datenkorrektur per Hand.
Selbsthilfe über „Erneut senden“.

**Schema → Freigabe. STOPP.**

---

## K2 — Owner setzt Passwort von Teilnehmenden direkt

*Als Owner möchte ich das Passwort einer Teilnehmerin setzen können, die mit
E-Mail-Abläufen nicht zurechtkommt.*

**Entscheidung Julius 22.09.** Die Funktion war seit `34f0077` / `0e8bf0f` (13.09.)
bewusst entfernt; die alte Fassung setzte über `users.id` statt `auth_user_id`.

**Leitplanken (alle Pflicht):**

1. **Nur Logins, die ausschließlich zu diesem Studio gehören.** Hat der Login ein
   Profil in einem weiteren Tenant: Feld gesperrt mit Hinweis „Diese Person nutzt
   ihren Zugang auch in einem anderen Studio. Das Passwort kann sie nur selbst ändern.“
   Serverseitig in der Edge Function erneut prüfen.
2. **Nur owner/admin, nur Zielrolle user**, nur im eigenen Tenant (Header
   `x-omlify-tenant`, Rolle des Aufrufers serverseitig geprüft). Staff-Konten
   ausgeschlossen. Setzen über `users.auth_user_id` der Zielzeile, nie über `users.id`.
3. **Die Person erfährt davon:** `user_notifications`-Eintrag „Dein Passwort wurde
   vom Studio geändert.“ Bei bestätigter E-Mail zusätzlich Mail über `send-email`.
4. **Passwort nie speichern, loggen oder zurückgeben.** Mindestlänge wie bei der
   Registrierung. Kein erzwungener Wechsel beim nächsten Login. Protokoll ohne
   Passwort im Funktions-Log; ins `audit_log`, sobald Story 0.3 steht.

**Akzeptanz (DEV):** Owner setzt Passwort einer Teilnehmerin → Login mit neuem
Passwort klappt, Glocke erscheint. Teilnehmerin mit Profil in `demoalpha` und
`demobeta` → gesperrt (UI und direkter API-Aufruf → 403). Admin versucht
Owner-Passwort → 403. Aufruf mit fremdem Tenant-Header → 403.

**Auth-Code:** eigener Auftrag mit Inventur und STOPP, DEV-Test vor PROD.

**Unsicherheit:** `RegisterForm.tsx` prüft 6 Zeichen, Onboarding und Passwort-Reset
prüfen 8. Beim Bauen denselben Wert wie die Registrierung nehmen oder bewusst 8 —
abweichen nur mit STOPP.

**Schema / Edge Function → Freigabe. STOPP.**
