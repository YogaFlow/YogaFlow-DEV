# Bericht RT-2 — Omlify-Rechtstexte v2

Stand: 2026-10-09 · Branch `Julius` · Status: **angehalten (Haltestelle 5)**  
Stories: [rt2_omlify_rechtstexte_v2.md](../stories/rt2_omlify_rechtstexte_v2.md), [rt2_wortlaut_delta.md](../stories/rt2_wortlaut_delta.md), [rt2_delta_nachtrag_h1_h2.md](../stories/rt2_delta_nachtrag_h1_h2.md), [rt2_delta_nachtrag_para9.md](../stories/rt2_delta_nachtrag_para9.md)

Teil 0 (Volltext v1, Ist-Zustand Zustimmung/Stripe/Protokolle) bleibt oben in diesem Bericht erhalten (früherer STOPP). Unten: Umsetzung nach H1/H2-Klarstellung.

---

## Umsetzung — Ergebnis

### Dateien

| Neu / geändert | Inhalt |
|---|---|
| `docs/legal/AGB.v2.md` | AGB Version 2, Stand 08.10.2026 (v1 `AGB.md` unverändert) |
| `docs/legal/Datenschutzerklaerung.v2.md` | Datenschutz Version 2 (v1 unverändert) |
| `scripts/render-legal-pages.mjs` | Quellen → v2; Export `GENERATED_TERMS_*` / `GENERATED_PRIVACY_*` |
| `20261008200000_rt2_omlify_terms_privacy_retention.sql` | Seed terms/privacy, Nachweise überleben Löschung, `retention_cleanup` + Cron |
| `ContractUpdateBanner` | gemeinsames Banner AGB+AVV mit Häkchen + „Zustimmen“ |
| Onboarding | Pending-Flag `yogaflow_pending_legal_bundle` → terms+privacy+avv |
| `scripts/test/rt2_retention.mjs`, `e2e/rt2.spec.ts` | Rauch / E2E |

### Hashes (normalisierter Markdown ohne Hinweise)

| Dokument | Version | content_hash |
|---|---|---|
| terms (AGB) | 2026-10-09 | `815a10da0ad9a1f70fde4ca8dac7e684dd2ac8ec14225b3830e3318c8ad6927d` (Abs. 3+4 Nachtrag; zuvor `9acd5496…` / Abs.-3-Klarstellung; davor `4b9d1309…`) |
| privacy | 2026-10-08 | `17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d` |
| avv | 2026-10-04 | unverändert `b90051ca…` |

### Technik / Produktlücken (laut Nachtrag)

- **„Nur noch zum Export nutzbar“:** entfällt mit neuem Abs. 3/4 (kein eigener Kontozustand). Kündigungen weiter manuell (`delete_tenant_complete`); Online-Zahlung bei Kündigung von Hand ausschalten; Exporte per E-Mail. Punkt in [OFFENE_PUNKTE.md](../OFFENE_PUNKTE.md) aktualisiert.
- Impressum: unverändert (kein OS-Link, USt-IdNr. vorhanden).

### § 9 Abs. 3 + 4 — Nachtrag (Claude 09.10.2026)

Abs. 2 unverändert („jederzeit ohne Einhaltung einer Frist“). Abs. 3 und Abs. 4 ersetzt:

> (3) Die Kündigung wird mit ihrem Zugang wirksam. Danach bleibt die Studio-Umgebung noch 30 Tage zugänglich, damit das Studio seine Daten exportieren kann (insbesondere Teilnehmende, Buchungen, Zahlungen und Belege).

> (4) Nach Ablauf dieser 30 Tage löscht Omlify die im Auftrag des Studios verarbeiteten Daten unwiderruflich nach Maßgabe des Auftragsverarbeitungsvertrags. Ausgenommen sind Daten, die Omlify selbst gesetzlich aufbewahren muss oder zum Nachweis seiner eigenen Pflichten benötigt, insbesondere Nachweise über Zustimmungen zu diesen AGB und zum Auftragsverarbeitungsvertrag; diese löscht Omlify drei Jahre nach Vertragsende.

**AVV-Prüfung (keine Haltestelle):** AVV § 10 Abs. 1–2 nennt dieselbe Frist — 30 Tage nach Vertragsende nutzbar/Export, danach Löschung aus dem Produktivsystem. Zitat:

> (1) Nach Beendigung des Nutzungsvertrags bleibt die Umgebung des Verantwortlichen **30 Tage** nutzbar. … (2) Nach Ablauf dieser Frist löscht der Auftragsverarbeiter alle Daten des Verantwortlichen unwiderruflich aus dem Produktivsystem.

Keine abweichende Löschfrist. (AVV Abs. 3: Backups 90 Tage — AGB verweist auf „nach Maßgabe des AVV“.)

Neuer terms-Hash → Banner erneut für Studios mit alter Zustimmung. Beleg: DEV `stale_terms = 2`; E2E Banner sichtbar → Zustimmen → weg.

### Tests (Belege)

```
npm run check:ci → grün
npm run dev:apply → 20261009140000 angewendet
node scripts/test/b2_legal_acceptances.mjs → Fertig
npm run dev:e2e -- e2e/rt2.spec.ts → 1 passed
```

### Deploy-Nachweis (vor Haltestelle 5)

Abs. 3+4 Nachtrag (dieser Lauf — nach Push eintragen):

| Beleg | Ergebnis |
|---|---|
| HEAD | _(nach Push)_ |
| Migration | `20261009140000` auf DEV |
| terms-Hash | `815a10da0ad9a1f70fde4ca8dac7e684dd2ac8ec14225b3830e3318c8ad6927d` |
| `check:ci` / E2E | grün / `e2e/rt2.spec.ts` 1 passed |
| Live-Bundle | _(nach Workers-Build)_ |
| Merkmal Hash | `815a10da…` |
| Merkmal Abs. 3 | `Die Kündigung wird mit ihrem Zugang wirksam` |
| Merkmal Banner | `Aktualisierte Vertragsunterlagen` |

---

## Diff AGB alt → neu

Quelle alt: `docs/legal/AGB.md` (Stand 20.09.2026)  
Quelle neu: `docs/legal/AGB.v2.md` (Stand 09.10.2026 · Version 2)

### Stand-Zeile

| Alt | Neu |
|---|---|
| `**Stand:** 20.09.2026` | `**Stand:** 09.10.2026 · Version 2` |

### § 5 Abs. 3 (ersetzt)

**Alt:** Studio ist datenschutzrechtlich Verantwortlicher; informiert Teilnehmende; hält Impressum, Datenschutzerklärung und ggf. eigene Vertragsbedingungen ein.

**Neu:** Auf seiner Buchungsseite tritt das Studio gegenüber den Teilnehmenden als Anbieter auf. … Omlify stellt dafür Vorlagen bereit (§ 7a). Die Pflicht des Studios, für richtige und vollständige Angaben zu sorgen, bleibt unberührt.

### § 6 Abs. 3 (ersetzt — H1)

**Alt:** „Zahlungen zwischen Studio und Teilnehmenden werden derzeit nicht über Omlify abgewickelt.“

**Neu:** „Zahlungen der Teilnehmenden an das Studio kann das Studio in Omlify als vor Ort erhalten vermerken oder, wenn es die Online-Zahlung nutzt, nach § 8a über Stripe abwickeln. Omlify selbst nimmt keine Zahlungen der Teilnehmenden entgegen.“

### Neu: § 7a Vorlagen für Rechtstexte

Wortlaut aus Delta (Abs. 1–3) wörtlich — Vorlagen, keine Rechtsberatung, neue Vorlage → Info in der App, alte Freigabe gilt bis Freigabe der neuen.

### Neu: § 8a Online-Zahlungen

Wortlaut aus Delta (Abs. 1–8) wörtlich. Querverweis „§ [Haftung]“ → **§ 11**.

### Neu: § 8b Mitwirkung bei Meldepflichten

Wortlaut aus Delta wörtlich (PStTG / Behördenmeldungen).

### § 9 Abs. 4 (ersetzt — H2)

**Alt:** Nach 30 Tagen Löschung der Studio-Umgebung einschließlich aller Daten unwiderruflich; Sicherungen 90 Tage.

**Neu:** 30 Tage Exporte (Teilnehmende, Buchungen, Zahlungen, Belege); Konto nur noch zum Export nutzbar; danach Löschung nach AVV; Ausnahme Nachweise AGB/AVV drei Jahre nach Vertragsende.

Zusätzlicher Delta-Satz „Nach Vertragsende stellt Omlify …“ **nicht** angehängt (laut H2 bereits in Abs. 4 enthalten).

### § 9 Abs. 3 (Klarstellung 09.10.2026)

**Vorher (v2 erste Fassung):** „Nach Zugang der Kündigung bleibt die Studio-Umgebung **30 Tage** im bisherigen Umfang nutzbar.“

**Nachher:** Halbsatz ergänzt — „bis zum Wirksamwerden der Kündigung“ (siehe Zitat oben). Bedeutet die Zeit bis zum Wirksamwerden, keine Änderung der Systematik zu Abs. 4.

### § 10 Änderungen (ersetzt)

**Alt:** Widerspruchs-Fiktion nach sechs Wochen Textform.

**Neu:** Ankündigung sechs Wochen per E-Mail und in der App; wirksam nur mit Zustimmung in der App; ohne Zustimmung gilt die alte Fassung; Kündigung nach allgemeinen Regeln.

### Unverändert

§ 1–4, § 5 Abs. 1–2/4–5, § 6 Abs. 1–2, § 7, § 8, § 9 Abs. 1–3/5, § 11, § 12.

### Nummerierung / Querverweise AGB

| Stelle | Anpassung |
|---|---|
| § 5 Abs. 3 → § 7a | neu |
| § 6 Abs. 3 → § 8a | neu |
| § 8a Abs. 8 | § 11 |
| Neue §§ | 7a, 8a, 8b eingefügt; 9–12 Nummern stabil |

---

## Diff Datenschutzerklärung alt → neu

Quelle alt: `docs/legal/Datenschutzerklaerung.md` (Stand 21.09.2026)  
Quelle neu: `docs/legal/Datenschutzerklaerung.v2.md` (Stand 08.10.2026 · Version 2)

### Stand-Zeile

| Alt | Neu |
|---|---|
| 21.09.2026 | 08.10.2026 · Version 2 |

### Neue Abschnitte (nach „4. Registrierung und Benutzerkonto“)

| Neu Nr. | Titel | Kern |
|---|---|---|
| 5 | Anbindung an Stripe | Stripe eigener Verantwortlicher; Omlify nur Kennung/Status; Art. 6 Abs. 1 lit. b |
| 6 | Zahlungen der Teilnehmenden | AV Art. 28; Studio verantwortlich; Stripe Abwicklung |
| 7 | Nachweise und Betriebssicherheit | Zustimmungs-Nachweise +3 Jahre; Protokolle 90d / 12m / 13m |

### Verschobene Abschnitte (alt → neu)

| Alt | Neu | Titel |
|---|---|---|
| 5 | 8 | Kursbuchungen |
| 6 | 9 | Nachrichten |
| 7 | 10 | E-Mails |
| 8 | 11 | Kontakt |
| 9 | 12 | Speicherung im Browser |
| 10 | 13 | Empfänger und Auftragsverarbeiter |
| 11 | 14 | Übermittlung in Drittländer |
| 12 | 15 | Speicherdauer |
| 13 | 16 | Ihre Rechte |
| 14 | 17 | Beschwerderecht |
| 15 | 18 | Keine automatisierte Entscheidungsfindung |
| 16 | 19 | Änderungen dieser Erklärung |

### Querverweise angepasst

| Stelle | Alt | Neu |
|---|---|---|
| Abschn. 3 Cloudflare | „Abschnitt 10“ | „Abschnitt 13“ |
| Abschn. 10 E-Mails | „Abschnitte 10 und 11“ | „Abschnitte 13 und 14“ |

### Abschnitt 13 Empfänger (war 10)

- Tabelle aus `docs/legal/subprocessors.json` (Namen/Orte angeglichen: AWS EMEA SARL, Resend-Wortlaut, Cloudflare-Zweck).
- Neuer Satz: „Stripe ist für Omlify kein Auftragsverarbeiter, sondern verarbeitet Daten als eigener Verantwortlicher (siehe Abschnitt ‚Anbindung an Stripe‘).“

### Abschnitt 15 Speicherdauer (ergänzt)

Bullet-Punkte für Nachweise (+3 Jahre), ops_alerts 90 Tage nach Erledigung, email_deliveries 12 Monate, provider_events_raw 13 Monate (nur verarbeitet/reviewed).

---

## Klicktest (Haltestelle 5)

1. Owner mit alter AGB-Zustimmung (z. B. demoalpha): Banner zeigt **AGB (v2)** — Text öffnen, prüfen § 9 Abs. 3 „Die Kündigung wird mit ihrem Zugang wirksam“ und Abs. 4 ohne „nur noch zum Export nutzbar“; Abs. 2 unverändert fristlos; Häkchen, Zustimmen → Banner weg; neue `legal_acceptances`-Zeile Version `2026-10-09` / Hash `815a10da…`.
2. Einstellungen › Rechtliches: Abschnitte AGB (Omlify) + AVV; Aufmerksamkeit listet fehlende AGB/AVV.
3. `/legal/agb` und `/legal/datenschutz` auf omlify-dev: Stand AGB **09.10.2026** · Version 2; kein OS-Link im Impressum.
4. Neues Studio Onboarding: AGB + Datenschutz + AVV verlinkt; nach Login werden drei Fassungen gespeichert.

---

## Unsicherheiten / Entscheidungen

1. § 9 Abs. 3+4: Claude-Nachtrag 09.10.2026 — wirksam mit Zugang, 30 Tage zugänglich zum Export, dann Löschung nach AVV; Abs. 2 bleibt fristlos.
2. Datenschutz-Zustimmung: im Banner nur AGB+AVV (Story-Wortlaut); Privacy nur Onboarding + Seed in `legal_document_versions`.
3. `email_deliveries`-Retention im Rauchtest nicht mit künstlicher Zeile belegt (Event-Schema streng); Codepfad in `retention_cleanup` vorhanden; ops_alerts + provider_events_raw + verwaiste Acceptances belegt.
