# Bericht — Legal-Cleanup DEV + Release-Abend vor Phase 5

Stand: 2026-10-12 · Branch `Julius` · HEAD `35d44d4` · Status: **angehalten (STOPP vor Phase 5 PROD)**

Checkliste: [release_2026-10_generalprobe.md](release_2026-10_generalprobe.md) § Endgültige Release-Abend-Reihenfolge · [release_2026-10_stripe_live_vorbereitung.md](release_2026-10_stripe_live_vorbereitung.md) §5  
(`docs/RELEASE_2026-10_ABEND.md` existiert nicht — Inhalt dort.)

## 1 — „konnte nicht geladen“ lokal

Öffentliche Studio-Rechtstexte auf DEV (`demoalpha.omlify-dev.de/agb` …) laden für Owner/Teilnehmer/anonym. Ursache lokal: fehlender Tenant-Kontext. `stash@{0}` („WIP legal-modal STOPP docs…“) **verworfen**.

## 2 — Herkunft „AGB Test / Stand: Test.“

| Beleg | Wert |
|-------|------|
| Text | `# AGB Test\n\nStand: Test.\n` / `# Datenschutz Test\n\nStand: Test.\n` |
| Quelle | `studioLegalFreigeben` in `scripts/test/_helpers.mjs` (Default-`bodyMd`) |
| RPC | echter Weg `release_studio_legal` → `publish_studio_legal_document` (kein Direkt-INSERT) |
| demoalpha | `created_at` **2026-10-08 17:07:12 UTC**, `template_version` **2026-10-08**, Body 25/33 Zeichen |
| Kontext | Nachtrag F: Seed `2026-10-08T17:06:44Z`, Bericht „danach auf v2 freigegeben für Klicktest“ ([nachtrag_gesamtklicktest_fixes.md](nachtrag_gesamtklicktest_fixes.md)) |
| demobeta | dieselbe Sekunde, gleicher Minimaltext (ebenfalls bereinigt) |

Nicht F1-Skript `f1_legal_l3.mjs` (Studio `e2ef1leg`). `ux10_legal_tpl_hash.mjs` gibt nur **demobeta** frei und hat `assertDevGuard` — Zeitstempel/Body passen aber zur Helfer-Funktion, nicht zur UI-Freigabe.

## 3 — Kann der Weg auf PROD passieren? → **Befund vor Release**

| Schicht | Guard / Prüfung | Risiko PROD |
|---------|-----------------|-------------|
| `studioLegalFreigeben` | **kein** eigener DEV-Guard | nur so sicher wie der Aufrufer |
| Test-/DEV-Skripte | i. d. R. `assertDevEnv` / `assertDevGuard` (URL/Keys = DEV, Probe ≠ PROD) | versehentlicher Lauf gegen PROD-Keys ohne Guard → möglich, wenn jemand die Helfer allein importiert |
| RPC `release_studio_legal` / `publish_studio_legal_document` | Version = aktuelle Vorlage, Hash = Hash des **übergebenen** Body; **kein** Abgleich Body ↔ Vorlagen-Datei | jeder Owner/Admin kann über PostgREST beliebigen Markdown freigeben |
| UI (`StudioLegalHub`) | rendert Vorlage, sendet gerenderten Body | normaler Klickweg ok |

**Befund (kein Release-Blocker):** Freitext nur im eigenen Studio; AGB = Studio-Verantwortung; UI erzeugt korrekt. Härtung (serverseitig aus Vorlage + Profil rendern, Body vom Client nicht annehmen) → [OFFENE_PUNKTE.md](../OFFENE_PUNKTE.md), nach Pilot.

## 4 — DEV aufräumen (Append-only)

Skript: `scripts/dev/demo_legal_rerelease.mjs` (DEV-Guard, rendert aktuelle Vorlage, `release_studio_legal`).

| Studio | Neueste terms/privacy | Body-Länge | Test-Text noch aktuell? |
|--------|----------------------|------------|-------------------------|
| demoalpha | 2026-10-12 18:42 UTC, Vorlage `2026-10-08` | 6746 / 6070 | nein (Altzeilen bleiben) |
| demobeta | 2026-10-12 ~18:43 UTC, Vorlage `2026-10-08` | 6743 / 6066 | nein |

Live: `https://demoalpha.omlify-dev.de/agb` — „Allgemeine Geschäftsbedingungen von Demo Alpha“, Stand 12. Oktober 2026, § 8 Kurskarten. RPC `get_public_studio_legal` terms/privacy ohne „Stand: Test“.

## 5 — Release-Abend-Checkliste (Stand vor Phase 5)

| Schritt | Ergebnis |
|---------|----------|
| Branch/Tag | `Julius` = `origin/Julius` = `35d44d4`; Tag `release-2026-10-freeze` = `35d44d4` |
| PROD Frontend | `version.json` build `179bcfb` (Hotfix #177) — **ohne** Studio-Legal-Routen |
| PROD Schema | keine `studio_legal_*` / `legal_document_versions` / Legal-RPCs |
| Rauchtest Rechtliches yomita | `https://yomita.omlify.de/agb` → Redirect **`/auth`** (Route fehlt auf diesem Bundle) |
| Rauchtest Rechtliches omlifytest | `https://omlifytest.omlify.de/agb` → Redirect **`/auth`** |
| Phase 5 Schema/Functions/Secrets/PR→main | **nicht gestartet** — braucht Julius-Bestätigung (PROD) |

**Nach Merge+Push erwarten:** `/agb` öffentlich; ohne freigegebene Studio-Fassungen → „Der Text konnte nicht geladen werden.“ — Studios müssen nach Schema-Live Impressum+AGB+Datenschutz freigeben (Allowlist-Pfad omlifytest zuerst).

## STOPP

Wartet auf Julius: Phase 5 (PROD link/db push / Secrets / Functions / PR Merge) und Phase 6 Allowlist laut Generalprobe. Probe nicht löschen.

## Verweise

- Helfer: `scripts/test/_helpers.mjs` → `studioLegalFreigeben`
- Cleanup: `scripts/dev/demo_legal_rerelease.mjs [slug]`
- Entscheidung L3: [17_Studio_Rechtstexte.md](../entscheidungen/17_Studio_Rechtstexte.md)
