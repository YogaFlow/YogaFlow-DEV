Story RT-2 — Omlifys eigene Rechtstexte auf Stand Online-Zahlung (v2)

Für Cursor (autonomer Ablauf). Stand: 08.10.2026, nach Nachtrag F. Als docs/stories/rt2_omlify_rechtstexte_v2.md ablegen. Rechtliche Einordnung von Claude, nicht anwaltlich geprüft. check:ci vor jedem Push, E2E nur in e2eapp, vor Haltestelle 5 Workers-Build + Live-Bundle prüfen.

Ausgangslage

Seit 21.09.2026 sind Impressum, Datenschutzerklärung, AGB (B2B) und AVV von Omlify auf omlify.de live (docs/legal/*.md → scripts/render-legal-pages.mjs → /legal/*). Der AVV ist bereits auf v2 (Zahlungen) mit versionierter Zustimmung (legal_document_versions, legal_acceptances, Banner). AGB und Datenschutz stammen aus der Zeit vor Online-Zahlung, Belegen, Kurskarten und Studio-Rechtstexten und sind teilweise überholt (z. B. AGB § 5 Abs. 3: „ein Feld für studio-eigene Rechtsangaben existiert nicht“).

Teil 0 (nur lesen, Bericht, STOPP → Claude prüft)
Volltext der aktuellen docs/legal/agb.md, datenschutz.md, impressum.md in den Bericht kopieren (Claude hat keinen Repo-Zugriff), mit Abschnittsnummern.
Wie wird die Omlify-AGB heute angenommen (Onboarding-Checkbox, Zeitstempel, gespeichert wo)? Gibt es eine Versionierung wie beim AVV?
Enthält das Impressum noch einen Link zur EU-Streitschlichtungsplattform (seit 20.07.2025 abgeschaltet)?
Welche Daten erhält Omlify von Stripe zum verbundenen Konto (Felder in provider_accounts o. ä.)? Werden Bankdaten/Ausweisdaten gespeichert? (Erwartung: nein.)
Welche Protokolle/Nachweise speichert Omlify selbst: legal_acceptances, ops_alerts, provider_events_raw, audit_log, Mail-Protokolle — je Aufbewahrung, falls definiert. → STOPP. Claude liefert danach den endgültigen Wortlaut der geänderten Abschnitte (Delta wie beim AVV v2), Cursor baut ein.
Inhaltliche Änderungen (Claude formuliert nach Teil 0 wörtlich)
AGB Omlify ↔ Studio (v2)
#	Neuer/geänderter Abschnitt	Kern
A1	Online-Zahlungen	Studio schließt eigenen Vertrag mit Stripe; Zahlungen gehen direkt auf das Stripe-Konto des Studios; Omlify ist nicht Zahlungsdienstleister, hält kein Geld. Stripe-Gebühren trägt das Studio. Omlify nimmt derzeit keine eigenen Gebühren; Einführung nur mit 6 Wochen Ankündigung in Textform, nie rückwirkend.
A2	Beauftragung automatischer Erstattungen	Studio beauftragt Omlify, in den in der App beschriebenen Fällen Erstattungen über sein Stripe-Konto auszulösen (Kursabsage, Abmeldung in der Frist, Abmeldung/Entfernen durch das Studio, Widerruf von Kurskarten, Zahlung nach Platzverlust).
A3	Studio ist Anbieter gegenüber Teilnehmenden	Preise, Steuerstatus (§ 19 oder Regelbesteuerung), Angaben auf Belegen, Erfüllung von Widerrufen, Umgang mit Rückbuchungen liegen beim Studio.
A4	Belege und Hauptbuch	Technische Hilfe, keine Steuer- oder Rechtsberatung; Hauptbuch und Exporte sind vorbereitende Buchhaltung. Studio bewahrt Belege nach seinen Pflichten selbst auf (Export).
A5	Rechtstexte für Teilnehmende (ersetzt alten § 5 Abs. 3)	Omlify stellt Vorlagen; Studio prüft und gibt sie als eigene frei; keine Rechtsberatung; Studio verantwortet Impressum-Angaben und „Weitere Regeln“. Neue Vorlagen werden angekündigt; bis zur Freigabe gilt die bisherige Fassung.
A6	Sperre von Online-Zahlung	Omlify darf Online-Zahlung für ein Studio aussetzen bei begründetem Verdacht auf Missbrauch, Rechtsverstoß oder auf Verlangen von Stripe; Studio wird unverzüglich informiert.
A7	Vertragsende	30 Tage Export (Zahlungen, Belege, Teilnehmende) nach Kündigung; danach Löschung nach AVV, soweit keine eigene gesetzliche Aufbewahrungspflicht von Omlify besteht.
A8	Mitwirkung Plattformen-Steuertransparenzgesetz	Studio stellt Angaben bereit, soweit Omlify zu Meldungen nach dem PStTG (DAC7) verpflichtet ist. (Ob Omlify meldepflichtig ist, wird vor breitem Rollout geprüft.)
A9	Änderungen der AGB	Ankündigung mindestens 6 Wochen vorher per E-Mail und in der App; Studio stimmt zu (Banner) oder kündigt; ohne Zustimmung gilt die alte Fassung bis Vertragsende — kein Zustimmungs-Automatismus.
A10	Haftung Verfügbarkeit Zahlungen	Keine Haftung für Ausfälle bei Stripe, Banken oder Wallet-Anbietern; bestehende Haftungsklausel bleibt.
Datenschutzerklärung Omlify (v2)
#	Abschnitt	Kern
D1	Stripe-Anbindung der Studios	Stripe erhebt Identitäts-/Bankdaten des Studios als eigener Verantwortlicher; Omlify erhält nur Kontostatus/Kennung (nach Teil 0 Punkt 4 genau benennen), Rechtsgrundlage Art. 6 Abs. 1 lit. b.
D2	Zahlungen der Teilnehmenden	Omlify verarbeitet sie im Auftrag des Studios (AVV); maßgeblich ist die Datenschutzerklärung des Studios; Verweis.
D3	Nachweise von Zustimmungen	AVV, AGB, Freigaben der Studio-Rechtstexte: wer, wann, welche Fassung (Hash). Art. 6 Abs. 1 lit. c/f; Speicherdauer Vertragsdauer + 3 Jahre.
D4	Betriebsüberwachung	Fehler-/Alarm-Protokolle zur Sicherheit des Zahlungsbetriebs, ohne Kartendaten; Speicherdauer nach Teil 0 Punkt 5.
D5	Unterauftragsverarbeiter	Liste aus docs/legal/subprocessors.json (eine Quelle mit AVV); Stripe ausdrücklich nicht als Auftragsverarbeiter, sondern eigener Verantwortlicher.
Impressum Omlify
Kein OS-Plattform-Link (falls vorhanden, entfernen). VSBG-Satz.
USt-IdNr.: nur eintragen, wenn vorhanden (Angabe von Julius ausstehend); Steuernummer nicht ins Impressum.
Umsetzung (nach Claude-Wortlaut)
agb.md und datenschutz.md als neue Versionen führen (v2-Dateien; alte bleiben unverändert im Repo, Regel aus Nachtrag F). Stand-Datum oben.
AGB-Zustimmung versioniert wie AVV: legal_document_versions Dokument agb, Hash über normalisiertes Markdown.
Ein gemeinsames Banner für Owner: „Aktualisierte Vertragsunterlagen: AGB (v2) · AVV (v2)“ — beide Texte als Pop-up, je ein Häkchen, ein Knopf „Zustimmen“, je eine legal_acceptances-Zeile. Bereits zugestimmte Dokumente erscheinen nicht.
Ohne Zustimmung: keine Sperre des Bestands (A9); nur Banner + „Braucht deine Aufmerksamkeit“. Ausnahme bleibt die bestehende AVV-Regel für Online-Zahlung (AVV_MISSING).
Neue Studios: Onboarding-Checkbox nennt AGB v2, Datenschutz, AVV (einzeln verlinkt) und speichert die drei Fassungen.
Akzeptanz
E2E (e2eapp): Owner mit alter AGB-Zustimmung sieht Banner → stimmt zu → Banner weg, zwei Acceptance-Zeilen; neues Studio im Onboarding speichert alle drei Fassungen.
/legal/agb, /legal/datenschutz, /legal/impressum auf omlify-dev zeigen v2 mit Stand-Datum; keine OS-Plattform.
Haltestelle 5 mit Diff der Rechtstexte (alt → neu) im Bericht.