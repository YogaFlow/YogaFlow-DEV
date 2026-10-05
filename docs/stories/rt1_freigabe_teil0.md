RT-1 — Freigabe nach Teil 0 (Claude, 05.10.2026)

Für Cursor. Grundlage: Bericht docs/berichte/rt1_studio_rechtstexte.md (7c19a87). Teil 0 freigegeben mit den Antworten unten. Danach Vorlagen wörtlich aufteilen (impressum.v1.md, agb.v1.md, datenschutz.v1.md) und Umfang A–G umsetzen. check:ci vor jedem Push, E2E nur in e2eapp, am Ende Haltestelle 5.

Antworten auf die Befunde
#	Befund	Entscheidung
F1	Checkout zeigt heute Omlify-AGB/-Datenschutz	Fachlich falsch: Vertragspartner der Teilnehmenden ist das Studio, nicht Omlify. In allen Buchungs-/Kaufpfaden (Teil 0 Punkt 6) die Omlify-Links durch die Studio-Texte ersetzen (L7). Omlify-eigene Texte bleiben nur dort, wo Omlify Vertragspartner ist (Studio-Registrierung/Owner, omlify.de) → RT-2. Gibt das Studio noch keine AGB frei: bei Vor-Ort-Buchung keinen AGB-Link zeigen (lieber keiner als ein falscher), Datenschutz-Link auf die Studio-Seite (L8). Online ist dann ohnehin gesperrt (L9).
F2	AGB 6.2 = Software	Bestätigt, Vorlage bleibt.
F3	Anhänge gehen, PDF-Erzeugung fehlt	PDF in einer Edge Function mit pdf-lib (reines JS, läuft in Deno). Schrift als Datei im Repo einbetten (z. B. Noto Sans, mit Umlauten/€), kein Nachladen zur Laufzeit. Erzeugt wird asynchron über die bestehende Outbox (neuer Auftragstyp legal_pdf.render, ausgelöst durch neue Fassung), Ablage privat legal/{tenant}/{fassung}.pdf. dispatch-emails: Ist das PDF der Fassung noch nicht da, bis zu 10 min erneut versuchen, danach Mail mit Link statt Anhang + ops_alert (L6). Kein Puppeteer/Headless-Browser, kein externer PDF-Dienst (Datenschutz + Kosten).
F4	health_notes	Weglassen (kein Freitextfeld gefunden). Block aus datenschutz.v1.md entfernen ist die einzige erlaubte Wortlaut-Änderung.
Vor Umfang A im Bericht nachtragen (falls noch nicht enthalten)

Je ein Satz mit Datei:Zeile. Weicht etwas ab → Haltestelle statt Weiterbauen.

tax_id = Steuernummer oder USt-IdNr.? → Impressum zeigt nur USt-IdNr./W-IdNr.; eine Steuernummer gehört nicht ins Impressum (neues Feld vat_id, falls nötig).
Analytics, Tracking, Fremd-Schriften, Fehler-Dienste auf Studio-Subdomains: keine? (Vorlage Ziffer 4 sagt „keine Analyse- oder Werbe-Cookies“.)
Abmeldung vor Ort nach Frist: Software tut nichts → passt zu „bleibt geschuldet“ (Studio entscheidet). Bestätigen.
Quelle der Unterauftragsverarbeiter-Liste (AVV-Anlage): maschinenlesbar oder neu anlegen (docs/legal/subprocessors.json, AVV und Datenschutz lesen daraus).
Gibt es Omlify-eigene Nutzungsbedingungen/Datenschutz/Impressum im Repo (für RT-2)? Pfade.
Unverändert

L1–L11 aus Entscheidung 17. Demodaten nach G.