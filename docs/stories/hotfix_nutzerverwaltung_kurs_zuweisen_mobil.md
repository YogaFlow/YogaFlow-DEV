Hotfix PROD — Nutzerverwaltung › „Kurs zuweisen“ mobil (Knopf nicht sichtbar)

Für Cursor. Stand: 08.10.2026. Meldung der Testkundin (iPhone): In Nutzerverwaltung › Person › „Kurs zuweisen“ ragt das Auswahlfeld „Kurs auswählen…“ über den rechten Rand; der Hinzufügen-Knopf ist nicht zu sehen. Desktop ok. Nur Frontend, keine Migration, keine Functions. Hotfix-Weg wie beim Teacher-Guard: eigener Branch von origin/main, PR nach main; Merge macht Julius.

Teil 0 (nur lesen, kurz)
Komponente auf origin/main und auf Julius (Datei:Zeile). Gleiche Ursache in beiden?
Ursache benennen (z. B. Flex-Zeile ohne min-width: 0/flex-wrap, feste Breite am Select, width: 100% + Knopf daneben).
Gibt es dieselbe Konstruktion an weiteren Stellen (z. B. „Studio trägt ein“, Karte verkaufen)? Liste.
Fix (minimal)
Unter 640 px: Auswahlfeld volle Breite, Knopf darunter volle Breite (48 px hoch), Abstand 8 px. Darüber: wie heute nebeneinander, Select min-width: 0; flex: 1.
Keine anderen Änderungen im Hotfix-Branch.
Ablauf
Branch hotfix/nutzerverwaltung-kurs-zuweisen-mobil von origin/main, Fix, check:ci.
Derselbe Fix auf Julius (eigener Commit, ggf. andere Zeilen), push → DEV-Build prüfen (Workers-Check + Live-Bundle).
Julius prüft auf DEV mit iPhone (360/390): Knopf sichtbar, Zuweisen klappt.
PR hotfix/… → main (Diff nur die eine Komponente), CI grün → STOPP, Julius merged.
Nach dem Merge: Cloudflare-Build des PROD-Workers yogaflow-dev abwarten (Check-Run + Live-Bundle auf omlify.de enthält den Fix); bei hängendem Build leerer Commit auf main nur nach Rücksprache.
Danach origin/main in Julius mergen (Konflikt sollte trivial sein). Bericht mit Screenshots 360 vorher/nachher, STOPP.