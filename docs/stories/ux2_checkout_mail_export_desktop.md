Story UX-2 — Checkout, Mails, Export, Desktop, Pop-ups

Für Cursor (autonomer Ablauf). Stand: 04.10.2026. Voraussetzung: B1/B2 + Nachtrag B2 auf Julius. Als docs/stories/ux2_checkout_mail_export_desktop.md ablegen. Grundlage: Klicktest B1/B2 von Julius (04.10.), docs/DESIGNSYSTEM.md, Entscheidung 12. Zwei Teile, je eigener Bericht. Teil A zuerst (Fehler + Checkout), dann Teil B. Logik- und Gestaltungs-Commits getrennt. Harte Regel Desktop: Die mobile Ansicht (360 px) von Kursdetail und Kasse bleibt pixelgleich. Vorher Referenz-Screenshots mit Playwright toHaveScreenshot aufnehmen, nachher vergleichen; Abweichung = rot.

Teil A
A1 — Fehler aus dem Klicktest
AVV-Knopf „AVV abschließen“: Schrift ist schwarz statt weiß → Primärknopf-Stil aus dem Designsystem verwenden.
„Volltext öffnen“ führt auf die Übersicht „Rechtliche Angaben“ statt zur AVV → korrigieren (siehe A2).
Fehlermeldungen in Formularen einheitlich: Anbieterangaben zeigen „Bitte gib die Straße an“ ohne Farbe. Das Muster aus UX-1 (Erstatten-Feld: Fehlerrand, Icon, Text in Fehlerfarbe, aria-invalid, aria-describedby) als eine gemeinsame Feld-Komponente; alle Formulare mit Pflichtfeldern darauf umstellen (Inventur im Bericht: welche Formulare, alt → neu).
Prüfen, was der schwarze Kasten „stripe ›“ unten rechts im Checkout ist (Testmodus-Hinweis von Stripe?). Er darf keinen Text überdecken. Wenn er nur im Testmodus erscheint: im Bericht festhalten, sonst Platz dafür schaffen.
AVV-Text belegen: git diff von docs/legal/auftragsverarbeitung.md zwischen Stand 21.09. und heute vollständig in den Bericht (Claude prüft den Wortlaut; die DEV-Seite ist für Claude nicht abrufbar).
A2 — Rechtstexte als Pop-up statt Seitenwechsel
Links auf AVV, AGB, Datenschutz innerhalb der App (Einstellungen › Rechtliches, Onboarding-Häkchen, Checkout) öffnen ein Pop-up (mobil: Vollbild-Sheet, Desktop: Dialog max. 720 px) mit dem Text, Stand-Datum oben, Schließen-Knopf; Link „Als eigene Seite öffnen“ klein unten.
Eine Quelle: Pop-up und /legal/*-Seite werden aus derselben Datei (docs/legal/*.md) gebaut. Kein zweiter Text, keine Kopie. Ändert sich die Datei, ändern sich beide beim nächsten Build. Version und Hash für legal_acceptances kommen aus derselben Datei (Test: Hash der angezeigten Version = gespeicherter Hash).
Bei der AVV: „AVV abschließen“ auch direkt unten im Pop-up.
A3 — Hintergrund bei Pop-ups und Sheets

Für alle Pop-ups, Dialoge und Sheets (Checkout, Erstatten, Rechtstexte, Bestätigungen) eine gemeinsame Abdunklung:

Hintergrund 40 % abgedunkelt + leichte Unschärfe (backdrop-filter: blur(4px)), Ein-/Ausblenden 150 ms.
prefers-reduced-motion → ohne Animation; prefers-reduced-transparency oder kein backdrop-filter-Support → nur abdunkeln.
Tipp auf den Hintergrund schließt, außer während eine Zahlung läuft. Seite dahinter scrollt nicht mit. Fokus bleibt im Pop-up (Tastatur, Screenreader).
A4 — Checkout neu: ruhig, klar, rechtssicher

Problem (Screenshots 04.10.): Fünf Textblöcke stehen gleich laut übereinander, die Zusammenfassung scrollt weg, der Reservierungs-Hinweis ist ein ganzer Satz in Orange, „Land“ ist ein unnötiges Feld, und über dem Knopf steht beim Scrollen nur noch „Abmeldung nicht mehr möglich“.

Rechtsrahmen (nicht verhandelbar, aus Entscheidung 12): Direkt über dem Knopf müssen stehen: was gekauft wird (Kurs, Termin) und der Gesamtpreis inkl. Steuerangabe (§ 312j Abs. 2 BGB). Knopf heißt exakt „Zahlungspflichtig buchen“. Anbieter, Abmelderegel, Widerrufshinweis, AGB/Datenschutz müssen im Sheet sichtbar sein, dürfen aber klein und gebündelt sein. Apple/Google Pay bleiben im Payment Element (dann löst unser Knopf aus; ein eigener „Mit Apple Pay buchen“-Knopf wäre rechtlich unsicher).

Neuer Aufbau (mobil, Sheet von unten):

┌──────────────────────────────────────┐
│ Buchung abschließen              ✕   │  Kopf
│ ◷ Platz reserviert bis 14:28         │  kleine Pille, neutral; < 3 min → Warnfarbe
├──────────────────────────────────────┤
│ Test Kurs V8                 12,00 € │  Zusammenfassung: 1 Zeile fett,
│ Mo, 5. Okt · 13:00–14:00 · Neuss     │  1 Zeile grau (Lehrende im Detail)
│ ─────────────────────────────────── │
│ [ Payment Element: Karte | Apple Pay ]│  Felder; „Land“ ausblenden
│                                      │
├──────── fester Fußbereich ───────────┤
│ Gesamt                       12,00 € │  fett
│ gemäß § 19 UStG ohne USt             │  klein grau
│ [      Zahlungspflichtig buchen     ]│  Primärknopf
│ Keine Erstattung bei Abmeldung (Frist│  klein grau, max. 3 Zeilen,
│ vorbei) · Kein Widerrufsrecht bei    │  Abmeldetext dynamisch:
│ festem Termin · Anbieter: Yoga Test, │  vor Frist „Kostenlos abmelden bis Fr 18:00“
│ Berlin · AGB · Datenschutz           │  Links öffnen Pop-ups (A2)
│ 🔒 Sicher bezahlt über Stripe        │
└──────────────────────────────────────┘
Der feste Fußbereich zeigt Gesamtpreis + Knopf immer, auch beim Scrollen.
„Land“: Payment Element mit fields.billingDetails.address so konfigurieren, dass kein Land-Feld erscheint (zuerst if_required testen; reicht das nicht, never und beim Bestätigen country: 'DE' mitgeben). Testkarten DE und US (4242…) müssen weiter durchgehen; Ergebnis im Bericht.
Kartenfelder: Stripe-appearance an Omlify anpassen (Schrift, Radius, Rahmenfarbe, Fehlerfarbe = Designsystem).
Fehler beim Bezahlen: Hinweis direkt über dem Knopf (role="alert"), Eingaben bleiben stehen.
Desktop: zentrierter Dialog 480 px, gleicher Aufbau.
„Anbieterangaben“ öffnet ein kleines Pop-up mit voller Anschrift + Kontakt.

Akzeptanz A: Unit-Tests der Texte (vor/nach Frist, § 19 / 19 % / 7 %), E2E: Checkout zeigt Kurs + Gesamt + Knopf im festen Fußbereich bei 360 × 640 ohne Scrollen; Bezahlen mit 4242 klappt; Pop-up AGB/AVV öffnet und schließt; Abdunklung vorhanden; AVV-Hash-Test. Screenshots 360/1280 → docs/screenshots/ux2/.

Teil B
B1 — Mails: ruhig, hochwertig, eine Vorlage für alle

Gilt für Buchungsbestätigung, Erstattung, Nachrücken, Überwachung (eine gemeinsame Vorlage, nur Inhalt wechselt).

Aufbau Buchungsbestätigung:

Vorschauzeile (Preheader): „Mo, 5. Okt, 13:00 · Test Kurs V8 · Neuss“.
Kopf: Studio-Logo, sonst Studioname; Akzentfarbe = Markenfarbe des Studios (Kontrast prüfen, sonst Omlify-Grün).
Große Überschrift: „Du bist dabei“, darunter eine Zeile: „Deine Buchung bei Demo Alpha ist bestätigt.“
Terminkarte: links Datumsblock (große Zahl „5“, darunter „OKT“), rechts Kurs fett, Uhrzeit, Ort (als Karten-Link), Lehrende.
Zwei Knöpfe: „In Kalender eintragen“ (Primär; .ics-Anhang + Link) und „Buchung ansehen“ (Sekundär, als Text-Link).
Kasten Bezahlt: „12,00 € · Karte · 05.10.2026“ und „Beleg 2026-00135 ansehen →“. Steuersatz-Zeile klein.
Eine Zeile Abmelderegel mit konkreter Frist.
Fußbereich klein und grau (alle Pflichtangaben aus K6): Anbieter mit Anschrift + Kontakt, Hinweis zum Widerrufsrecht, AGB (Volltext kommt mit Block 2 — als PDF-Anhang vorsehen, nicht als Textwand in der Mail), „Gesendet über Omlify im Auftrag von …“.

Technik: eine Spalte, max. 560 px, Tabellen-Layout für Outlook, System-Schriften, keine Bilder für Text, Dark Mode lesbar (in Apple Mail und Gmail prüfen), Text-Version (multipart) mit gleichem Inhalt, Alt-Texte. send-email um Anhänge erweitern (ICS; später PDF). ICS mit UID = Buchungs-ID, Zeitzone Europe/Berlin, bei Absage/Abmeldung später METHOD:CANCEL (nur vorsehen).

Akzeptanz B1: Snapshot-Tests je Mail-Art (HTML + Text), ICS validiert (Datum/Uhrzeit Europe/Berlin), Test-Mail an DEV-Postfach; Screenshots aus Gmail Web + iPhone Mail (hell/dunkel) in den Bericht.

B2 — Export gehört zu „Zahlungen“
In Zahlungen rechts oben neben den Filtern ein unauffälliger Text-Knopf „Exportieren“ mit Download-Icon (Sekundär-Stil, kein großer Knopf). Mobil im „⋯“-Menü der Seite.
Öffnet ein Sheet: Zeitraum (vorbelegt mit dem aktiven Monatsfilter) und Auswahl:
„Zahlungsliste (CSV)“ — genau die aktuell gefilterten Zahlungen inkl. Belegnummer, Status, Erstattungen;
„Für die Steuerberatung (CSV)“ — Hauptbuch-Summen + Buchungen (heutiger Export aus Einstellungen).
In Einstellungen › Zahlungen bleibt nur der Steuerstatus; dort ein Satz „Exporte findest du unter Zahlungen“ mit Link.
Nur Owner/Admin. Dateiname omlify-<studio>-zahlungen-2026-10.csv; CSV mit ;, UTF-8 mit BOM (öffnet in deutschem Excel korrekt).
B3 — Desktop: Kursdetail und Kasse

Nur ab 1024 px, mobil unverändert (Regel oben).

Kursdetail: zweispaltig, Inhalt max. 1120 px. Links (≈ 2/3): Titel, Datum/Zeit, Beschreibung, Ort, Lehrende. Rechts (≈ 1/3) eine feste Buchungskarte (bleibt beim Scrollen sichtbar): Preis, freie Plätze, Abmeldefrist, Knopf „Weiter zur Buchung“ bzw. Status der eigenen Buchung. Vorbild: Buchungskarte bei Airbnb/Eventbrite.
Kasse: Teilnehmerliste als Tabelle mit festen Spalten (Name · Zahlung · Karte · Aktion), Aktionen rechtsbündig, Kopfzeile mit Summe der Anwesenden (keine Euro-Summen, E14). Max. 1120 px.

Akzeptanz B2/B3: E2E Export (Datei hat Kopfzeile + richtige Anzahl Zeilen bei Filter „online“); Screenshot-Vergleich mobil = Referenz; Screenshots 1280/1440.

Haltestellen
Haltestelle 1, wenn ein Rechtstext-Inhalt geändert werden müsste (nur Darstellung ist erlaubt).
Am Ende Haltestelle 5: gemeinsame Klickliste A+B (max. 12 Punkte).