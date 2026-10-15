# Entscheidung 17 — Rechtstexte der Studios

Stand: 05.10.2026 · Entschieden von: Julius · Status: gilt nach Freigabe durch Julius  
Grundlage: Story [rt1_studio_rechtstexte.md](../stories/rt1_studio_rechtstexte.md).  
Rechtliche Einordnung von Claude, nicht anwaltlich geprüft.

| # | Entscheidung |
|---|---|
| L1 | Studio ist Anbieter. Impressum, AGB, Datenschutz gehören dem Studio. Omlify liefert Vorlagen, das Studio prüft und gibt frei („Ich habe die Texte geprüft und verwende sie als meine eigenen.“). Omlify ist technischer Dienstleister, keine Rechtsberatung — steht so am Freigabe-Dialog. |
| L2 | Vorlage + Werte, kein freier Editor. Texte entstehen aus Vorlage (versioniert im Repo, `docs/legal/studio/`) + Anbieterangaben + Einstellungen (Stornofrist, Steuerstatus, Zahlungswege, Karten). Grund: Die AGB müssen zu dem passen, was die Software tatsächlich tut. Einziges Freifeld: „Weitere Regeln des Studios“ (max. 1.500 Zeichen, z. B. Hausordnung, Mitbringen) als eigener Abschnitt in den AGB. |
| L3 | Freigabe gilt für die Vorlagen-Version, nicht für die Werte. Ändert das Studio eine Einstellung (z. B. Stornofrist 24 → 12 h), entsteht automatisch eine neue Fassung (Snapshot) ohne erneute Freigabe — es sind die eigenen Einstellungen. Bringt Omlify eine neue Vorlagen-Version, sieht der Owner ein Banner (wie AVV); bis zur Freigabe gilt die zuletzt freigegebene Version weiter. Online-Zahlung wird dadurch nicht gesperrt. |
| L4 | Fassungen sind append-only (`studio_legal_documents`: tenant, Art imprint/terms/privacy, Vorlagen-Version, gerendertes Markdown, Werte als JSON, `content_hash` wie AVV, Auslöser release/settings_change/profile_change, wer, wann). Aktuell = neueste je Art. Kein Löschen, kein Ändern. |
| L5 | Nachweis je Vertrag: Jede Buchung (alle Zahlarten) und jeder Kartenkauf speichert die AGB-Fassung (ID), die beim Klick galt. Teilnehmende setzen kein Häkchen für AGB (Hinweis + Abrufbarkeit reicht, § 305 Abs. 2 BGB) und keins für Datenschutz (Information, keine Einwilligung). |
| L6 | Dauerhafter Datenträger (§ 312f BGB): Bestätigungs-Mail (Kurs und Karte) hängt die AGB-Fassung als PDF an. PDF wird einmal je Fassung erzeugt und im privaten Storage abgelegt (`legal/{tenant}/{fassung}.pdf`), nicht je Mail. Fehlt das PDF (Fehler), geht die Mail trotzdem raus, mit Link, und ein `ops_alert` entsteht. |
| L7 | Anzeige: Auf jeder Studio-Subdomain Fuß-Links Impressum · Datenschutz · AGB · Widerruf (Widerruf nur, wenn das Studio Karten online verkauft), öffentlich ohne Login, Routen `/impressum`, `/datenschutz`, `/agb`, `/widerruf`. Im Buchungs-/Kauf-Sheet direkt über dem Knopf: „Es gelten die AGB von {Studio}. Hinweise zum Datenschutz.“ (Pop-up wie bisher). Registrierung: Datenschutz-Link. |
| L8 | Impressum/Datenschutz erscheinen immer, sobald die Anbieterangaben vollständig sind — auch ohne Online-Zahlung (Impressumspflicht besteht für jede geschäftliche Website). Fehlen Angaben: Owner sieht „Braucht deine Aufmerksamkeit: Impressum unvollständig“; öffentlich zeigt die Seite nur Studio-Name + Kontakt-E-Mail und keinen Platzhaltertext. |
| L9 | Sperre: Neuer Grund `STUDIO_LEGAL_TEXTS_MISSING` — Online-Zahlung (Kurse und Karten) erst, wenn Impressum vollständig und AGB + Datenschutz freigegeben. Zusätzlich zu den bestehenden Gründen, gleiche Anzeige („Online ist noch nicht bereit: …“ mit Sprung). Bestehende Online-Studios auf DEV: Grund greift sofort (gewollt, Klicktest). |
| L10 | Keine OS-Plattform-Verlinkung (EU-Streitschlichtungsplattform ist seit 20.07.2025 abgeschaltet). Stattdessen VSBG-Satz in AGB/Impressum. |
| L11 | Nur Owner/Admin pflegen und geben frei; Lehrende sehen nichts davon. RLS: Lesen der aktuellen Fassungen öffentlich je Tenant (nur Art + Markdown + Datum), alles andere nur Owner/Admin des Tenants. |
| L12 | Spät-Abmeldung Vor Ort: Software behält `cancelled` (keine offene Forderung in Kasse/Übersicht). AGB 6.2 sagt „dürfen wir weiterhin verlangen“ (Recht des Studios, keine Aussage, dass Omlify die Forderung führt). Abmelde-Dialog zeigt vor der Bestätigung einen Hinweis mit Frist und Preis (analog R3 Online). Forderungsmanagement später nur bei Bedarf als eigene Story. |

Bewusst nicht in RT-1: Omlifys eigene Nutzungsbedingungen (B2B) und Datenschutz/Impressum für omlify.de → RT-2, nachdem Teil 0 zeigt, was davon existiert.
