Story RT-1 — Rechtstexte der Studios (Impressum, AGB, Datenschutz) + Sperre

Für Cursor (autonomer Ablauf). Stand: 05.10.2026. K1 abgeschlossen (Klicktest K1-2: 3/3 ok). Als docs/stories/rt1_studio_rechtstexte.md ablegen; Entscheidung 17 als [docs/entscheidungen/17_Studio_Rechtstexte.md](../entscheidungen/17_Studio_Rechtstexte.md) (eigener Doku-Commit). Vorlagen-Texte in `docs/legal/studio/vorlagen_v1_quelle.md`; nach Freigabe Wortlaut unverändert aufteilen in `impressum.v1.md` / `agb.v1.md` / `datenschutz.v1.md`. Rechtliche Einordnung von Claude, nicht anwaltlich geprüft. check:ci vor jedem Push. Logik-/Gestaltungs-Commits getrennt. E2E nur in e2eapp.

Teil 0 zuerst (nur lesen, Bericht, STOPP → Haltestelle 1)
Bestand Rechtstexte: Was liegt in docs/legal/ (AVV, Widerrufsbelehrung/Muster-Formular aus K1, Nutzungsbedingungen/Datenschutz/Impressum von Omlify selbst)? Wo werden sie gerendert (legal/*.html, src/generated/legalDocuments.ts), wo angezeigt? Gibt es heute auf Studio-Subdomains irgendeinen Footer mit Impressum/Datenschutz?
Anbieterangaben: Felder von tenant_legal_profiles; ist tax_id Steuernummer oder USt-IdNr.? Wo gepflegt, wo verwendet (Belege)?
Platzhalter-Quellen: Woher kommen heute Stornofrist (tenants.cancellation_window_hours / cancellation_deadline), Steuerstatus (§ 19 / Regelbesteuerung, Satz), Zahlungswege (Entscheidung 14), Nachrück-Frist (S2: 12 h / Kursbeginn − 2 h), Kartenregeln (Gültigkeit je Produkt, Verfall, Verlängerung)? Je Wert: Tabelle/Funktion. Und: Was passiert heute technisch bei Abmeldung nach der Frist mit Karte (Termin weg oder zurück?) und bei Vor-Ort-Buchung? Die AGB-Vorlage (Ziffer 6.2) sagt „Termin gilt als genutzt“ — weicht die Software ab → Haltestelle.
Datenschutz-Fakten (für die Vorlage): (a) Speichert die App irgendetwas außer technisch notwendigem (Analytics, Tracking, Schriften von Fremdservern, Sentry o. ä.) auf Studio-Subdomains? (b) Gibt es Freitextfelder bei Buchung/Profil, in denen Gesundheitsangaben landen können (Notiz, „Beschwerden“)? (c) Werden andere als Transaktions-Mails verschickt (Newsletter, Erinnerungen, Marketing)? (d) Welche Daten erhebt die Registrierung (Pflicht/optional)? (e) Liste der Unterauftragsverarbeiter, wie in AVV-Anlage — gibt es eine maschinenlesbare Quelle?
Mail-Anhänge: Kann send-email (Resend via SMTP) Anhänge (PDF) mitschicken? Größenlimit? Gibt es schon PDF-Erzeugung (Belege)? Womit?
Buchungs-/Kauf-Pfade: Alle Stellen mit „Zahlungspflichtig buchen/kaufen“ (Kurs online, Kurs vor Ort, Karte, Nachrücken-Zahlung, Spätzahlung) und Registrierung — wo stehen heute AGB-/Datenschutz-Hinweise?
Online-Bereitschaft: Wo werden heute die Sperrgründe (LEGAL_PROFILE_MISSING, AVV_MISSING, …) berechnet und angezeigt? Bericht mit Datei:Zeile → STOPP.

Entscheidung 17: [docs/entscheidungen/17_Studio_Rechtstexte.md](../entscheidungen/17_Studio_Rechtstexte.md) (L1–L11).

Umfang
A — Einstellungen › Rechtliches (Owner/Admin)

Ein Bereich mit drei Karten, je Status-Pille (Fehlt / Freigeben / Aktuell · Fassung vom 5. Okt 2026 / Neue Vorlage verfügbar):

Impressum — Formular: bestehende Anbieterangaben + neu: Rechtsform (Auswahl: Einzelunternehmen, GbR, UG, GmbH, e. V., Sonstige), Vertretungsberechtigte (Pflicht außer Einzelunternehmen), Register + Nummer (optional, Pflicht bei UG/GmbH/e. V.), USt-IdNr. (optional), Wirtschafts-ID (optional), Telefon (optional, empfohlen). Hinweis unter Anschrift: „Es muss eine ladungsfähige Anschrift sein — kein Postfach.“ Vorschau rechts (Desktop) bzw. darunter (mobil).
AGB — Vorschau der gerenderten AGB mit hervorgehobenen Werten aus Einstellungen (dezent markiert, Tooltip „aus Einstellungen › Buchungen“ mit Sprung). Freifeld „Weitere Regeln“. Knopf „Prüfen und freigeben“ → Dialog mit Volltext (scrollbar), Häkchen „Ich habe die AGB geprüft und verwende sie als meine eigenen.“, Knopf „Freigeben“.
Datenschutz — wie AGB, ohne Freifeld.
Freigabe schreibt legal_acceptances (gleiches Muster wie AVV, Dokument studio_terms_tpl/studio_privacy_tpl, Hash der Vorlage) und eine neue Fassung in studio_legal_documents.
B — Rendern
Eine Funktion (Server, nicht Browser) render_studio_legal(tenant, kind) → Markdown + Werte-JSON + Hash. Platzhalter-Syntax {{name}} und Bedingungsblöcke {{#if online}}…{{/if}} (Liste in den Vorlagen). Unbekannter Platzhalter → Fehler im Test, nie leerer Text.
Trigger/Hook: Änderung an Stornofrist, Steuerstatus, Zahlungswegen, Kartenprodukten (online kaufbar / Gültigkeit), Anbieterangaben → neue Fassung nur wenn sich der Hash ändert.
Unit-Tests: jede Bedingungs-Kombination (§ 19 / Regelbesteuerung × online/vor Ort/beide × Karten ja/nein) rendert ohne Platzhalter-Reste; Snapshot-Tests.
C — Öffentliche Seiten + Fuß
/impressum, /datenschutz, /agb, /widerruf je Subdomain, gleiches Layout wie Rechtstexte-Pop-up, Stand-Datum oben, Druckansicht sauber.
Fuß auf allen Studio-Seiten (auch Login), 360 px: Links umbrechen sauber, Abstand zur Buchungsleiste.
D — Buchen/Kaufen
Hinweiszeile (L7) in allen Pfaden aus Teil 0 Punkt 6.
Fassungs-ID an Buchung/Attempt/Karte speichern (Spalte, nicht JSON). Migration: Bestehende Buchungen bleiben NULL.
E — Bestätigungs-Mails mit PDF
PDF je Fassung (Schrift wie Mails, Kopf mit Studio-Name, Stand-Datum, Seitenzahlen). Kurs- und Karten-Bestätigung hängen „AGB_{Studio}_{Datum}.pdf“ an. Bei Karte zusätzlich wie bisher Widerrufsbelehrung + Muster-Formular im Mailtext.
Ist Anhang technisch nicht möglich (Teil 0 Punkt 5) → Haltestelle mit Vorschlag, nicht selbst umbauen.
F — Sperre + Hinweise
STUDIO_LEGAL_TEXTS_MISSING in derselben Funktion wie die anderen Gründe; Einstellungen › Zahlungen zeigt ihn mit Sprung nach Rechtliches.
„Braucht deine Aufmerksamkeit“: Impressum unvollständig · AGB nicht freigegeben · Datenschutz nicht freigegeben · Neue Vorlage verfügbar.
Überwachung: Online-Zahlung eingeschaltet, aber Sperrgrund aktiv → kein Alarm (ist Anzeige), aber Zahlung trotz Sperre → ops_alert (Absicherung, sollte nie passieren).
G — Demodaten
demoalpha: Rechtsform Einzelunternehmen, Impressum vollständig, AGB + Datenschutz nicht freigegeben (Julius testet die Freigabe). demobeta: alles freigegeben. e2eapp per Testskript.
Akzeptanz
SQL/RPC: Fassungen append-only (UPDATE/DELETE verboten), Hash ändert sich nur bei echter Änderung, öffentliche Leserechte nur aktuelle Fassung, kein Fremd-Tenant, Sperre greift für Kurs und Karte, Buchung speichert Fassungs-ID.
Unit: Render-Matrix (B), keine Platzhalter-Reste, Freitext wird escaped (kein HTML/Markdown-Link-Injection).
E2E (e2eapp): (1) Owner gibt AGB + Datenschutz frei → Online-Zahlung wird bereit; (2) Stornofrist ändern → neue Fassung, AGB-Seite zeigt neuen Wert, alte Buchung zeigt weiter alte Fassung; (3) Buchung online → Mail mit PDF (Mail-Log: Anhang vorhanden); (4) Fuß-Links öffentlich ohne Login.
Screenshots 360/1280: Einstellungen › Rechtliches (alle Status), Freigabe-Dialog, AGB-Seite, Fuß, Hinweiszeile im Checkout.
check:ci grün. Haltestelle 5, Klickliste max. 10 Punkte (mit Konto je Punkt).
