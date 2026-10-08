Nachtrag F — Fixes aus dem Gesamt-Klicktest UX-6…UX-10

Für Cursor. Stand: 08.10.2026, HEAD c267655. Klicktest Julius: 2, 6–11, 13–16 ok; 12 korrekt (Nina hat eine 10er-Karte → Hinweis bleibt nach Regel aus). Befunde unten. Nur Fixes, keine neuen Funktionen (Scope-Freeze bis Release). check:ci vor jedem Push, Logik-/Gestaltungs-Commits getrennt, E2E nur in e2eapp, vor Haltestelle 5 Workers-Build + Live-Bundle prüfen und Demo frisch seeden (F3). Klickliste max. 8.

F1 — Regel L3 verletzt: neue Vorlage sperrt Online-Zahlung (Release-Blocker)

Befund: Nach der Begriffsänderung (UX-10) war in demoalpha Online-Zahlung gesperrt, bis AGB/Datenschutz neu freigegeben wurden. L3 sagt: Bis zur neuen Freigabe gilt die zuletzt freigegebene Fassung weiter, Online bleibt bereit, nur Banner „Neue Vorlage verfügbar“. Auf PROD würde jede Vorlagen-Änderung alle Studios sperren. Ursache (vermutlich): Sperre prüft „aktueller Vorlagen-Hash freigegeben“ statt „irgendeine Vorlagen-Version freigegeben“; außerdem wurde agb.v1.md in UX-10 überschrieben (auf meine Anweisung) — damit gibt es die freigegebene alte Fassung als Datei nicht mehr. Fix:

STUDIO_LEGAL_TEXTS_MISSING nur, wenn für AGB bzw. Datenschutz noch nie eine Vorlagen-Version freigegeben wurde (oder Impressum unvollständig).
Angezeigt, gerendert und an Buchungen gehängt wird die zuletzt freigegebene Vorlagen-Version mit den aktuellen Werten — nicht automatisch die neueste.
Vorlagen-Dateien sind unveränderlich, sobald eine Version irgendwo freigegeben wurde: Änderungen nur als neue Datei (agb.v2.md …). Prüfung im CI: Hash jeder freigegebenen Version (Liste im Repo) muss zur Datei passen. Regel in omlify-autonom.mdc.
Für UX-10 nachträglich: aktuellen Stand als v2 führen (Kurskarte). v1 aus Git-Historie (vor UX-10) wiederherstellen, damit Studios mit v1-Freigabe korrekt gerendert werden.
E2E: Studio gibt v1 frei → v2 erscheint → Online bleibt bereit, Banner sichtbar, /agb zeigt v1 → Freigabe v2 → /agb zeigt v2, neue Buchung hängt an v2-Fassung.
F2 — Zahlen für „offen“ widersprechen sich

Befund (Screenshots): Seitenleiste „Zahlungen 8“, Reiter „Offen 8“, „Zu erledigen“ 8 + „1 weitere“ = 9, Sammel-Abhaken „11 Anmeldungen“. Fix: Eine Definition „offene Zahlung“ (Kurs begonnen, registered, coverage_status = open, nicht archiviert), eine Lese-Funktion, alle vier Stellen nutzen sie. Abweichung nur, wenn bewusst und im Text erklärt (z. B. Abhaken „vor dem Datum“ = Teilmenge). Unit-/SQL-Test: alle Zähler gleich für denselben Datenstand. Im Bericht: woher kam 11 und 9?

F3 — Demodaten veralten (Datum) und haben technische Namen

Befund: Seed lief am 06.10.; heute fehlen „Heute“/„Gestern“-Fälle, „Vinyasa Flow“ (war „morgen, voll“) ist jetzt Vergangenheit mit 8 offenen Zahlungen. Namen „Filler1 Demo“ … und Kurs „Olaf Flow Teilerstattung“ (erscheint als kommender Kurs!) sind technisch. Fix:

demo_v3.mjs (+ Reset) rechnet alle Termine relativ zum Ausführungszeitpunkt; vor jeder Haltestelle 5 frisch ausführen, Zeitpunkt im Bericht.
Realistische Namen: Füllpersonen z. B. „Anna Berger“, „Jonas Weber“ …; Teilerstattungs-Kurs als vergangener Kurs „Vinyasa am Sonntag“ (nicht in der Zukunft).
Keine Demo-Kurse mit Zweck im Namen.
F4 — Kasten „Sammel-Abhaken“ in Zahlungen › Offen dominiert

Befund: Der Erklärkasten („Omlify weiß nicht, wer vor dem Start mit Omlify bezahlt hat …“) steht groß über „Überfällig“ — auch im laufenden Betrieb. Fix: Standardmäßig eingeklappt als eine Zeile unter der Liste: „Ältere Kurse auf einmal als erledigt markieren ›“. Aufgeklappt wie heute. Nur zeigen, wenn es offene Anmeldungen vor gestern gibt.

F5 — „Kommt noch · zahlt vor Ort“ prüfen

Julius konnte den Abschnitt nicht bestätigen. Mit frischem Seed (F3) Screenshot 360/1280 von Zahlungen › Offen mit beiden Abschnitten in den Bericht; fehlt er → Fehler beheben.

Klickliste-Vorgabe

Punkte für: F1 (Vorlage v3-Testlauf auf demobeta per Skript simulieren: Online bleibt bereit), F2 (alle Zähler gleich), F3 (Übersicht mit Heute/Gestern-Fällen), F4, F5.