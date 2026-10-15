# Bericht B1 — Studio-Angaben, Bestellknopf, Bestätigung, Belege

Status: **fertig** (Klicktest offen, Haltestelle 5). Stand 04.10.2026.

Vorgabe: [docs/stories/b1_bestellknopf_bestaetigung_belege.md](../stories/b1_bestellknopf_bestaetigung_belege.md).
Entscheidung 12 gilt: [12_Kaufprozess_Rechtliches.md](../entscheidungen/12_Kaufprozess_Rechtliches.md).

## Commits

- `6550508` feat(geldkette): B1 Anbieterangaben, Sperre und Preisgrenze 250 Euro
- `9aa624f` feat(geldkette): B1 Belege ausstellen und lesen
- `cbbd323` feat(geldkette): B1 Bestätigungsmail und Absender mit Reply-To
- `5391d5e` feat(geldkette): B1 Bestellknopf, Anbieterangaben und Belegseite
- `d9ec75e` feat(geldkette): B1 N1/N3/N4 Belegfehler blockiert Zahlung nicht
- `161658d` feat(geldkette): B1 N2 retry_missing_receipts nachholen
- `8e2f04c` feat(geldkette): B1 N5 voller §-19-Satz auf Beleg und Mail
- (danach) fix: keine Belege für Umkehrzahlungen

## Claude-Prüfung DEV (04.10.) — Nachtrag N1–N6

Umgesetzt vor B2:

| # | Inhalt | Beleg |
|---|---|---|
| N1 | Trigger `EXCEPTION WHEN OTHERS` → `receipt.issue_failed` (nur IDs + Fehlercode); Zahlung läuft durch | `b1_receipts.mjs` NEGATIV FORCED_RECEIPT_FAIL |
| N2 | `retry_missing_receipts(p_tenant_id)` nur `service_role`; ops-monitor (B2) ruft sie auf | N2-Test + Migration `20261004121000` |
| N3 | Steuerstatus zum Zahlungsdatum (`received_at`, Europe/Berlin) | Migration `20261004120000` |
| N4 | Fehlt Steuerstatus → kein Beleg, Event `TAX_STATUS_MISSING`, kein §-19-Raten | N4-Test |
| N5 | Belegseite + Bestätigungsmail: „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.“ | Unit + Deno |
| N6 | E2E `e2e/b1.spec.ts` 3/3 grün | siehe unten |

Zusatzfix nach E2E: Umkehrzahlungen (`reverses_payment_id` / `amount_cents <= 0`) erzeugen keinen Beleg mehr (`20261004122000`). Vor dem Fix entstand auf demoalpha `2026-00003` als `kind=receipt` mit −10 € (append-only, bleibt stehen).

## E2E N6 (Playwright, DEV, demoalpha)

Lauf 04.10.2026, lokal Vite `:5181`, 3 passed (~1,7 min).

demoalpha danach (nur Nummern/Arten, keine Personendaten):

| Nummer | Art | Betrag |
|---|---|---|
| 2026-00001 | receipt | 24,00 € |
| 2026-00002 | receipt | 24,00 € |
| 2026-00003 | receipt | −10,00 € (Fehlbeleg vor Fix, Umkehrzahlung; bleibt append-only) |
| 2026-00004 | refund_receipt | −10,00 € |

Mindestens ein Beleg und ein Erstattungsbeleg: ja. Anbieterangaben: 1 Zeile.
Hinweis Claude (04.10.): `2026-00003` absichtlich nicht korrigierbar (append-only, nur DEV).

## DoD

- `dev:apply` bis `20261004122000` grün
- `b1_receipts.mjs` grün (inkl. NEGATIV/N2/N4)
- Unit-Texte + Deno `dispatch-emails` grün
- `tsc` grün
- Functions DEV: `dispatch-emails` neu deployt (N5)
- E2E B1 3/3 grün

## Klickliste (Julius)

1. Einstellungen → Rechtliches: Anbieterangaben speichern (360 + 1280).
2. Ohne Angaben: Aufmerksamkeit „Anbieterangaben fehlen…“; Kursknopf heißt „Anmelden“.
3. Mit Angaben: Kursknopf „Weiter zur Buchung“.
4. Sheet: Block „Deine Buchung“, Preis mit Steuer, Widerruf, Knopf genau „Zahlungspflichtig buchen“.
5. Mit 4242… buchen → Meine Anmeldungen → Beleg: Nummer + voller §-19-Satz (nicht Kurzform).
6. Echte Bestätigungsmail ansehen (Betreff Buchungsbestätigung, Beleglink, Absender „{Studio} über Omlify“, voller §-19-Satz).
7. Owner erstattet 10 € → Zahlungen-Detail → Erstattungsbeleg.
8. Kurspreis > 250 €: Hinweis vor Ort.
9. CSV-Export: Spalte Belegnummer.

## Offen / Fragen

Keine fachliche Entscheidung. Klicktest und echte Mail prüft Julius.
Testkundin PROD: AVV noch nicht bestätigt — nach Release über Banner (B2 V4); nichts extra zu bauen.
