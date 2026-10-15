Story UX-7 — Kartenhinweis abschaltbar, Demo-Studio v3

Für Cursor (autonomer Ablauf). Stand: 06.10.2026, HEAD 4ddcd60. Als docs/stories/ux7_kartenhinweis_demo_v3.md ablegen. check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp, Haltestelle 5 mit Klickliste (max. 10, Konto je Punkt).

A — Kartenhinweis im Kursdetail: standardmäßig aus, Text anpassbar

Heute: „Mit der 5er-Karte zahlst du 13,00 € statt 18,00 € ›“ erscheint immer (K1 Teil F). Neu:

Einstellungen › Studio, Abschnitt „Hinweis auf Karten im Kurs“: Schalter (Standard aus, auch für bestehende Studios — Migration setzt alle auf aus) + Textfeld.
Text mit Platzhaltern, damit Preise immer stimmen (Studio tippt keine Beträge): {karte} = Name des Produkts · {preis_karte} = Preis pro Termin mit Karte · {preis_einzel} = Einzelpreis des Kurses · {ersparnis} = Differenz je Termin. Vorbelegung: Mit der {karte} zahlst du {preis_karte} statt {preis_einzel}.
Max. 120 Zeichen; Platzhalter als antippbare Chips unter dem Feld einfügbar; Live-Vorschau mit einem echten Kurs + Produkt des Studios; unbekannte Platzhalter → Fehlermeldung, nicht speichern. Freitext wird escaped.
Leeres Feld = Vorbelegung. Knopf „Standardtext wiederherstellen“.
Anzeige-Regeln bleiben wie K1 F (Kurs pass_eligible, Produkt online kaufbar, Person ohne aktive passende Karte), zusätzlich: Schalter an. Bei mehreren Produkten das mit dem niedrigsten Preis pro Termin.
Speicherung serverseitig am Tenant (pass_hint_enabled boolean not null default false, pass_hint_template text null), Schreiben nur Owner/Admin. Rendern an einer Stelle (Unit-Test mit allen Platzhaltern).
Kein Einfluss auf AGB-Fassungen (Hinweis ist Werbung, kein Vertragsinhalt).
B — Buchungsleiste: Frist nicht mitten im Datum umbrechen

Screenshot 06.10.: „Kostenlos abmelden bis Di, 6. / Okt, 18:30“. Datumsteil Di, 6. Okt, 18:30 als nicht umbrechende Einheit; passt es nicht, bricht vor „bis“ um. 360 und 390 px prüfen.

C — Demo-Studio demoalpha v3: alles einmal sichtbar

Bleibt unverändert: Owner-Konto, Studio-Design, Anbieterangaben/Impressum, freigegebene Rechtstexte + Fassungen, AVV-Zustimmungen, Zahlungs-/Steuereinstellungen, Stripe-Anbindung, Kartenprodukte (5er 65 €, 10er 120 €). Aufräumen mit dem bestehenden npm run dev:demo:reset -- demoalpha (DEV-Guard, --dry-run zuerst, Ausgabe in den Bericht). Regel wie UX-5: alles mit Zahlung/Beleg/Hauptbuch/Zustimmung wird archiviert, nicht gelöscht. Keine eigene Haltestelle nötig, solange Trockenlauf = tatsächliche Änderung und nur demoalpha betroffen ist; sonst STOPP. Seed v3 (ein Skript scripts/dev/demo_v3.mjs, wiederholbar, ersetzt demo_ux6.mjs; Zahlungen nur über bestehende Testskripte/RPCs, Stripe-Testmodus 4242):

Fall	Daten	Zeigt
Heute, Kurs läuft in ~2 h	„Hatha am Nachmittag“ 18 €: Vera (vor Ort), Karla (vor Ort, hat Karte → „Mit Karte“), Olaf (online bezahlt)	Teilnehmerliste, „Zahlt vor Ort“, Bar erhalten
Gestern	„Yin Yoga“ 16 €: Nina offen, Olaf bar, eine Person erlassen	Überfällig, Erlassen
Morgen, voll	„Vinyasa Flow“ 8/8 belegt + Warteliste 2 (eine nachgerückt mit Online-Frist, pending_payment)	Warteliste, Nachrücken, „Zahlung läuft“
Nächste Woche	„Yoga für den Rücken“ (mit Karte buchbar), „Workshop Atem & Entspannung“ 35 € (ohne Karte), „Pilates“	Kurse ohne Buchung, Kartenregel
Abgesagt	ein Kurs mit online bezahlter Buchung → automatisch erstattet	Absage + Erstattung
Karten	Karla 10er noch 6 (Verlauf mit Verlängerung); Wiebke Widerruf: 5er online gekauft heute (Widerrufsfrist läuft, „Vertrag widerrufen“ sichtbar)	Meine Karten, Widerruf
Erstattung	Olaf: eine Teilerstattung (5 € von 18 €)	Zahlungen, Erstattungsbeleg
Spät abgemeldet	Vera bei einem Kurs nach Frist abgemeldet (vor Ort)	L12-Hinweis in der Historie
Neu	Nina hat noch nie online bezahlt	„Neu“-Hinweis Online
Personen mit Testadressen juliusbne+<name>@gmail.com, Zugangsdaten nur in supabase/.env.dev; im Bericht nur Namen + Rolle.
2 Lehrende (eine davon unterrichtet „Hatha am Nachmittag“ → Lehrende-Sicht testbar).
Kartenhinweis (A) in demoalpha aus (Standard); Julius schaltet ihn im Klicktest selbst an.
Bericht: Tabelle „Fall → Konto → wo in der App sichtbar“ (das ist Julius' Klickführer).
Akzeptanz
Unit: Platzhalter-Rendering (alle vier, unbekannt → Fehler, Escaping), Hinweis aus = nicht gerendert.
SQL: Tenant-Spalten nur von Owner/Admin schreibbar; Migration setzt bestehende Tenants auf aus.
E2E (e2eapp): Hinweis an + eigener Text → Kursdetail zeigt gerenderten Text; aus → nichts.
Reset: zweiter Lauf von Reset + Seed ändert nichts (idempotent).