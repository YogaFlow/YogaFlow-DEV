# Bericht RT-1 — Studio-Rechtstexte

Status: **angehalten** (Haltestelle 1b — Nachtrag 3 weicht ab).  
Stand 05.10.2026 · Branch `Julius` · HEAD siehe `git log -1`  
Vorgabe: [docs/stories/rt1_studio_rechtstexte.md](../stories/rt1_studio_rechtstexte.md) · [Freigabe Teil 0](../stories/rt1_freigabe_teil0.md) · [Entscheidung 17](../entscheidungen/17_Studio_Rechtstexte.md) · Vorlagen-Quelle [docs/legal/studio/vorlagen_v1_quelle.md](../legal/studio/vorlagen_v1_quelle.md)

Rechtliche Einordnung der Vorlagen von Claude, nicht anwaltlich geprüft. Keine Secrets/E-Mails in diesem Bericht.

---

## Teil 0 — Inventur (nur lesen)

### Kurzfazit

Omlify-eigene Rechtstexte (Impressum, Datenschutz, AGB/Nutzungsbedingungen, AVV) liegen unter `docs/legal/`, werden zu `legal/*.html` und `src/generated/legalDocuments.ts` gerendert und erscheinen auf der Marketing-Apex sowie im Pop-up `LegalDocumentSheet`. Auf Studio-Subdomains gibt es **keinen** Fuß mit Impressum/AGB/Datenschutz; Checkout-Links öffnen heute die **Omlify-Plattformtexte**, nicht Studio-Texte. Studio-Vorlagen v1 liegen nur als Sammelquelle `vorlagen_v1_quelle.md` (noch nicht aufgeteilt).

Anbieterangaben: `tenant_legal_profiles` mit optionalem `tax_id` = „Steuernummer oder USt-IdNr.“ (ein Feld). Sperrgründe laufen über `yogaflow_private.online_method_block_reason` → Anzeige in Einstellungen › Zahlungen. AGB-Vorlage Ziffer 6.2 (Karte nach Frist = genutzt) **stimmt** mit der Software überein — keine Abweichungs-Haltestelle. Mail-Anhänge (inkl. PDF als Base64) sind technisch möglich; PDF-Erzeugung gibt es noch nicht.

---

### 1 — Bestand Rechtstexte

| Dokument | Quelle | Rendern / Anzeige |
|---|---|---|
| Impressum (Omlify) | `docs/legal/Impressum.md` | `scripts/render-legal-pages.mjs` → `legal/impressum.html`, `LEGAL_DOCUMENTS.impressum`; Marketing-Footer; Apex `https://omlify.de/legal/impressum`; Pop-up |
| Datenschutzerklärung (Omlify) | `docs/legal/Datenschutzerklaerung.md` | analog `datenschutz` |
| AGB / Nutzungsbedingungen (B2B, Omlify) | `docs/legal/AGB.md` | analog `agb` |
| AVV | `docs/legal/AVV_Auftragsverarbeitung.md` | analog `auftragsverarbeitung`; Hash in `legal_document_versions` / Client `legalVersions.ts`; Owner-Banner, Onboarding, Einstellungen |
| Studio-Vorlagen v1 | `docs/legal/studio/vorlagen_v1_quelle.md` | **noch nicht** in `impressum.v1.md` / `agb.v1.md` / `datenschutz.v1.md` (erst nach Freigabe) |
| Widerrufsbelehrung Karten (K1) | Text in `src/lib/passOnlineTexts.ts` (`PASS_WITHDRAWAL_BELEHRUNG_BODY`), nicht unter `docs/legal/` | PassPurchaseSheet-Pop-up; Mailtext Kartenkauf; öffentliche Seite `/widerruf` ist **Formular** (Lookup/Bestätigen), keine Belehrung-Seite |
| Muster-Widerrufsformular | in K1-Mail-/Belehrungspfad (Text), kein eigenes `docs/legal/*.md` | — |

Routen / Worker:

- Marketing/Apex: `/legal/*` → `LegalPage.tsx` (Links auf Apex); Worker liefert `legal/*.html` (`src/worker.ts` ca. Zeilen 30–33, 115).
- Studio-App: `App.tsx` Route `/legal/*` → `LegalPage` (Apex-Links); `/widerruf` → `Widerruf.tsx` (Karten-Widerruf).
- Pop-up: `LegalDocumentSheet.tsx` liest ausschließlich `src/generated/legalDocuments.ts` (Omlify-Kanons).

Footer Studio-Subdomain: `src/components/Layout/Layout.tsx` — Sidebar + Header, **kein** Footer mit Rechtstext-Links. Marketing-Footer nur `src/marketing/sections/Footer.tsx` (Apex).

→ Für RT-2 (Omlify-eigene Texte): Impressum/Datenschutz/AGB/AVV existieren bereits und sind produktiv angebunden; Studio-Fuß und Studio-Routen `/impressum` usw. fehlen komplett.

---

### 2 — Anbieterangaben (`tenant_legal_profiles`)

Migration `20261004090000_b1_legal_profiles.sql` (Tabelle ab Zeile 24):

| Spalte | Pflicht | Bedeutung heute |
|---|---|---|
| `legal_name` | ja | Name/Firma |
| `street`, `house_number`, `postal_code`, `city` | ja | Anschrift |
| `country` | ja (Default `DE`) | Land (ISO-2) |
| `contact_email` | ja | Kontakt |
| `phone` | optional | Telefon |
| `tax_id` | optional | UI-Label: **„Steuernummer oder USt-IdNr. (optional)“** (`LegalProfileSection.tsx:18`) — **ein** Freitextfeld, keine Trennung |

Vollständigkeit: `yogaflow_private.legal_profile_complete` — Name, Anschrift, Land, E-Mail; `tax_id`/`phone` nicht nötig (`20261004090000` Zeilen 61–79).

Pflege: Einstellungen › Rechtliches → `LegalProfileSection` / RPC `upsert_studio_legal_profile` / `get_studio_legal_profile` (`src/lib/studioLegalProfile.ts`).

Belege: Snapshot enthält `tax_id` (`issue_receipt_for_payment`, z. B. `20261004100000` / Folgemigrationen). Beleg-UI (`Receipt.tsx`) zeigt Verkäuferin aus Name/Anschrift/E-Mail/Telefon — **`tax_id` wird auf der Belegseite nicht gerendert**.

RT-1 Scope A plant neue Felder (Rechtsform, Vertretung, Register, getrennte USt-IdNr., Wirtschafts-ID) — heute nicht in der Tabelle.

---

### 3 — Platzhalter-Quellen (Ist)

| Platzhalter / Thema | Quelle heute |
|---|---|
| `{{studio_name}}` | `tenants.name` |
| `{{legal_name}}` … Anschrift, E-Mail, Telefon | `tenant_legal_profiles` |
| `{{legal_form_label}}`, `{{representatives}}`, Register, `{{vat_id}}`, `{{economic_id}}` | **fehlen** (neu in RT-1 A) |
| `{{studio_url}}` | Subdomain/Domain-Konvention (`{slug}.omlify.de` / eigene Domain) — Client: Tenant-Slug |
| `{{cancellation_hours}}` | `tenants.cancellation_window_hours` (0–72, Default 24); bei Buchung eingefroren als `registrations.cancellation_deadline` (A6-1 `20260927221500`) |
| `{{tax_small_business}}` | `tenant_tax_settings.regime` = `small_business` \| `regular` (+ `vat_rate_bp`); Client `src/lib/taxStatus.ts` |
| `{{pay_online}}` / `{{pay_onsite}}` | `tenant_payment_settings.online_payments_enabled` / `allow_onsite_payment` (ZW-1 / Entscheidung 14); Blocker `online_method_block_reason` |
| `{{passes_any}}` | existierende `pass_products` des Tenants (nicht archiviert) |
| `{{passes_online}}` | `pass_products.online_purchasable` (K1 `20261004270000`) |
| `{{extra_rules}}` | **fehlt** (neu) |
| Nachrück-Frist | `yogaflow_private.promotion_hold_deadline` — `LEAST(now()+12h, Kursbeginn Berlin − 2h)` (`20260929150000` Zeilen 25–40) |
| Karten Gültigkeit / Verfall / Verlängerung | Produkt: `pass_products.validity_rule` / `validity_value`; Verfall `expire_passes` + Mails `pass_expiring_30` / `pass_expiring_7`; Verlängerung `pass_validity_changes` + Owner-Dialog |

#### Abmeldung nach Frist — Abgleich AGB 6.2

| Fall | Software | Vorlage AGB 6.2 |
|---|---|---|
| Online bezahlt, in Frist | Erstattung (`self_cancel_in_window`) | voll zurück |
| Online bezahlt, nach Frist | keine Erstattung (Trigger nur bei `now() < deadline`) | keine Erstattung |
| Mit Karte, in Frist | `reverse_redemption` → Einheit zurück | Gutschrift |
| Mit Karte, nach Frist | keine Reverse; Meldung „Die Frist ist vorbei, die Einheit bleibt verbraucht.“ (`unregister_from_course` in `20261002113000` Zeilen 152–182) | „Termin gilt als genutzt“ |
| Vor Ort, in Frist | Abmeldung, nichts fällig | nichts an |
| Vor Ort, nach Frist | Abmeldung möglich; offene Deckung/Zahlpflicht bleibt fachlich bestehen (keine automatische Erlass) | Preis bleibt geschuldet |

**Ergebnis:** Keine Abweichung → **keine Haltestelle** zu Ziffer 6.2.

---

### 4 — Datenschutz-Fakten (für Vorlage)

| Frage | Befund |
|---|---|
| (a) Analytics / Tracking / Fremd-Schriften / Sentry auf Studio-Subdomains? | `index.html` ohne Tracker/Sentry/Google-Fonts. App-CSS: lokale `@font-face` in Marketing-CSS; Studio-SPA ohne externe Schrift-CDN. Kein Treffer auf gtag/plausible/sentry/posthog in `src/`. → Vorlage „keine Werbe-Tracker“ passt; **keine Text-Haltestelle**. |
| (b) Freitext Gesundheit bei Buchung/Profil? | Registrierung: nur Name, E-Mail, Passwort (`RegisterForm.tsx`). Kein Profilfeld „Beschwerden“. Staff-Notizen bei Erlass/Verlängerung sind **Studio-intern**, kein Teilnehmenden-Gesundheitsfeld. `courses.prerequisites` = Kursbeschreibung, nicht Teilnehmerangabe. → `{{health_notes}}` = **aus** (Abschnitt weglassen). |
| (c) Mails außer Transaktion? | `dispatch-emails`: Buchung/Zahlung/Erstattung, Wartelisten-Nachrücken, Kartenkauf, Ablauf 30/7 Tage, Units niedrig. **Kein** Newsletter/Marketing. |
| (d) Registrierung Pflicht/optional | Pflicht: Vorname, Nachname, E-Mail, Passwort (+ Bestätigung). Kein Telefon bei Registrierung (optional später im Profil möglich). |
| (e) Unterauftragsverarbeiter | Einzige Quelle: AVV Anlage 2 in `docs/legal/AVV_Auftragsverarbeitung.md` (Tabelle ab Zeile 258). **Keine** separate JSON/SQL-Tabelle. Hash der AVV-MD ist kanonisch; Renderer muss dieselbe Liste speisen — Abweichung = Testfehler (laut Vorlagen-Hinweis). |

---

### 5 — Mail-Anhänge / PDF

| Punkt | Befund |
|---|---|
| Anhänge möglich? | **Ja.** `send-email/index.ts`: `attachments[]` an Nodemailer/SMTP (Resend). Max. 5 Anhänge; `content.length` ≤ 400_000; Encoding `utf-8` oder `base64`; `contentType` frei (Default `application/octet-stream`). |
| Heute genutzt | ICS-Kalenderanhang an Zahlungsbestätigung (`dispatch-emails/handler.ts` / Tests). |
| PDF-Erzeugung | **Keine** Bibliothek/Pipeline im Repo. Belege: HTML-Seite + „Drucken / als PDF speichern“ (`RECEIPT_PRINT_LABEL`) — Browserdruck, kein Server-PDF. |

→ Anhang technisch möglich → **keine** Haltestelle nach Story Punkt E („wenn Anhang nicht möglich“). PDF-Erzeugung ist Umsetzungsarbeit Teil E (neue Abhängigkeit vorher mit Julius klären — Regel: keine neuen Dependencies ohne Rückfrage).

---

### 6 — Buchungs-/Kauf-Pfade und heutige Hinweise

| Pfad | Einstieg | Knopf | AGB / Datenschutz heute |
|---|---|---|---|
| Kurs online | `PaymentSheet` → `StripePaymentForm` | „Zahlungspflichtig buchen“ | `BookingCheckoutFooter` (`BookingSummaryBlock.tsx:105–131`): Links **Omlify**-AGB/Datenschutz via `LegalDocLink` |
| Kurs vor Ort | `OnsiteBookConfirmSheet` | „Zahlungspflichtig buchen“ | **keine** AGB/Datenschutz-Zeile |
| Mit Karte buchen | `CourseDetail` / Method-Sheet → `useCourseEnrollment` | Karten-Label | kein Checkout-Footer mit Rechtstexten |
| Nachrücken / Spätzahlung | `MyRegistrations` → `PaymentSheet` | wie online | wie Kurs online (Omlify-Links) |
| Karte online kaufen | `PassPurchaseSheet` | „Zahlungspflichtig kaufen“ | Widerrufsbelehrung + Consent; **kein** vollständiger BookingCheckoutFooter mit Studio-AGB |
| Registrierung | `RegisterForm` | „Registrieren“ | **kein** Datenschutz-Link |
| Onboarding Owner | `OnboardingWizard` | Checkboxen | Omlify-AGB + Datenschutz + AVV |

Lücke zu L7: Hinweis „Es gelten die AGB von {Studio}…“ und Studio-Pop-ups fehlen; Registrierung ohne Datenschutz-Link; Vor-Ort- und Kartenbuchung ohne Hinweiszeile.

---

### 7 — Online-Bereitschaft / Sperrgründe

Berechnung (Reihenfolge), `yogaflow_private.online_method_block_reason` in `20261004200000_zw1_zahlungswege.sql` Zeilen 121–153:

1. `PLATFORM_DISABLED`
2. `ONLINE_DISABLED`
3. `PROVIDER_NOT_READY`
4. `TAX_SETTING_MISSING`
5. `LEGAL_PROFILE_MISSING` (`legal_profile_complete`)
6. `AVV_MISSING` (`current_avv_accepted`)
7. `AMOUNT_ABOVE_RECEIPT_LIMIT` (bei Betragsprüfung)

Anzeige Client:

- Copy: `src/features/payments/paymentSetupCopy.ts` Zeilen 78, 90–110 (`onlineNotReady`, `onlineReadyReasons`, `switchErrors`).
- UI: `OnlinePaymentSection.tsx` Zeilen 274–297 — „Online ist noch nicht bereit: …“ mit Sprung `#steuern` oder `/settings/rechtliches`.
- Status-RPC: `get_payment_setup_status` (u. a. `legal_profile_present`, `avv_accepted`, `tax_setting_present`).
- Switch-Fehler Mapping: `usePaymentSetup.ts` Zeilen 76–77.

`STUDIO_LEGAL_TEXTS_MISSING` existiert **noch nicht** — RT-1 F hängt ihn in dieselbe Blocker-Funktion und dieselbe Anzeige.

---

### Hinweise für Umsetzung (überholt durch Freigabe / Haltestelle 1b)

---

## Freigabe Teil 0 (angenommen)

Quelle: [rt1_freigabe_teil0.md](../stories/rt1_freigabe_teil0.md).

| # | Entscheidung |
|---|---|
| F1 | Omlify-Links in allen Buchungs-/Kaufpfaden durch Studio-Texte ersetzen (L7). Ohne freigegebene AGB: Vor Ort keinen AGB-Link, Datenschutz-Link Studio-Seite (L8). Online gesperrt (L9). Omlify-Texte nur wo Omlify Vertragspartner ist → RT-2. |
| F2 | AGB 6.2 = Software — Vorlage bleibt. |
| F3 | PDF via Edge Function + `pdf-lib`, Schrift im Repo; Outbox-Auftrag `legal_pdf.render`; Mail wartet bis 10 min, sonst Link + `ops_alert` (L6). |
| F4 | `health_notes`-Block entfernen — einzige erlaubte Wortlaut-Änderung. |

L1–L11 unverändert. Demodaten nach G.

---

## Nachträge vor Umfang A (Datei:Zeile)

| # | Satz | Ergebnis |
|---|---|---|
| N1 | `tax_id` ist heute **ein** Freitext „Steuernummer oder USt-IdNr.“ (`LegalProfileSection.tsx:18`, Spalte `tenant_legal_profiles.tax_id` in `20261004090000_b1_legal_profiles.sql:34`). Die Impressum-Vorlage zeigt nur `{{vat_id}}` / `{{economic_id}}` (`vorlagen_v1_quelle.md:48–51`) — **kein** Steuernummer-Platzhalter. → Neues Feld `vat_id` (und `economic_id`) fürs Impressum; `tax_id` bleibt getrennt (Beleg/optional). Passt zur Freigabe. |
| N2 | Auf Studio-Subdomains: kein Analytics/Tracking/Sentry in `src/` (0 Treffer gtag/sentry/plausible/…); `index.html:1–26` ohne Fremd-Script/Fonts; App-Fonts lokal (`src/index.css` erbt, Marketing-`@font-face` nur Apex). Google-Fonts nur in `docs/landingpage-prototyp.html:38–40` (nicht Studio-SPA). → Vorlage Ziffer 4 („keine Analyse- oder Werbe-Cookies“) passt. |
| N3 | **Abweichung.** Freigabe: „Software tut nichts → passt zu bleibt geschuldet“. Ist: `unregister_from_course` setzt immer `status = cancelled` (`20261002113000_s3_2a_refund_triggers.sql:137–144`), ohne Frist-Sperre und ohne Erlass/Zahlung. Für Vor-Ort/`open` gibt es **keine** Rückbuchung und **keine** Hinweiszeile „Preis bleibt geschuldet“. Gleichzeitig fällt die Zeile aus der Offenen-Liste: `get_open_coverage` filtert `status = 'registered'` und `coverage_status = 'open'` (`20261004240000_ux5_archived_rls.sql:93–94`). Nach Spät-Abmeldung Vor Ort ist die Forderung im Produkt **nicht mehr sichtbar** — das ist mehr als „tut nichts“ und schwächt „bleibt geschuldet“ operativ. → **STOPP**. |
| N4 | Unterauftragsverarbeiter: nur Markdown-Tabelle AVV Anlage 2 (`docs/legal/AVV_Auftragsverarbeitung.md:258–269`). Kein `docs/legal/subprocessors.json`. → Neu anlegen; AVV und Datenschutz lesen daraus (laut Freigabe). |
| N5 | Omlify-eigene Texte für RT-2 liegen im Repo: `docs/legal/Impressum.md`, `docs/legal/Datenschutzerklaerung.md`, `docs/legal/AGB.md` (Nutzungsbedingungen B2B), `docs/legal/AVV_Auftragsverarbeitung.md`; gerendert über `scripts/render-legal-pages.mjs` → `legal/*.html` + `src/generated/legalDocuments.ts`. |

---

## Haltestelle 1 — Freigabe Teil 0

Erledigt (siehe Freigabe-Datei).

---

## Haltestelle 1b — Nachtrag 3 (Abmeldung Vor Ort nach Frist)

**Frage an Julius/Claude:** Soll die AGB-Formulierung („Preis bleibt geschuldet“) bleiben, obwohl Spät-Abmeldung Vor Ort die Buchung aus `get_open_coverage` entfernt — oder soll die Software die offene Forderung nach Spät-Abmeldung behalten (z. B. `status`/`coverage` so lassen, dass Owner sie weiter sieht)?

Bis zur Antwort: **kein** Vorlagen-Split, kein Umfang A–G.
