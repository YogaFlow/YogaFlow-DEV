Story UX-5 — Buchungsleiste mobil, Toast-Regel, Demo-Studio aufräumen

Für Cursor (autonomer Ablauf). Stand: 04.10.2026, HEAD 133c8be. Als docs/stories/ux5_buchungsleiste_toast_demo.md ablegen. Klicktest Nachtrag ZW-1: 1, 2, 3, 6 ok; 4 ok bis Toast-Dauer; 5 nicht testbar (kein passendes Profil). check:ci vor jedem Push. Logik-/Gestaltungs-Commits getrennt. Am Ende Haltestelle 5, Klickliste max. 8 Punkte (mit Konto-Angabe je Punkt).

A — Buchungsleiste mobil (Kursdetail)

Befund (Screenshot 04.10.): Zahlart-Zeile klebt am Knopf, drei Elemente unterschiedlicher Art stehen ohne Ordnung nebeneinander.

Neuer Aufbau, gestapelt (ab < 1024 px; Desktop-Buchungskarte gleiche Reihenfolge, sonst unverändert):

┌──────────────────────────────────────────────┐
│ 16 € pro Termin        ◷ Kostenlos abmelden  │  Zeile 1: Preis links (fett 20 px + klein „pro Termin“),
│                          bis Di, 6. Okt       │  Frist rechts, klein grau, max. 2 Zeilen, rechtsbündig
│                                              │  12 px Abstand
│ ┌──────────────────────────────────────────┐ │  Zeile 2: Zahlart als Auswahlfeld
│ │ (◎) Vor Ort bezahlen · im Studio      ›  │ │  48 px hoch, Rahmen + Radius wie Eingabefelder,
│ └──────────────────────────────────────────┘ │  ganze Fläche tippbar (öffnet Auswahl), „Ändern“-Wort entfällt
│                                              │  12 px Abstand
│ [            Weiter zur Buchung             ] │  Zeile 3: Primärknopf volle Breite, 52 px
└──────────────────────────────────────────────┘
Nur ein Zahlweg verfügbar → Zeile 2 ohne Rahmen und ohne Pfeil (reine Info).
„Neu“-Hinweis als kleines Abzeichen im Auswahlfeld rechts vor dem Pfeil, Hinweistext darunter klein.
Innenabstand 16 px, oben feine Trennlinie + leichter Schatten, unten safe-area-inset-bottom.
Screenshots 360/390 px für alle drei Zahlarten + „nur ein Weg“.
B — Toast-Regel (ersetzt N2)

Recherche (Claude): Barrierefreiheits-Leitfäden empfehlen eher längere Anzeigedauern, vor allem bei Meldungen mit Aktion (Lesezeit + Reaktionszeit, Pause bei Hover/Fokus). Die gefühlte Länge kommt bei uns daher, dass zu viele Meldungen ein „Rückgängig“ samt Balken haben. Deshalb: weniger Rückgängig, nicht kürzere Zeiten.

Art	Rückgängig	Dauer	Balken
Bestätigung (gebucht, gespeichert, gesendet)	nein	4 s	nein
Entfernen/Abmelden (Person abmelden, Teilnehmer entfernen) — nur wenn ohne Erstattung umkehrbar	ja	6 s	ja, dezent (2 px, 60 % Deckkraft)
Fehler	—	bleibt bis Schließen	nein
Buchungen bekommen kein Rückgängig mehr (auch nicht mit Karte): Wer sich vertippt, meldet sich normal ab — die Karte bekommt den Termin zurück.
Jeder Toast: Wischen oder Tipp auf ✕ schließt sofort. Pause bei Hover/Fokus bleibt.
Designsystem-Tabelle ersetzen; Unit-Tests anpassen.
C — Demo-Studio demoalpha aufräumen + neue Demodaten

Ziel: Julius klickt in einem ordentlichen Studio. Das Owner-Profil bleibt vollständig (Konto, Studio-Design, Anbieterangaben, Zahlungs-/Steuereinstellungen, Stripe-Anbindung, AVV-Zustimmungen).

Schritt 1 — Inventur (nur lesen), Haltestelle: Zählung je Tabelle für demoalpha: Kurse (kommend/vergangen/abgesagt), Anmeldungen, Teilnehmende, Karten, Zahlungen, Belege, Erstattungen, Hauptbuch, Nachrichten, Benachrichtigungen. Dazu die Einstufung:

löschbar: Kurse, Anmeldungen, Teilnehmende, Nachrichten usw. ohne Geld-/Belegspur.
nicht löschbar: alles mit Zahlung, Beleg, Hauptbuch- oder AVV-Eintrag (append-only, Prüfspur). Diese Kurse/Personen nicht löschen, sondern ausblenden: Kurse in der Vergangenheit lassen; abgesagte Test-Kurse mit Geldspur bekommen ein internes Kennzeichen archived, das sie aus allen Listen nimmt (kein Löschen). Bericht mit Zahlen → STOPP, Julius bestätigt (Haltestelle 4: Datenänderung).

Schritt 2 — Aufräumen über ein Skript npm run dev:demo:reset -- demoalpha (DEV-Guard, nur dieses Studio, idempotent, Trockenlauf-Modus --dry-run zuerst).

Schritt 3 — Demodaten v2 über ein Seed-Skript (wiederholbar), realistisch und deutsch:

6 kommende Kurse in den nächsten 14 Tagen (z. B. Hatha am Morgen, Vinyasa Flow, Yin Yoga, Yoga für Rücken, Workshop „Atem & Entspannung“ 35 € ohne Karte, Pilates), unterschiedliche Preise (14–35 €), 2 Lehrende.
Teilnehmende (eigene Testadressen juliusbne+<name>@gmail.com, damit Mails ankommen):
Vera Vorort — 3 vergangene Buchungen vor Ort bezahlt, nie online (für den „Neu“-Hinweis)
Karla Karte — aktive 10er-Karte, noch 6
Olaf Online — 2 vergangene Online-Zahlungen
Nina Neu — noch keine Buchung
Zugangsdaten nur in supabase/.env.dev (nie committen), im Bericht nur Namen + Rolle.
E2E läuft weiterhin nur in e2eapp.
Akzeptanz
Unit: Toast-Regel je Art; Buchungsleiste Snapshot für 4 Zustände.
E2E (e2eapp): Buchung → Toast ohne Rückgängig, 4 s; Abmelden (bar) → Toast mit Rückgängig, 6 s; Zahlart-Feld öffnet Auswahl.
Reset-Skript: Trockenlauf-Ausgabe = tatsächliche Änderungen; zweiter Lauf ändert nichts.