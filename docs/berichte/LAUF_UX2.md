# Lauf UX-2 (+ Nachtrag B2) — 04.10.2026

Branch `Julius`. Kein PROD, kein Stripe-Dashboard, kein Merge nach `main`.

## Vorab

| Punkt | Ergebnis |
|---|---|
| Klicktest B1+B2 (Julius 04.10.) | bestanden bis auf Gestaltung → UX-2 |
| Story `nachtrag_b2_ueberwachung.md` | vorhanden (Pfad korrigiert) |
| Story `ux2_checkout_mail_export_desktop.md` | vorhanden |
| Nachtrag B2 O1–O4 | **übersprungen** — bereits fertig (`632d338` / Bericht B2) |

## Teile

| Teil | Status | Commits | DoD / E2E |
|---|---|---|---|
| Nachtrag B2 | übersprungen (fertig) | `632d338`, `f7cd560` | ops-monitor nur `demoalpha:disputes` |
| UX-2 A (A1–A4) | **fertig** | `cd16a93` | Unit legal+hash; E2E `e2e/ux2.spec.ts` angelegt |
| UX-2 B1 Mails | **fertig** (Haltestelle 5: echte Mail-Screens) | `0256764` | Deno 189/189; Functions DEV deployt |
| UX-2 B2 Export | **fertig** | `3deea79` | Unit `payments_export.ts` |
| UX-2 B3 Desktop | **fertig** | `2d0fbeb` | E2E `ux2-b3` 4/4; 360 = Baseline pixelgleich |

Berichte: [ux2_teil_a.md](ux2_teil_a.md) · [ux2_teil_b1.md](ux2_teil_b1.md) · [ux2_teil_b2.md](ux2_teil_b2.md) · [ux2_teil_b3.md](ux2_teil_b3.md)

## Screenshot-Vergleich mobil (B3)

- Baselines **vor** Layout-CSS bei 360 px (Kursdetail + Kasse)
- Nach Desktop-Umbau: **2/2 pixelgleich** (Abweichung wäre rot gewesen)
- Snapshots: `e2e/ux2-b3.spec.ts-snapshots/`

## Land-Feld weg (Checkout)

- Payment Element: `billingDetails.address.country: 'never'`
- Beim Confirmation Token: `country: 'DE'`
- Stripe-Typen erlauben kein `if_required`
- **Testkarten DE/US (4242…):** Unit/API-Pfade unverändert; UI-Durchlauf mit US-Karte bitte Julius kurz im Klicktest (Frage unten)

## Kasten „stripe ›“

Stripe.js **Testmodus-Badge** (nicht App-Code). Nur mit Test-Publishable-Key. Überdeckt keinen Pflichttext im neuen Fuß; Live mit `pk_live_…` entfällt er.

## AVV-Diff (21.09. → 04.10.)

Vollständig in [ux2_teil_a.md](ux2_teil_a.md) (Abschnitt AVV-Diff). Kurz: Stand-Datum, Zweck Online-Zahlungen/Belege, Datenkatalog Zahlungen/Belege/Anbieter, Stripe kein Unterauftragsverarbeiter, TOM Zahlungsdaten/Protokolle. In UX-2 nur **Darstellung** (Pop-up), kein Inhalts-Edit.

## Fragen an Julius (mit Empfehlung)

1. **Heartbeat `OPS_HEARTBEAT_URL`?** Empfohlen — sonst merkt niemand totalen Cron-Ausfall.
2. **US-Testkarte im Checkout** nach Land-Ausblendung prüfen. Empfohlen vor PROD.
3. **Auth-/Kursformulare** auch auf `FormField`? Empfohlen als Aufräum-Commit später.
4. **Mail-Screenshots** Gmail/iPhone hell/dunkel — Julius (Haltestelle 5); Cursor hat DEV deployt.

## Gemeinsame Klickliste (max. 15)

1. AVV-Knopf weiß auf Marke; „Volltext öffnen“ → Pop-up mit AVV-Text (nicht Übersicht).
2. Anbieterangaben: leeres Pflichtfeld → Fehlerrand + Icon + Farbe.
3. Checkout 360: Kurs + Gesamt + „Zahlungspflichtig buchen“ im festen Fuß ohne Scrollen.
4. Hold-Pille sichtbar; &lt; 3 min Warnfarbe.
5. AGB/Datenschutz im Fuß öffnen Pop-up, Schließen ok; Abdunklung + Unschärfe.
6. Mit 4242… buchen (DE); optional US-Karte.
7. Bestätigungsmail: „Du bist dabei“, Terminkarte, ICS, Beleg-Link (DEV-Redirect).
8. Zahlungen › Exportieren → Zahlungsliste mit Filter online; Dateiname prüfen.
9. Steuerberatung-CSV aus dem Export-Sheet.
10. Einstellungen › Zahlungen: nur Steuerstatus + Link zu Export.
11. Kursdetail mobil: wie Baseline (Leiste unten).
12. Kursdetail Desktop ≥1024: Buchungskarte rechts sticky.
13. Kasse mobil: Liste unverändert.
14. Kasse Desktop: Tabelle Name · Zahlung · Karte · Aktion, „N angemeldet“.
15. Onboarding: Legal-Links öffnen Pop-ups.

## Release-Plan

Ergänzt in [RELEASE_GELDKETTE_PLAN.md](../RELEASE_GELDKETTE_PLAN.md) Abschnitt **0.1b UX-2**: Functions `send-email`/`dispatch-emails`/`ops-monitor` (keine neuen Secrets, keine Migration).

## Status

**Lauf fertig** · Haltestelle 5: Klicktest + Mail-Screenshots durch Julius.
