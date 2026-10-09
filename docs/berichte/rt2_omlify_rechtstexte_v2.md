# Bericht RT-2 — Omlify-Rechtstexte v2

Stand: 2026-10-09 · Branch `Julius` · Status: **angehalten (Haltestelle 5)**  
Stories: [rt2_omlify_rechtstexte_v2.md](../stories/rt2_omlify_rechtstexte_v2.md), [rt2_wortlaut_delta.md](../stories/rt2_wortlaut_delta.md), [rt2_delta_nachtrag_h1_h2.md](../stories/rt2_delta_nachtrag_h1_h2.md)

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
| terms (AGB) | 2026-10-09 | `9acd5496274c520c18dcccb0fe6bbdae0626225b66bdfdc85dfa1e7734622fe4` (nach Abs.-3-Klarstellung; zuvor `4b9d1309…` / 2026-10-08) |
| privacy | 2026-10-08 | `17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d` |
| avv | 2026-10-04 | unverändert `b90051ca…` |

### Technik / Produktlücken (laut Nachtrag)

- **„Nur noch zum Export nutzbar“:** kein Kontozustand gebaut. Kündigungen weiter manuell (`delete_tenant_complete`); Julius stellt Exporte per E-Mail bereit. Punkt in [OFFENE_PUNKTE.md](../OFFENE_PUNKTE.md) aktualisiert.
- Impressum: unverändert (kein OS-Link, USt-IdNr. vorhanden).

### § 9 Abs. 3 — Klarstellung (Julius 09.10.2026)

Zitat (nach Ergänzung):

> (3) Nach Zugang der Kündigung bleibt die Studio-Umgebung bis zum Wirksamwerden der Kündigung **30 Tage** im bisherigen Umfang nutzbar. In dieser Zeit kann das Studio seine Daten exportieren.

Abs. 3 meint die Zeit **bis zum Wirksamwerden** der Kündigung (voller Umfang). Abs. 4 gilt **danach** (nur Export). Kein inhaltlicher Widerspruch — nur der Halbsatz „bis zum Wirksamwerden der Kündigung“ ergänzt, weil der bisherige Wortlaut unklar war. Neuer AGB-Hash → Banner erscheint erneut für Studios mit alter Zustimmung.

### Tests (Belege)

```
npm run check:ci → grün
npm run dev:apply → 20261008200000 angewendet
node scripts/test/rt2_retention.mjs → Retention fertig
  {"ops_alerts":1,"email_deliveries":0,"legal_acceptances":0,"provider_events_raw":1}
  Acceptance überlebt mit Schnappschuss; verwaiste Acceptance nach 3y-Alterung gelöscht (SQL)
node scripts/test/b2_legal_acceptances.mjs → Fertig
npm run dev:e2e -- e2e/rt2.spec.ts → 1 passed
```

### Deploy-Nachweis (vor Haltestelle 5)

Abs.-3-Klarstellung:

| Beleg | Ergebnis |
|---|---|
| HEAD | `64a9f4d` |
| Migration | `20261009120000` auf DEV |
| terms-Hash | `9acd5496274c520c18dcccb0fe6bbdae0626225b66bdfdc85dfa1e7734622fe4` |
| `check:ci` / E2E | grün / `e2e/rt2.spec.ts` 1 passed |
| Live-Bundle | `https://demoalpha.omlify-dev.de/assets/index-BCHIhVd8.js` |
| Merkmal Hash | `9acd5496…` @ 943205 |
| Merkmal Abs. 3 | `Studio-Umgebung bis zum` @ 952628 (Wortlaut mit „bis zum Wirksamwerden der Kündigung“) |
| Merkmal Banner | `Aktualisierte Vertragsunterlagen` @ 971579 |

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

1. Owner mit alter AGB-Zustimmung (Hash vor Abs.-3-Klarstellung, z. B. demoalpha): Banner zeigt wieder **AGB (v2)** — Text öffnen, prüfen § 9 Abs. 3 enthält „bis zum Wirksamwerden der Kündigung“, Häkchen, Zustimmen → Banner weg; neue `legal_acceptances`-Zeile mit Version `2026-10-09` / Hash `9acd5496…`.
2. Einstellungen › Rechtliches: Abschnitte AGB (Omlify) + AVV; Aufmerksamkeit listet fehlende AGB/AVV.
3. `/legal/agb` und `/legal/datenschutz` auf omlify-dev: Stand AGB **09.10.2026** · Version 2; kein OS-Link im Impressum.
4. Neues Studio Onboarding: AGB + Datenschutz + AVV verlinkt; nach Login werden drei Fassungen gespeichert.

---

## Unsicherheiten / Entscheidungen

1. § 9 Abs. 3: Julius — Zeit bis zum Wirksamwerden; Halbsatz ergänzt (09.10.2026).
2. Datenschutz-Zustimmung: im Banner nur AGB+AVV (Story-Wortlaut); Privacy nur Onboarding + Seed in `legal_document_versions`.
3. `email_deliveries`-Retention im Rauchtest nicht mit künstlicher Zeile belegt (Event-Schema streng); Codepfad in `retention_cleanup` vorhanden; ops_alerts + provider_events_raw + verwaiste Acceptances belegt.
