# Bericht UX-2 Teil B1 — Einheitliche E-Mail-Vorlage

Status: **fertig** (Deno/Deploy DEV). Screenshots Gmail/iPhone und echte Test-Mail-Ansicht → Haltestelle 5 mit Julius.  
Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux2_checkout_mail_export_desktop.md](../stories/ux2_checkout_mail_export_desktop.md) Teil B · B1.

## Commits

- (dieser Lauf) `feat(geldkette): UX-2 B1 einheitliche Mail-Vorlage, ICS, multipart`

## Umsetzung

| Punkt | Ergebnis |
|---|---|
| Gemeinsame Hülle | `_shared/email_template.ts` — max. 560 px, Tabellen-Layout, System-Schriften, Preheader, Logo oder Name, Markenakzent (Kontrast ≥ 4,5 gegen Weiß, sonst `#2F5A4E`), Dark-Mode-CSS, „Gesendet über Omlify im Auftrag von …“ |
| Buchungsbestätigung | „Du bist dabei“, Terminkarte (Datumsblock + Ort-Link), Primär „In Kalender eintragen“, Sekundär „Buchung ansehen“, Bezahlt-Kasten, Abmelderegel, Fuß K6 (Anbieter, Widerruf; AGB-PDF später Block 2) |
| Erstattung / Nachrücken | dieselbe Hülle, eigener Inhalt |
| ops-monitor | dieselbe Hülle, `shorter: true` |
| send-email | `text` (multipart) + `attachments` (max. 5, Größenlimit) |
| ICS | UID = `{registrationId}@omlify`, `TZID=Europe/Berlin`, VTIMEZONE, `METHOD:REQUEST`; `METHOD:CANCEL` vorbereitet |

## Tests

```
npm run test:deno
→ 189 passed | 0 failed
```

Neu/erweitert:

- `_shared/email_template_test.ts` — Akzent, Preheader, Shell, Logo-URL, ICS UID/Datum/CANCEL
- `dispatch-emails/handler_test.ts` — HTML + Text + ICS-Anhang bei `payment_succeeded`; Promotion mit Text
- `ops-monitor/handler_test.ts` — Shell + Text

## DEV-Deploy

```
npm run dev:deploy -- send-email
npm run dev:deploy -- dispatch-emails
npm run dev:deploy -- ops-monitor
→ mufxhtctutfpzklwqnze OK
```

## Offen für Julius (Haltestelle 5)

1. Echte Bestätigungsmail im DEV-Postfach (`EMAIL_REDIRECT_TO`) nach einer Testbuchung prüfen (ICS-Anhang, multipart).
2. Screenshots Gmail Web + iPhone Mail (hell/dunkel) → `docs/screenshots/ux2/`.
3. Weiter: UX-2 B2 Export, B3 Desktop (vorher 360-Referenz Kursdetail/Kasse).

## Entscheidungen / Unsicherheiten

- Kalender-Knopf nutzt `data:text/calendar`-URI plus ICS-Anhang (kein eigener Host-Endpoint).
- AGB nicht als Textwand; Fußzeile verweist auf PDF mit Block 2.
- Markenkontrast nur gegen Weiß geprüft (wie Knopf-Hintergrund); Studiofarben sind in der DB bereits gefiltert.
