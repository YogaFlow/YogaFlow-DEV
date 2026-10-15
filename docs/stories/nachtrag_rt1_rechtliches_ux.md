Nachtrag RT-1-2 — Rechtliches übersichtlich, Rechtstexte ohne Web-Fuß

Für Cursor. Stand: 05.10.2026, HEAD 790e82f. Klicktest-Feedback Julius zu RT-1. Vor UX-6. Gestaltung, keine Änderung an L1–L12 (Vorlage + Werte bleibt). check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, Haltestelle 5 mit Klickliste (max. 8).

Befunde
Nach der Freigabe wirkt Rechtliches „gesperrt“: Der Owner versteht nicht, wie er AGB/Datenschutz noch ändert.
Mobil ist die Seite überladen (drei lange Blöcke mit Vorschau untereinander).
Der Fuß „Impressum · Datenschutz · AGB“ im App-Bereich wirkt wie eine Website und stört das App-Gefühl.
A — Ändern bleibt jederzeit möglich (und wird erklärt)
Freigeben sperrt nichts. Jederzeit änderbar: Impressum-Angaben, Feld „Weitere Regeln“, alle Einstellungen, aus denen die Texte entstehen. Jede Änderung erzeugt eine neue Fassung (wie gebaut, nur bei Hash-Änderung). Ist „Weitere Regeln“ heute nach Freigabe gesperrt → Fehler, beheben.
Ein Freitext-Editor für den ganzen AGB-Text kommt nicht (L2). Stattdessen erklärt die Seite, woher der Inhalt kommt (Abschnitt B).
Neue Freigabe nötig nur bei neuer Omlify-Vorlage (L3) oder wenn „Weitere Regeln“ geändert wurden (das ist eigener Text des Studios). Dann Pille „Änderung freigeben“.
B — Aufbau: Übersicht → Detailseite (wie iOS-Einstellungen)

Übersicht „Rechtliches“ — nur drei Zeilen, kein Text:

Rechtliches
Deine Texte für Teilnehmende. Sie entstehen aus deinen Angaben und Einstellungen.

[§] Impressum          Aktuell                    ›
[§] AGB                Aktuell · 5. Okt 2026      ›
[§] Datenschutz        Freigeben                  ›
Pille je Zeile (Fehlt / Freigeben / Aktuell · Datum / Neue Vorlage). Zeile ganz tippbar (≥ 56 px).
Desktop: gleiche Liste links (max. 560 px), Detail rechts daneben.

Detailseite AGB (mobil eigene Seite mit „‹ Rechtliches“):

Statuskarte: „Aktuell · Fassung vom 5. Okt 2026, 14:12“ bzw. Aufgabe + Primärknopf „Prüfen und freigeben“.
„Das steht drin“ — die Werte aus Einstellungen als Liste, je Zeile „Ändern ›“ mit Sprung:
Kostenlos abmelden bis 24 Stunden vor Beginn · Ändern ›
Bezahlen: online und vor Ort · Ändern ›
Karten online kaufbar: 5er, 10er · Ändern ›
Steuer: Kleinunternehmer (§ 19 UStG) · Ändern ›
Weitere Regeln — Textfeld (1.500 Zeichen, Zähler), Speichern-Knopf erscheint erst bei Änderung.
„Ganzen Text ansehen“ → Vollbild-Sheet mit dem gerenderten Text; Abschnitte als Aufklapp-Liste (Überschrift sichtbar, Inhalt eingeklappt, „Alle aufklappen“ oben rechts). Werte aus Einstellungen dezent markiert.
„Frühere Fassungen“ (eingeklappt): Datum · Auslöser („Stornofrist geändert“, „Freigegeben“) · PDF-Link.
Datenschutz: gleich, ohne „Weitere Regeln“; „Das steht drin“ = Zahlungsdienst Stripe ja/nein, Karten ja/nein, Dienstleister (Anzahl, aufklappbar).
Impressum: Formular wie heute, Vorschau als einklappbare Karte „So sieht es aus“ (mobil standardmäßig zu).
C — Rechtstexte im App-Bereich ohne Fuß

Rechtliche Anforderung: Impressum muss leicht erkennbar und mit höchstens zwei Klicks erreichbar sein und so heißen. Das geht ohne Web-Fuß.

Eingeloggte App-Seiten (alle Rollen): kein Fuß mehr. Stattdessen im Konto-/Profilmenü (bzw. „Mehr“ in der mobilen Navigation) ein Abschnitt „Über {Studio}“ mit den Einträgen Impressum · Datenschutz · AGB · Widerruf (Widerruf nur bei Online-Karten). Öffnen als Sheet/Pop-up wie die bestehenden Rechtstexte, nicht als neue Seite. = 2 Tipps.
Öffentliche Seiten ohne Login (Kursübersicht für Gäste, Login, Registrierung, /widerruf): eine einzige ruhige Textzeile am Ende des Inhalts (nicht fixiert, keine Trennlinie, 13 px, gedämpfte Farbe, zentriert) — Gäste haben kein Menü.
Buchungs-/Kauf-Sheet: Hinweiszeile über dem Knopf bleibt (L7).
Mails: Fuß mit Impressum-Angaben bleibt (Pflicht in geschäftlichen Mails ist der Absender, schadet nicht).
Desktop-Seitenleiste: zusätzlich ganz unten klein „Rechtliches“ (öffnet dieselbe Liste), damit es ohne Profilmenü auffindbar ist.
Akzeptanz
Unit: Freigabe-Status je Kombination (Vorlage neu / Weitere Regeln geändert / nur Einstellung geändert → keine neue Freigabe).
E2E (e2eapp): (1) nach Freigabe „Weitere Regeln“ ändern → neue Fassung + Pille „Änderung freigeben“; (2) Stornofrist ändern → neue Fassung, keine neue Freigabe nötig; (3) eingeloggt: kein Fuß, Impressum über Menü in 2 Tipps; (4) ausgeloggt: Textzeile am Ende der Kursübersicht.
Screenshots 360/1280: Übersicht, Detail AGB, Vollbild-Text mit Aufklappern, Menü „Über {Studio}“, öffentliche Seite unten.