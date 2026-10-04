# Bericht UX-2 Teil B3 — Desktop Kursdetail + Kasse

Status: **fertig**. Stand 04.10.2026 · Branch `Julius`

Vorgabe: [docs/stories/ux2_checkout_mail_export_desktop.md](../stories/ux2_checkout_mail_export_desktop.md) Teil B · B3.

## Reihenfolge (hart)

1. Playwright `toHaveScreenshot`-Baselines bei **360 px** für Kursdetail und Kasse **vor** Layout-CSS.
2. Danach Desktop-Layouts nur ab `lg:` (≥ 1024 px).
3. Vergleich 360 = Referenz (Abweichung = rot).

## Commits

- (dieser Lauf) `feat(geldkette): UX-2 B3 Desktop Kursdetail und Kasse`

## Umsetzung

| Punkt | Ergebnis |
|---|---|
| Kursdetail Desktop | Zweispaltig `lg:grid` ~2/3 · 1/3, Inhalt `max-w-[1120px]` |
| Buchungskarte | `lg:sticky`, Preis, freie Plätze, Abmeldefrist (Studio-Fenster), CTA / Status |
| Kursdetail Mobil | Untere Aktionsleiste unverändert (`lg:hidden`); 360-Baseline grün |
| Kasse Desktop | Tabelle Name · Zahlung · Karte · Aktion, Aktionen rechts, `max-w-[1120px]` |
| Kasse Kopf | Desktop: „N angemeldet“ (keine Euro-Summen); Mobil: offen/erledigt unverändert |
| Kasse Mobil | Listenlayout unverändert (`lg:hidden`); 360-Baseline grün |

## Tests

| Lauf | Ergebnis |
|---|---|
| Baselines anlegen (`-g "360" --update-snapshots`) | vor CSS, 2/2 |
| Vergleich 360 nach CSS | **2/2 grün** (pixelgleich) |
| Vollsuite `e2e/ux2-b3.spec.ts` | **4/4 grün** (360 + 1280) |
| `tsc -p tsconfig.app.json --noEmit` | grün |

Snapshots: `e2e/ux2-b3.spec.ts-snapshots/` (`coursedetail-360`, `kasse-360`, `coursedetail-1280`, `kasse-1280`).

Hinweis: Ein Lauf scheiterte kurz an Vite/Miniflare „fetch failed“-Overlay; Wiederholung grün (kein Layout-Diff).

## Dateien

- `src/pages/CourseDetail.tsx`
- `src/pages/CourseCheckout.tsx`
- `e2e/ux2-b3.spec.ts` + Snapshots

## Klickliste (Julius)

1. Kursdetail mobil 360: wie zuvor (Leiste unten).
2. Kursdetail Desktop ≥1024: Buchungskarte rechts, bleibt beim Scrollen.
3. Kasse mobil: Liste wie zuvor.
4. Kasse Desktop: Tabelle mit Anwesenden-Zahl im Kopf, Aktionen rechts.
