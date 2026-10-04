# Bericht UX-2 Teil B2 — Export unter Zahlungen

Status: **fertig**. Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux2_checkout_mail_export_desktop.md](../stories/ux2_checkout_mail_export_desktop.md) Teil B · B2.

## Commits

- (dieser Lauf) feat(geldkette): UX-2 B2 Export unter Zahlungen

## Umsetzung

| Punkt | Ergebnis |
|---|---|
| Knopf „Exportieren“ | Desktop rechts neben Filtern (Sekundär + Download-Icon); mobil im ⋯-Menü |
| Sheet | Monat (vorbelegt), Wahl Zahlungsliste / Steuerberatung |
| Zahlungsliste CSV | aktuelle Filter, alle Seiten, Belegnummer, Status, Erstattungen; `;` + UTF-8-BOM |
| Dateiname | `omlify-<slug>-zahlungen-YYYY-MM.csv` |
| Steuer-CSV | unverändert über `ledgerExport` (Hauptbuch + Summen) |
| Einstellungen | Export-UI entfernt; Satz „Exporte findest du unter Zahlungen“ mit Link |
| Rechte | nur Owner/Admin (Zahlungen-Seite) |

## Tests

- Unit `scripts/test/payments_export.ts` grün
- `tsc` grün

## Klickliste (Julius)

1. Zahlungen › Alle › Exportieren → Zahlungsliste mit Filter „online“.
2. Steuerberatung-CSV herunterladen.
3. Einstellungen › Zahlungen: Link zu Export, kein alter Download-Knopf.
