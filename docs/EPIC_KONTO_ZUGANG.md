# Scrum Epic: Konto und Zugang

**Stand:** 26.09.2026 · **Status: ENTWURF.** K1 und K2 (a–d) auf DEV abgenommen (Julius, 26.09.). PROD offen.
**Branch:** `Julius`.
**Verbindlich daneben:** `CLAUDE.md` (Harte Grenzen), `docs/DESIGNSYSTEM.md`,
`docs/SCHEMA_RELEASE_WORKFLOW.md`, `docs/DEV_PROD_SAFETY_WORKFLOW.md`
**Reihenfolge:** war vor Geldkette Story 0.3 geplant. 0.3a steht; der `audit_log`-Eintrag zum Passwortsetzen fehlt trotzdem — eigener Punkt unter K2.

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

**Erledigt auf DEV** (26.09.2026, Abnahme Julius). K2a `db8f520`, K2b `f04c776`,
K2c `f001222` und `c3dfb3b`, K2d `730e721`. PROD mit dem nächsten Release,
zusammen mit K1 und 0.3a/b/c.

*Als Owner möchte ich das Passwort einer Teilnehmerin setzen können, die mit
E-Mail-Abläufen nicht zurechtkommt.*

**Entscheidung Julius 22.09.** Die Funktion war seit `34f0077` / `0e8bf0f` (13.09.)
bewusst entfernt; die alte Fassung setzte über `users.id` statt `auth_user_id`.

**Leitplanken (umgesetzt):**

1. **Nur Logins, die ausschließlich zu diesem Studio gehören.** Hat der Login ein
   Profil in einem weiteren Tenant: Feld gesperrt mit Hinweis „Diese Person nutzt
   ihren Zugang auch in einem anderen Studio. Das Passwort kann sie nur selbst ändern.“
   Serverseitig in der Edge Function erneut prüfen.
   **Umgesetzt.** Client: `Users.tsx` `passwordLock` (Z. 145–163). Function:
   `set-participant-password/index.ts` Z. 145–159, 403 `login_not_exclusive`. RPC:
   `studio_member_login_exclusive` in `20260925172848` Z. 31–43.
2. **Nur owner/admin, nur Zielrolle user**, nur im eigenen Tenant (Header
   `x-omlify-tenant`, Rolle des Aufrufers serverseitig geprüft). Staff-Konten
   ausgeschlossen. Setzen über `users.auth_user_id` der Zielzeile, nie über `users.id`.
   **Umgesetzt.** Client: Feld nur bei `isAdmin` und Zielrolle `user` (`Users.tsx`
   Z. 776, Z. 1085). Function: Aufrufer über `get_current_member`, nur `owner`/`admin`
   (Z. 94–107); Zielrolle `user` (Z. 123–128); `updateUserById` mit
   `target.auth_user_id` (Z. 174–176). RPC `record_studio_password_notice`: Actor
   `owner`/`admin`, Ziel `user` im selben Tenant (Z. 65–83).
3. **Die Person erfährt davon:** `user_notifications`-Eintrag „Dein Passwort wurde
   vom Studio geändert.“ Bei bestätigter E-Mail zusätzlich Mail über `send-email`.
   **Umgesetzt.** Function ruft die RPC nach `updateUserById` auf (Z. 186–188) und
   schickt die Mail nur bei `email_verified` (Z. 194–218). RPC schreibt die Glocke,
   `action_path` `/profile` (Z. 85–93).
4. **Passwort nie speichern, loggen oder zurückgeben.** Mindestlänge 8, nicht die
   6 der Registrierung. Kein erzwungener Wechsel beim nächsten Login. Protokoll ohne
   Passwort im Funktions-Log.
   **Umgesetzt.** Client: Länge in `Users.tsx` Z. 463. Function: Länge Z. 86–91,
   Antwort nur `{ success: true }` (Z. 39–43), Log über `safeAuthMessage` (Z. 47–51),
   Variable im `finally` geleert (Z. 224–226). `updateUserById` setzt nur `{ password }`
   (Z. 174–177). Der `audit_log`-Eintrag fehlt — eigener Punkt unten.

**Glocken-RPC nur `service_role`.** `record_studio_password_notice` hat `EXECUTE`
nur für `service_role` (`20260925172848` Z. 97–98). Sonst ließe sich die Meldung
auslösen, ohne ein Passwort zu setzen. Die Function ruft die RPC mit dem
Service-Role-Client auf, nach erfolgreichem `updateUserById`. Der Aufruf hat kein
`auth.uid()` der handelnden Person; die RPC prüft die übergebene Profil-Id.

**Offen, nicht vergessen:** Eintrag ins `audit_log` für das Passwortsetzen fehlt.
0.3a ist da (`72509b3`, `insert_audit`). Eigener kleiner Punkt, nicht Teil der
K2-Abnahme.

**Akzeptanz (DEV, bestanden):** Owner setzt Passwort einer Teilnehmerin → Login mit neuem
Passwort klappt, Glocke erscheint. Teilnehmerin mit Profil in `demoalpha` und
`demobeta` → gesperrt (UI und direkter API-Aufruf → 403). Admin versucht
Owner-Passwort → 403. Aufruf mit fremdem Tenant-Header → 403.

**Auth-Code:** eigener Auftrag mit Inventur und STOPP, DEV-Test vor PROD.

**Mindestlänge:** K2 prüft 8 (Client und Function). `RegisterForm.tsx` prüft weiterhin 6.
Offen in `docs/OFFENE_PUNKTE.md`, einschließlich der Untergrenze im Supabase-Dashboard.

**Aufgeteilt:**

- **K2a** `db8f520` — RPC `studio_member_login_exclusive`: je Profil des Studios `member_id` und ob der Login nur hier liegt. Migration `20260925172848_studio_member_login_exclusive.sql`, auf DEV eingespielt.
- **K2b** `f04c776` — Edge Function `set-participant-password`, auf DEV deployed. Mindestlänge 8. Erfolg nur `{ success: true }`.
- **K2c** `f001222` — Feld in `Users.tsx`. `c3dfb3b` — Beschriftung der Glocke aus `action_path` (`/profile` → „Zum Profil“).

### K2d — Aufrufer in update-user

**Befund:** `update-user` lud den Aufrufer mit `users.id = auth.uid()`. Seit `20260911182000` ist `users.id` die Profil-Id. Profile danach antworteten 500 „Failed to load requester profile“. Profile davor traf der Lookup weiter, auch im zweiten Studio: gefunden wurde immer die alte Zeile, der Header wurde ignoriert.

**PROD (nur Zahlen, 25.09.):** 4 Profile mit `id <> auth_user_id`, alle Rolle `user` (`omlifytest` 3, `yomita` 1). Owner, Admin, Lehrer: 0. Wer die Function aufruft, ist dort nicht betroffen.

**Fix auf DEV:** Aufrufer über `get_current_member()` (Login plus `x-omlify-tenant`), Schreibweg bleibt Service-Role, weil Lehrer keine Manager sind und RLS ihr Update verbieten würde. Commit `730e721`. Zweistudio-Fall belegt: Header `demoalpha` ändert dort, Header `demobeta` gilt die dortige Rolle (`user` → 403).
