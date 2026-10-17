# FS-1 Klicktest-Nachtrag — Datenschutz-Freigabe + Widerruf-Dialog

Stand: 2026-10-17 · Branch `Julius` · **STOPP vor PROD**

## A — Datenschutz-Freigabe „Vorlage hat sich geändert“

### Befund (nur lesen)

| Quelle | `studio_privacy_tpl` Version | Hash (Anfang) |
|--------|------------------------------|---------------|
| DB DEV | `2026-10-08` | `f8966bceddfe…` (voll `f8966bceddfe6d8a3c83eb2d8b9bf06b7528b231e489613ee37b85f0b9508866`) |
| DB PROD | `2026-10-08` | gleich |
| DEV-Bundle `demoepsilon` (`index-gVbR83by.js` zum Messzeitpunkt) | `2026-10-08` im Bundle | `f8966bceddfe` vorhanden |
| PROD-Bundle `yomita.omlify.de` | `2026-10-08` | `f8966bceddfe` vorhanden |
| `STUDIO_LEGAL_ACCEPTANCE_DOCS.privacy` (Repo) | `2026-10-08` | `f8966bceddfe…` |

**Inhaltlicher Hash stimmt.** Keine Drift der Vorlagen-Datei, kein Generator-Hash-Fehler, keine lokale Änderung an `legalDocuments.ts` (das ist Omlify-Plattform-Rechtstext, nicht Studio-Datenschutz).

### Ursache

`releaseStudioLegal` sandte immer `p_template_version: STUDIO_LEGAL_TEMPLATE_VERSION` (= **`2026-10-16`**, AGB v3 nach BC-1).  
`release_studio_legal` vergleicht mit `legal_document_versions.version` → Datenschutz **`2026-10-08`** → **`VERSION_MISMATCH`** → UI „Die Vorlage hat sich geändert…“.

AGB-Freigabe klappt, weil DB-Terms ebenfalls `2026-10-16` sind.

### Betrifft PROD?

**Ja.** Dieselbe Client-Logik auf `yomita.omlify.de`. Tanja kann Datenschutz nicht freigeben, solange der Client die globale AGB-Version mitschickt. **Kein Schema-Fix nötig** — kleinster Fix: pro Dokument die Version aus `STUDIO_LEGAL_ACCEPTANCE_DOCS`.

### Fix DEV

- `studioLegalReleaseVersion(kind)` → Freigabe/Publish nutzt `2026-10-08` für privacy, `2026-10-16` für terms
- CI: `check_studio_legal_template_hashes` prüft ACCEPTANCE_DOCS = aktuelle Release (Bundle-Zeiger)
- Unit: `scripts/test/studio_legal_release_version.ts`

Keine neue Vorlagen-Version, kein Hash-Rewrite.

## B — Widerruf-Dialog

### Befund

Server ok (revoked, kein `pass_units_low`). UI: nach Bestätigen Reset auf „Weiter zur Zusammenfassung“, danach ALREADY_WITHDRAWN mit aktivem Bestätigen-Knopf.

### Fix

- Erfolg → Dialog schließen, Toast/Erfolgsmeldung, Soft-Reload, Status „Widerrufen“, kein Widerruf-Knopf
- `ALREADY_WITHDRAWN` / bereits `revoked` → nur Hinweis, **kein** Bestätigen-Knopf
- Logik in `passWithdrawalUi.ts` + Unit-Test

## Commits / Prüfung

| | |
|---|---|
| A | `9f40b6b` |
| B | `bc4c499` |
| HEAD | `bc4c499` (+ Docs ggf. danach) |
| `check:ci` | grün |
| Live DEV | `https://demoepsilon.omlify-dev.de/assets/index-CjjfU9AV.js` · Merkmal `pass-withdrawal-blocked` |
| Asset-404 | Probe → 404 |
| Bundle-Hashes privacy | DEV+PROD identisch `f8966bceddfe6d8a3c83eb2d8b9bf06b7528b231e489613ee37b85f0b9508866` |

## Klicktest (nochmal)

1. demoepsilon: Datenschutz freigeben → kein „Vorlage hat sich geändert“
2. Widerruf Kurskarte → Dialog zu, Toast, Status „Widerrufen“, kein Bestätigen mehr
3. Erneuter Widerruf-Versuch → nur Hinweis, kein Bestätigen-Knopf

## STOPP

PROD erst nach GO von Julius. Für Tanja: nach Merge reicht Frontend (keine Migration). Reihenfolge: Merge → Cloudflare PROD-Build.
