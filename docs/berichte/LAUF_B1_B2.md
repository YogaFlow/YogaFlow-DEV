# Lauf B1 / B2 — 04.10.2026

Branch `Julius`. Kein PROD, kein Stripe-Dashboard, kein Merge nach `main`.

## UX-1 Vorab

Status **fertig**. Klicktest Julius 04.10., 360 + 1280.

## B1 — Studio-Angaben, Bestellknopf, Bestätigung, Belege

Status **fertig** inkl. Nachtrag N1–N6. Bericht: [b1_bestellknopf_belege.md](b1_bestellknopf_belege.md).

| | |
|---|---|
| Migrationen | bis `20261004122000` |
| E2E | `e2e/b1.spec.ts` 3/3 grün |
| demoalpha Belege | `2026-00001`/`00002` receipt, `2026-00004` refund_receipt (`00003` Fehlbeleg Umkehr vor Fix) |

## Klicktest B1+B2 (Julius, 04.10.)

**Bestanden** bis auf Gestaltung. Fachlich/funktional ok (Banner, AVV, Checkout, Belege, Online-Schalter). Gestaltungs-Feedback steckt in Story [UX-2](../stories/ux2_checkout_mail_export_desktop.md) (Checkout, Pop-ups, Mails, Export, Desktop).

## B2 — Überwachung, AVV v2, AVV-Zustimmung

Status **fertig** inkl. O1–O4. Klicktest Julius 04.10. bestanden (Gestaltung → UX-2). Bericht: [b2_ueberwachung_avv.md](b2_ueberwachung_avv.md).

| Teil | Stand |
|---|---|
| AVV-Text v2 | Stand 04.10.2026, gerendert |
| `ops-monitor` | 15 min Cron, `retry_missing_receipts`, U2 inkl. (i), O1–O3-Fixes, Entprellen |
| AVV-Zustimmung | `legal_acceptances`, Banner, Aufmerksamkeit, Onboarding-Checkbox, `AVV_MISSING` |
| Testkundin PROD | bestätigt AVV nach Release über Banner — nichts extra |
| O4 nach Fix | offen nur `demoalpha:disputes` (3); vier Fehlalarme → erledigt |

E2E akzeptiert AVV per RPC in `_dev.ts` (nicht UI). Echte UI-Zustimmung = Klicktest.

## Fragen an Julius

1. Heartbeat-Konto / `OPS_HEARTBEAT_URL`? Empfohlen, sonst merkt niemand totalen Cron-Ausfall.
2. Klicktest B1+B2 — siehe Liste unten.

## Gemeinsame Klickliste

**B1**
1. Einstellungen → Rechtliches: Anbieterangaben (360 + 1280).
2. Ohne Angaben: Aufmerksamkeit; Knopf „Anmelden“.
3. Mit Angaben: „Weiter zur Buchung“.
4. Sheet: Pflichtangaben, Knopf genau „Zahlungspflichtig buchen“.
5. Mit 4242… buchen → Beleg mit vollem §-19-Satz.
6. Echte Bestätigungsmail mit Beleg.
7. Owner erstattet 10 € → Erstattungsbeleg.
8. Kurs > 250 €: Hinweis vor Ort.

**B2**
9. Überwachungsmail ansehen (nach Rauchtest / nächstem Cron).
10. AVV-Volltext v2 unter /legal/auftragsverarbeitung.
11. Banner „Bitte bestätige…“ → AVV abschließen.
12. Datum/Name/Version sichtbar, Banner weg.
13. Online-Schalter ohne AVV: Hinweis `AVV_MISSING`; danach frei.
14. Onboarding: ohne AVV-Häkchen kein Abschluss.
15. Einstellungen Rechtliches AVV 360 + 1280.
