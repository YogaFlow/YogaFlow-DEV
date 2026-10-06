# Bericht UX-7 — Kartenhinweis abschaltbar, Demo-Studio v3

Stand: 2026-10-06 · Branch `Julius` · Status: **Haltestelle 5 (Klicktest)**

## Erledigt

| Teil | Inhalt |
|---|---|
| A | `tenants.pass_hint_enabled` (default false, bestehende aus) + `pass_hint_template`; RPC `update_pass_hint_settings` (Owner/Admin); Settings › Studio „Hinweis auf Karten im Kurs“; Rendering `src/lib/passHint.ts`; Kursdetail nur bei Schalter an |
| B | Fristzeile: „Kostenlos abmelden“ umbrechbar, „bis Di, 6. Okt, 18:30“ als `whitespace-nowrap` (+ NBSP im Datum) |
| C | Reset demoalpha (dry-run = apply); Seed `scripts/dev/demo_v3.mjs` (ersetzt `demo_ux6` / `dev:demo:seed`) |

## Nachweise

- Migration `20261006120000_ux7_pass_hint.sql` auf DEV (`npm run dev:apply`)
- `npm run check:ci` — grün
- Unit `scripts/test/ux7_pass_hint.ts` — 7/7
- E2E `e2e/ux7.spec.ts` (e2eapp) — Hinweis an + Text sichtbar; aus → 0 Treffer
- SQL-Selbstprüfung in Migration: alle Tenants `pass_hint_enabled = false`; kein Tabellen-UPDATE für `authenticated`/`anon` auf `tenants`
- demoalpha: `pass_hint_enabled = false`, Template null

## C — Reset

### Dry-run (vor Apply)

```json
{
  "delete_registrations": 2,
  "delete_courses": 3,
  "delete_users": 0,
  "archive_courses": 14,
  "archive_users": 4,
  "delete_messages": "all tenant",
  "delete_notifications": "all tenant"
}
```

Nur Studio `demoalpha`. Dry-run = Apply-Plan (gleiche Zahlen).

### Apply

| Aktion | Anzahl |
|---|---|
| Anmeldungen gelöscht (ohne Geldspur) | 2 |
| Kurse gelöscht | 3 |
| Teilnehmende gelöscht | 0 |
| Kurse archiviert | 14 |
| Teilnehmende archiviert | 4 |

Side-effects Δ = 0 (provider_jobs / email_deliveries / events / ledger).

### Seed v3

- `node scripts/dev/demo_v3.mjs` — OK (zweimal; zweiter Lauf idempotent, bereits erlassen → kein Fehler)
- `npm run dev:demo:seed` zeigt jetzt auf `demo_v3.mjs`
- Hinweis: Reset **nach** Seed würde neue Kurse ohne Geldspur wieder löschen — für Klicktest nicht erneut resetten

## Haltestelle 5 — Klickliste (max. 10)

1. **Owner** — Einstellungen › Studio › „Hinweis auf Karten im Kurs“: Schalter an, Text mit Chips, Vorschau, speichern.
2. **Teilnehmerin ohne Karte** (z. B. Nina) — Kursdetail „Yoga für den Rücken“: gerenderter Hinweis; nach Schalter aus → kein Hinweis.
3. **Beliebig** — Kursdetail mobil 360/390: Frist „Kostenlos abmelden“ / „bis …“ bricht nicht mitten im Datum.
4. **Owner** — Teilnehmer „Hatha am Nachmittag“: Vera „Zahlt vor Ort“, Karla „Mit Karte“, Olaf bezahlt online; „Bar erhalten“ testbar.
5. **Owner** — „Yin Yoga“ (gestern): Nina überfällig, Olaf bar, eine Person erlassen.
6. **Owner** — „Vinyasa Flow“ morgen: voll + Warteliste; Nina „Zahlung läuft“ (pending).
7. **Owner / Teilnehmerin** — nächste Woche: Rücken (mit Karte), Workshop Atem (ohne Karte), Pilates.
8. **Owner / Olaf** — Kurs absagen/Erstattung + Olaf Teilerstattung in Zahlungen.
9. **Wiebke** — Meine Karten: 5er heute, „Vertrag widerrufen“ sichtbar.
10. **Vera** — Historie: späte Abmeldung mit L12-Hinweis; **Nina** Online-Buchung: „Neu“-Hinweis.

## Tabelle Fall → Konto → wo sichtbar

| Fall | Konto | Wo in der App |
|---|---|---|
| Heute Hatha · Vera vor Ort, Karla Mit Karte, Olaf online | Owner (Teilnehmerliste); Lena als Lehrende des Kurses | Teilnehmer › Hatha am Nachmittag; Kasse „Bar erhalten“ / „Mit Karte“ |
| Gestern Yin · Nina offen, Olaf bar, eine erlassen | Owner | Teilnehmer / Offene Zahlungen · Überfällig · Erlassen |
| Morgen Vinyasa voll + WL + Nachrücken pending | Owner; Nina (Zahlung läuft) | Teilnehmer › Vinyasa Flow; Nina Meine Anmeldungen |
| Nächste Woche Rücken / Workshop / Pilates | Owner; Nina (Kartenhinweis testen) | Kurse / Kursdetail; Settings Hinweis an/aus |
| Abgesagt + Erstattung | Owner; Olaf | Kursliste Absage; Zahlungen Erstattung |
| Karla 10er noch 6 + Verlängerung | Karla | Meine Karten · Verlauf |
| Wiebke 5er Widerruf | Wiebke | Meine Karten · Vertrag widerrufen |
| Olaf Teilerstattung 5 € | Owner; Olaf | Zahlungen · Erstattungsbeleg |
| Vera spät abgemeldet | Vera | Meine Anmeldungen Historie · L12 |
| Nina nie online | Nina | Buchungsleiste „Neu“ bei Online |

Zugangsdaten nur in `supabase/.env.dev` (Namen im Bericht: Owner, Lena, Ben, Vera, Karla, Olaf, Nina, Wiebke).
