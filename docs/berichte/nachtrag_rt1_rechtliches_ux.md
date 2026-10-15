# Bericht Nachtrag RT-1-2 — Rechtliches UX

Status: **angehalten — Haltestelle 5 (Klicktest)**.  
Stand 05.10.2026 · Branch `Julius` · Vorgabe: [docs/stories/nachtrag_rt1_rechtliches_ux.md](../stories/nachtrag_rt1_rechtliches_ux.md)

Keine Secrets/E-Mails in diesem Bericht. L1–L12 unverändert (Vorlage + Werte).

---

## Umgesetzt

### A — Ändern bleibt möglich

- „Weitere Regeln“ jederzeit speicherbar (Speichern-Knopf bei Änderung); nach Speichern neue AGB-Fassung + Pille **Änderung freigeben**.
- Migration `20261005140000`: `get_studio_legal_status` liefert `change_release`, wenn Profil-`extra_rules` ≠ letzte Freigabe-Fassung.
- Nur Einstellung geändert (z. B. Stornofrist) → Status bleibt `current` (keine neue Freigabe).
- Neue Omlify-Vorlage → weiterhin `new_template`.
- Unit: `scripts/test/rt1_legal_release_status.mjs` (in `check:ci`).
- Smoke: `scripts/test/rt1_studio_legal.mjs` prüft die drei Kombinationen auf DEV.

### B — Übersicht → Detail

- Einstellungen › Rechtliches: drei Zeilen (Impressum / AGB / Datenschutz) mit Pille, ≥ 56 px tippbar.
- Routen: `/settings/rechtliches`, `/…/impressum`, `/…/agb`, `/…/datenschutz`.
- Desktop: Liste links (max. 560 px), Detail rechts.
- AGB-Detail: Statuskarte, „Das steht drin“ mit Ändern ›, Weitere Regeln, „Ganzen Text ansehen“ (Aufklapp-Sheet), Frühere Fassungen.
- Datenschutz analog ohne Weitere Regeln; Dienstleister aufklappbar.
- Impressum: Formular + einklappbare Vorschau „So sieht es aus“ (mobil zu).
- AVV bleibt auf der Übersicht.

### C — Kein App-Fuß

- Eingeloggt: `StudioFooter` aus Layout entfernt.
- Profil: Abschnitt „Über {Studio}“ → Sheets (Impressum · Datenschutz · AGB · Widerruf bei Online-Karten) = 2 Tipps.
- Sidebar unten: „Rechtliches“ öffnet dieselbe Liste.
- Öffentlich (Auth, Rechtstext-Seiten, Widerruf): ruhige Textzeile `studio-public-legal-line` (13 px, zentriert, nicht fixiert).
- Checkout-Hinweiszeile und Mail-Fuß unverändert.

---

## Checks

- `npm run dev:apply` — Migration `20261005140000` auf DEV
- `node scripts/test/rt1_studio_legal.mjs` — grün (inkl. change_release / settings → current)
- `npm run check:ci` — siehe Commit-Lauf

---

## Haltestelle 5 — Klickliste (max. 8)

Konto: Owner demoalpha (oder demobeta für freigegebene Texte).

1. **Einstellungen › Rechtliches** — nur drei Zeilen + AVV; kein langer AGB-Block untereinander.
2. **AGB tippen** — Statuskarte, „Das steht drin“, Weitere Regeln editierbar; Speichern erscheint erst nach Änderung.
3. **Weitere Regeln speichern** — Pille „Änderung freigeben“; „Prüfen und freigeben“ funktioniert.
4. **Stornofrist** in Buchungen ändern — AGB-Fassung neu, Pille bleibt „Aktuell“ (keine neue Freigabe).
5. **Ganzen Text ansehen** — Aufklapper + „Alle aufklappen“.
6. **Eingeloggt Dashboard** — kein Fuß „Impressum · …“; Profil › Über {Studio} › Impressum in 2 Tipps (Sheet).
7. **Sidebar** — unten „Rechtliches“ öffnet die Liste.
8. **Ausgeloggt** Login-Seite — ruhige Textzeile unten (kein Website-Fuß).

Nach Freigabe: Bericht auf „fertig“ setzen.

## Screenshots (Julius)

360/1280: Übersicht, Detail AGB, Volltext-Aufklapper, Menü Über Studio, öffentliche Zeile.
