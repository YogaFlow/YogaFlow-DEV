# Scrum Epic: Konto und Zugang

**Stand:** 25.09.2026 · **Status: ENTWURF.** K1, K2a, K2b und K2d erledigt auf DEV (25.09.). K2c offen.
**Branch:** `Julius`.
**Verbindlich daneben:** `CLAUDE.md` (Harte Grenzen), `docs/DESIGNSYSTEM.md`,
`docs/SCHEMA_RELEASE_WORKFLOW.md`, `docs/DEV_PROD_SAFETY_WORKFLOW.md`
**Reihenfolge:** vor Geldkette Story 0.3. K2 schreibt ins `audit_log`, sobald 0.3 steht.

---

## 1. Epic-Ziel

Ein Login bleibt bestätigt, auch wenn dieselbe Person eine Bestätigungsmail anfordert oder sich registriert.
Owner können das Passwort einer Teilnehmerin setzen, die mit E-Mail-Abläufen nicht
zurechtkommt — nur wenn der Login ausschließlich zu diesem Studio gehört, und die
Person erfährt davon.

**Fertig heißt:** Die Akzeptanzfälle von K1 und K2 sind auf DEV (`omlify-dev.de`)
grün und belegt. Auth-Code ist ein eigener Auftrag mit Inventur und STOPP; DEV-Test
vor PROD.

---

## K1 — create_verification_token setzt die Bestätigung nicht zurück

**Erledigt auf DEV** (25.09.2026, Checkliste Julius). Migration `c6df666`,
Functions `2f724f0`. PROD mit dem nächsten Release, zusammen mit K2.

*Als Teilnehmerin möchte ich in Studio A eingeloggt bleiben, wenn ich eine
Bestätigungsmail anfordere oder mich registriere.*

**Befund 22.09., präzisiert 25.09.:** Auslöser ist `create_verification_token`
(„Erneut senden“, Registrierung), nicht der Beitritt zu einem weiteren Studio.
`join_tenant` war nie beteiligt. Die RPC (`20260911185000`, Z. 45–49) setzte
`email_verified = false` auf **allen** Profilen eines Logins
(`WHERE auth_user_id = p_user_id`). Wer in Studio A bestätigt war und danach
eine Bestätigungsmail anforderte, wurde in Studio A beim nächsten Login
ausgesperrt (`AuthPage.tsx:69–75`). Belegt an einem Teilnehmerkonto auf PROD.

`join_tenant` kopiert die Bestätigung bereits (`20260911182000`, Z. 105–118)
und bleibt unverändert.

**Umgesetzt:**

- `create_verification_token` setzt `email_verified` nicht mehr zurück.
  Ist kein Profil bestätigt: Verhalten wie bisher.
- `send-verification-email` antwortet bei bestätigtem Login wie im Normalfall
  (keine Enumeration), intern ohne RPC und ohne Mail.

**Akzeptanz (DEV, bestanden):** Bestätigter Login fordert eine Mail an und bleibt
in jedem Studio eingeloggt. Unbestätigter Login: Sperre wie bisher.

**Offen, nicht Teil von K1:** Zwei Yomita-Teilnehmerkonten (PROD) haben die
App-Bestätigung nie abgeschlossen (seit vor dem 17.09.). Keine Datenkorrektur per Hand.
Selbsthilfe über „Erneut senden“.

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

**Aufgeteilt und auf DEV umgesetzt (25.09.):**

- **K2a** — RPC `studio_member_login_exclusive`: je Profil des Studios `member_id` und ob der Login nur hier liegt. Migration `20260925172848_studio_member_login_exclusive.sql`, auf DEV eingespielt. Quelldatei noch ohne Commit.
- **K2b** — Edge Function `set-participant-password`, auf DEV deployed. Mindestlänge 8. Erfolg nur `{ success: true }`. Quelldatei und `config.toml` noch ohne Commit.
- **K2c** — offen: Feld in `Users.tsx`.

**Entscheidung Glocke:** `record_studio_password_notice` hat `EXECUTE` nur für `service_role`. Sonst könnte ein Owner die Meldung „Dein Passwort wurde vom Studio geändert“ auslösen, ohne ein Passwort zu setzen. Die Function ruft die RPC mit dem Service-Role-Client auf, nach erfolgreichem `updateUserById`. Die Prüfungen (Rolle, Tenant, Zielrolle) bleiben: der Service-Role-Aufruf hat kein `auth.uid()` der handelnden Person, deshalb prüft die RPC die übergebene Profil-Id.

### K2d — Aufrufer in update-user

**Befund:** `update-user` lud den Aufrufer mit `users.id = auth.uid()`. Seit `20260911182000` ist `users.id` die Profil-Id. Profile danach antworteten 500 „Failed to load requester profile“. Profile davor traf der Lookup weiter, auch im zweiten Studio: gefunden wurde immer die alte Zeile, der Header wurde ignoriert.

**PROD (nur Zahlen, 25.09.):** 4 Profile mit `id <> auth_user_id`, alle Rolle `user` (`omlifytest` 3, `yomita` 1). Owner, Admin, Lehrer: 0. Wer die Function aufruft, ist dort nicht betroffen.

**Fix auf DEV:** Aufrufer über `get_current_member()` (Login plus `x-omlify-tenant`), Schreibweg bleibt Service-Role, weil Lehrer keine Manager sind und RLS ihr Update verbieten würde. Commit `730e721`. Zweistudio-Fall belegt: Header `demoalpha` ändert dort, Header `demobeta` gilt die dortige Rolle (`user` → 403).
