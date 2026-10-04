# Bericht B1 — Studio-Angaben, Bestellknopf, Bestätigung, Belege

Status: **in Arbeit** (Kontext-Halt nach Schema). Stand 04.10.2026.

Vorgabe: [docs/stories/b1_bestellknopf_bestaetigung_belege.md](../stories/b1_bestellknopf_bestaetigung_belege.md).
Entscheidung 12 gilt: [12_Kaufprozess_Rechtliches.md](../entscheidungen/12_Kaufprozess_Rechtliches.md).

## Commits (bisher)

- `fa3adad` docs(geldkette): UX-1 Klicktest bestanden, Status fertig
- `014d116` docs(geldkette): Entscheidungen 12 und 13, Stories B1/B2
- `6550508` feat(geldkette): B1 Anbieterangaben, Sperre und Preisgrenze 250 Euro
- (dieser) feat(geldkette): B1 Belege ausstellen und lesen

## Fertig

### Teil A — Studio-Angaben (K1–K3)

- Tabelle `tenant_legal_profiles`, RPCs `upsert_studio_legal_profile` (nur Owner), `get_studio_legal_profile` (Owner), `get_studio_provider_info` (Mitglieder, ohne Steuernummer)
- Keine Default-Angaben für bestehende Studios
- `set_online_payments_enabled`: nach Steuer `LEGAL_PROFILE_MISSING`
- `online_payment_required` verlangt vollständige Angaben → Kurse fallen auf Vor-Ort zurück
- `booking_payment_options(p_amount_cents)`: `{ online_required, reason }` — `LEGAL_PROFILE_MISSING` / `AMOUNT_ABOVE_RECEIPT_LIMIT`
- 250,00 € möglich, 250,01 € nicht; `register_for_course` / `promote_from_waitlist` / `prepare_online_payment` ebenso
- Test `b1_legal_profiles.mjs` grün; bestehende Online-Tests setzen Angaben über `legalProfileSetzen`

### Teil C — Belege (K8–K14)

- `receipt_counters` + `receipts` (append-only, Unique je Nummer / Zahlung / Erstattung)
- Trigger nach Stripe-`payments` INSERT und `payment_refunds` → `succeeded` (Webhook- und Job-Pfad, dieselbe TX)
- Nummer `{JJJJ}-{00001}` je Studio und Jahr, Zeilensperre über `INSERT … ON CONFLICT DO UPDATE`
- Schnappschuss unveränderlich; kein Backfill
- `get_receipt` / `get_receipt_by_payment`: Teilnehmende eigene, Owner/Admin Studio, Lehrende FORBIDDEN
- Test `b1_receipts.mjs` grün (getrennte Zähler, parallel, zwei Erstattungsbelege, Snapshot, Rechte)

Erfolgs-Pfad der Zahlung bleibt `complete_online_payment` (Webhook + Job). Beleg hängt am INSERT, nicht an weiteren Stellen. Keine Haltestelle 1.

## Offen (hier weitermachen)

Siehe STAND.md. Kurz: Mails (K6/K7/K9), Bestellknopf/Sheet (K4/K5), Einstellungen Rechtliches, Belegseite + Links + CSV, Kurshinweis > 250 €, E2E, dann B2.
