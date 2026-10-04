# Bericht UX-2 Teil A — Checkout, Legal-Pop-up, FormField

Status: **fertig** (Klicktest Haltestelle 5 — Liste in LAUF_UX2). Stand 04.10.2026.  
Commit: `cd16a93` · Branch `Julius`

Vorgabe: [docs/stories/ux2_checkout_mail_export_desktop.md](../stories/ux2_checkout_mail_export_desktop.md) A1–A4.

## Commits

- `cd16a93` feat(geldkette): UX-2 Teil A Checkout, Legal-Pop-up, FormField

## A1 — Fehler aus dem Klicktest

| Punkt | Ergebnis |
|---|---|
| AVV-Knopf schwarz | Ursache: `text-brandFg` (kein Token). Fix: `text-onBrand` + `active:bg-brandPressed` |
| „Volltext öffnen“ → Übersicht | Ursache: Tenant-Host fängt `/legal/*` mit SPA-Stub `LegalPage` ab. Fix: Pop-up mit Body aus MD (A2) |
| Formularfehler | Neue `FormField` / `FieldError` (UX-1-Muster). Umgestellt: Anbieterangaben, Onboarding Name/E-Mail/Passwort-Bestätigung, Erstatten-Betrag nutzt `FieldError` |
| Kasten „stripe ›“ | **Stripe.js Testmodus-Badge** (nicht App-Code). Erscheint nur mit Test-Publishable-Key. Überdeckt keinen Pflichttext im neuen Fuß; kein Extra-Platz nötig. Live mit `pk_live_…` entfällt er |
| AVV-Diff | vollständiger Diff 21.09 → 04.10 unten |

### Formular-Inventur (alt → neu)

| Formular | Alt | Neu |
|---|---|---|
| Anbieterangaben | Form-Fehler `text-text` ohne Farbe | `FormField` je Pflichtfeld, `border-danger` + Icon |
| Onboarding Name/E-Mail | neutrale Inputs | `FormField` |
| Onboarding Passwort-Bestätigung | nur `border-danger` | `FormField` + Fehlerzeile |
| Erstatten Teilbetrag | Inline-Muster UX-1 | `FieldError` gemeinsam |
| Auth Login/Register, Kursformulare, Studio-Design | noch Form-Level / unverändert | bewusst nachrangig; Inventur hier |

## A2 — Rechtstexte als Pop-up

- `LegalDocumentSheet` + `ModalBackdrop`: mobil Sheet, Desktop max 720 px
- Quelle: `docs/legal/*.md` → `scripts/render-legal-pages.mjs` schreibt `legal/*.html` **und** `src/generated/legalDocuments.ts`
- Pop-up und Apex-Seite teilen denselben `markdownToHtml`-Body
- „Als eigene Seite öffnen“ → `https://omlify.de/legal/…`
- AVV: „AVV abschließen“ auch im Pop-up-Fuß
- Verdrahtet: Einstellungen AVV, Onboarding-Häkchen, Checkout AGB/Datenschutz
- Hash: `AVV_CONTENT_HASH` = SHA-256 der Apex-HTML-Seite (unverändert `081aa26d…`); angezeigtes `data-hash` = dieselbe Konstante. Test `scripts/test/ux2_legal_hash.ts`

## A3 — Abdunklung

- `ModalBackdrop`: `bg-text/40` + `backdrop-blur-[4px]`, 150 ms; Reduced-Motion/Transparency-Fallbacks; Body-Scroll-Lock; Escape; Fokus im Panel
- Genutzt: Checkout, Legal-Sheet, ConfirmDialog, Erstatten-Sheet, Anbieter-Pop-up

## A4 — Checkout

- Titel „Buchung abschließen“, Hold-Pille (neutral / Warnung &lt; 3 min)
- Zusammenfassung 2 Zeilen; fester Fuß: Gesamt + Steuer + „Zahlungspflichtig buchen“ + kompakte Rechtzeile
- Land: Payment Element `billingDetails.address.country: 'never'` + `country: 'DE'` am Confirmation Token (Typen erlauben kein `if_required`)
- Desktop Dialog 480 px; Anbieter-Pop-up
- Unit: `cancelRuleLineCompact`, Steuerfuß §19 / 19 % / 7 %

## DoD

- `tsc` grün
- Unit `legal_checkout_texts` + `ux2_legal_hash` grün
- E2E `e2e/ux2.spec.ts` angelegt (Checkout-Fuß, Legal-Pop-up, Hash) — Lauf auf DEV empfohlen
- Keine Migration, keine neuen Secrets

## AVV-Diff (21.09.2026 → 04.10.2026)

Vollständig `git diff a18511e..e9e5b07 -- docs/legal/AVV_Auftragsverarbeitung.md`:

```diff
diff --git a/docs/legal/AVV_Auftragsverarbeitung.md b/docs/legal/AVV_Auftragsverarbeitung.md
index 4811104..848a801 100644
--- a/docs/legal/AVV_Auftragsverarbeitung.md
+++ b/docs/legal/AVV_Auftragsverarbeitung.md
@@ -1,6 +1,6 @@
 # Vertrag über die Verarbeitung personenbezogener Daten im Auftrag
 
-**nach Art. 28 DSGVO** · **Stand:** 21.09.2026
+**nach Art. 28 DSGVO** · **Stand:** 04.10.2026
 
 ---
 
@@ -34,6 +34,7 @@ verantwortlich.
 ## § 2 Art, Zweck und Umfang der Verarbeitung
 
 **Zweck:** Betrieb einer Kurs- und Buchungsverwaltung für den Verantwortlichen.
+Abwicklung von Online-Zahlungen über das Stripe-Konto des Verantwortlichen (Zahlung auslösen, erstatten, Status abgleichen), Ausstellung von Belegen und Buchungsbestätigungen im Namen des Verantwortlichen, vorbereitende Buchhaltung.
 
 **Art der Verarbeitung:** Erheben, Speichern, Ordnen, Auslesen, Verwenden,
 Übermitteln an die betroffene Person, Einschränken, Löschen.
@@ -55,6 +56,9 @@ verantwortlich.
 | Buchungsdaten | Kurszuordnung, Status, Wartelistenposition, Zeitpunkte von Anmeldung und Stornierung |
 | Kommunikationsdaten | Inhalte von Nachrichten innerhalb der Software, Sender, Empfänger, Kursbezug, Lesestatus |
 | Protokolldaten | technische Verbindungsdaten beim Aufruf der Anwendung |
+| Zahlungs- und Abrechnungsdaten | Betrag, Zahlungsart, Status, Zeitpunkte, Erstattungen (Betrag, Grund, interne Notiz des Studios), Rückbuchungen, Karten und Guthaben, Buchungen der vorbereitenden Buchhaltung, Referenznummern beim Zahlungsdienstleister. Keine Kartendaten — die gibt die Person direkt bei Stripe ein. |
+| Belege | Belegnummer, Datum, Leistung, Betrag, Steuerangabe, Anbieterangaben des Studios |
+| Anbieterangaben des Studios | Name, Anschrift, Kontakt-E-Mail, Telefon, Steuernummer/USt-IdNr. (bei Einzelpersonen personenbezogen) |
 
 **Besondere Kategorien nach Art. 9 DSGVO** sind nicht Gegenstand dieses Vertrags.
 Die Software sieht keine Felder zur Erfassung von Gesundheitsdaten vor. Der
@@ -109,6 +113,8 @@ der Änderung kündigen.
 (3) Der Auftragsverarbeiter schließt mit jedem Unterauftragsverarbeiter einen
 Vertrag, der dessen Pflichten mindestens auf dem Niveau dieses Vertrags festlegt.
 
+(4) Keine Unterauftragsverarbeitung ist die Zahlungsabwicklung durch die Stripe Payments Europe, Ltd. (Irland). Stripe handelt über das eigene Stripe-Konto des Verantwortlichen als eigener Verantwortlicher; es gilt der Vertrag zwischen dem Verantwortlichen und Stripe. Der Auftragsverarbeiter übermittelt Stripe im Auftrag des Verantwortlichen nur die für die jeweilige Zahlung nötigen Angaben.
+
 ## § 7 Unterstützung des Verantwortlichen
 
 (1) Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der
@@ -181,7 +187,7 @@ betroffen ist.
 
 # Anlage 1 — Technische und organisatorische Maßnahmen
 
-**Stand:** 21.09.2026
+**Stand:** 04.10.2026
 
 ## Vertraulichkeit
 
@@ -217,6 +223,10 @@ verschlüsselt.
 Quellcodeverwaltung mit nachvollziehbarer Historie; Änderungen am
 Datenbankschema ausschließlich über versionierte Migrationen.
 
+**Zahlungsdaten:** Kartendaten werden von Omlify weder verarbeitet noch gespeichert.
+
+**Protokolle:** E-Mail-Adressen, Beträge, Zahlungs- und Kontokennungen werden in Protokollen maskiert.
+
 ## Verfügbarkeit und Belastbarkeit
 
 **Verfügbarkeitskontrolle.** Täglich automatisierte vollständige Sicherung der
```

Nur Darstellung geändert (Pop-up); Inhalt der MD unverändert in diesem Commit.

## Fragen an Julius

1. Auth-/Kursformulare auch auf `FormField`? Empfehlung: ja, in einem späteren Aufräum-Commit.
2. Land-Feld: `never` + `country: 'DE'` — bitte mit Testkarte US (4242) kurz prüfen, ob Stripe durchlässt.
