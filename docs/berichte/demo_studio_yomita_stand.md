# Bericht — DEV-Demo „laufendes Studio nach Release“ (YOMITA-Stand)

Stand: 2026-10-13 · Branch `Julius` · Status: **angehalten (STOPP)**  
Freeze-Tag bleibt `release-2026-10-freeze` = `35d44d4` (kein Produkt-Code, keine Migration).

Skript: `node scripts/dev/seed_demo_studio.mjs` · optional `--reset`  
Logins (gitignored): `scripts/dev/.demo_studio_logins.local`

## 0 — Tenant-Entscheidung

| Prüfung | Ergebnis |
|---------|----------|
| `demoepsilon` (`c30fd002-…`) | **3** Zeilen in `legal_acceptances` |
| Folge | **nicht** löschen (append-only) → neues Studio |

| Feld | Wert |
|------|------|
| Slug | `demostudio` |
| Name | Yoga am Rhein |
| Tenant-ID | `0f5c2ca8-5256-43ab-93ab-af907038f826` |
| URL | https://demostudio.omlify-dev.de |
| Login | https://demostudio.omlify-dev.de/auth |

Owner per Admin-API mit **trusted** `app_metadata.role=owner` → `handle_new_user` ohne Onboarding-Legal-Pfad (`LEGAL_ACCEPTANCE_REQUIRED` / `record_onboarding_legal_acceptances` greifen nicht). `legal_acceptances` = **0**.

## 1 — Zielzustand (erreicht)

| Merkmal | Beleg |
|---------|--------|
| Omlify-AGB v2 + AVV v2 nicht zugestimmt | `get_legal_acceptance_status` terms/avv: `accepted=false` (v2 Hashes) → Banner ohne Sperre |
| Keine Studio-Rechtstexte, Impressum leer | `studio_legal_documents=0`, `get_studio_legal_status` terms/privacy/imprint `missing`, `texts_ready=false`, `tenant_legal_profiles=0` |
| Online aus, nicht Allowlist, kein Stripe | `online_payments_enabled=false`, Allowlist 0, `provider_accounts` 0 |
| Zahlung nur vor Ort | `booking_payment_options`: `methods:[{method:onsite}]`, `online_offered=false` |
| Keine Kurskarten | `pass_products=0`, `passes=0`, `payments=0` |
| Rollen | 1 Owner + 2 Lehrerinnen + 30 Teilnehmende (= 33 Profile), alle mit Login |

## 2 — Kurse & Anmeldungen (relativ zu Berlin-heute 2026-10-13)

| | Zahl |
|--|------|
| Kurse gesamt | **73** (Wochenplan Mo/Mi/Fr/So ~14 Wochen Vergangenheit + ~4 Zukunft; plus Extra „Hatha (heute)“ weil Di) |
| Open past (`get_open_coverage`) | **234** |
| Open future (`get_upcoming_open_coverage`) | **158** |
| Soft-Cancels (`cancelled`) | **17** |
| Warteliste | **4** (Vinyasa 2026-10-14 voll mit max=8) |
| `preview_pre_omlify_waive(heute)` | **count=234**, course_count=46 — **nicht ausgeführt** |

Past: Service-Role-Insert → Preis-Freeze-Trigger → Kursdatum zurück.  
Future: Bulk-Insert + Showcase-RPC `register_for_course` (Anna/Jonas/Marie); Auth-Rate-Limit auf DEV verhinderte RPC für alle 30.

## 3 — Mails / Nebenwirkungen

| | Vorher → Nachher |
|--|------------------|
| `email_deliveries` (Tenant) | **0 → 0** (pending 0) |
| Pause | `email_dispatch_secret --pause` während Seed, danach `--resume` |
| Begründung | Keine Outbox-Zeilen entstanden; Skip-Pfad unnötig. Historien-Inserts ohne Waitlist-Promotion-Mails. |

## 4 — Login-Tabelle

**Login-URL:** https://demostudio.omlify-dev.de/auth

| Rolle | Vorname Nachname | E-Mail | Passwort | unterrichtet / Besonderheit |
| --- | --- | --- | --- | --- |
| Owner | Mira Keller | mira.keller@demo-studio.test | RheinDemo!Owner01 | unterrichtet Mo Hatha + So Sanftes Yoga |
| Lehrerin | Lena Vogel | lena.vogel@demo-studio.test | RheinDemo!Lena01 | unterrichtet Mi Vinyasa |
| Lehrerin | Sarah Brandt | sarah.brandt@demo-studio.test | RheinDemo!Sarah01 | unterrichtet Fr Yin |
| Teilnehmende | Anna Meier | anna.meier@demo-studio.test | RheinDemo!U01 | Kurs heute; 12 kommende; **gut für Demo** |
| Teilnehmende | Jonas Schulz | jonas.schulz@demo-studio.test | RheinDemo!U02 | Warteliste Vinyasa 14.10.; **gut für Demo** |
| Teilnehmende | Marie Hoffmann | marie.hoffmann@demo-studio.test | RheinDemo!U03 | Kurs heute; **gut für Demo** |
| Teilnehmende | Tim Schneider | tim.schneider@demo-studio.test | RheinDemo!U04 | 4 kommende |
| Teilnehmende | Clara Fischer | clara.fischer@demo-studio.test | RheinDemo!U05 | 5 kommende |
| Teilnehmende | Felix Weber | felix.weber@demo-studio.test | RheinDemo!U06 | Kurs heute; 6 kommende |
| Teilnehmende | Laura Wagner | laura.wagner@demo-studio.test | RheinDemo!U07 | 8 kommende |
| Teilnehmende | Paul Becker | paul.becker@demo-studio.test | RheinDemo!U08 | 6 kommende |
| Teilnehmende | Nina Richter | nina.richter@demo-studio.test | RheinDemo!U09 | Kurs heute; 6 kommende |
| Teilnehmende | Leon Koch | leon.koch@demo-studio.test | RheinDemo!U10 | Kurs heute; 8 kommende |
| Teilnehmende | Emma Bauer | emma.bauer@demo-studio.test | RheinDemo!U11 | — |
| Teilnehmende | Noah Klein | noah.klein@demo-studio.test | RheinDemo!U12 | 6 kommende |
| Teilnehmende | Sophie Wolf | sophie.wolf@demo-studio.test | RheinDemo!U13 | 7 kommende |
| Teilnehmende | Luca Schröder | luca.schroder@demo-studio.test | RheinDemo!U14 | 4 kommende |
| Teilnehmende | Mia Neumann | mia.neumann@demo-studio.test | RheinDemo!U15 | 7 kommende |
| Teilnehmende | Ben Schwarz | ben.schwarz@demo-studio.test | RheinDemo!U16 | Warteliste Vinyasa |
| Teilnehmende | Lina Zimmermann | lina.zimmermann@demo-studio.test | RheinDemo!U17 | Warteliste Vinyasa; 7 kommende |
| Teilnehmende | Finn Krüger | finn.kruger@demo-studio.test | RheinDemo!U18 | Warteliste Vinyasa; 6 kommende |
| Teilnehmende | Hannah Hartmann | hannah.hartmann@demo-studio.test | RheinDemo!U19 | 4 kommende |
| Teilnehmende | Max Lange | max.lange@demo-studio.test | RheinDemo!U20 | 4 kommende |
| Teilnehmende | Lea Schmitt | lea.schmitt@demo-studio.test | RheinDemo!U21 | 5 kommende |
| Teilnehmende | Julian Werner | julian.werner@demo-studio.test | RheinDemo!U22 | Kurs heute; 8 kommende |
| Teilnehmende | Emily Schmid | emily.schmid@demo-studio.test | RheinDemo!U23 | 7 kommende |
| Teilnehmende | David Krause | david.krause@demo-studio.test | RheinDemo!U24 | 5 kommende |
| Teilnehmende | Charlotte Meier | charlotte.meier@demo-studio.test | RheinDemo!U25 | — |
| Teilnehmende | Oskar Lehmann | oskar.lehmann@demo-studio.test | RheinDemo!U26 | — |
| Teilnehmende | Amelie König | amelie.konig@demo-studio.test | RheinDemo!U27 | Kurs heute; 5 kommende |
| Teilnehmende | Theo Huber | theo.huber@demo-studio.test | RheinDemo!U28 | 6 kommende |
| Teilnehmende | Greta Kaiser | greta.kaiser@demo-studio.test | RheinDemo!U29 | 5 kommende |
| Teilnehmende | Samuel Fuchs | samuel.fuchs@demo-studio.test | RheinDemo!U30 | 8 kommende |

Passwort-Muster: `RheinDemo!<Tag>` (je Person eindeutig).

## 5 — Frisch machen vor Vorführung

```bash
node scripts/dev/seed_demo_studio.mjs --reset
```

Setzt Kurse/Anmeldungen/Nachrichten/Glocken/Outbox des Tenants zurück (nicht `legal_acceptances` / Events / Audit). Daten relativ zu Laufzeitpunkt.

## STOPP

Wartet auf Julius: Klicktest Owner (Banner, Zu erledigen, Offen 234/158, A8-Vorschau, Rechtliches leer, Zahlungen ohne Stripe) und Teilnehmer (nur vor Ort). Freeze unberührt.
