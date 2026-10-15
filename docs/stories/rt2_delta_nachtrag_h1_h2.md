RT-2 — Nachtrag Wortlaut H1/H2 (Claude, 08.10.2026)

Für Cursor. Antwort auf Haltestelle (H1 § 6 Abs. 3, H2 § 9 Abs. 4). Wortlaut genau so übernehmen, dann v2 + Umsetzung 1–5 weiter.

H1 — § 6 Abs. 3 ersetzen durch

(3) Zahlungen der Teilnehmenden an das Studio kann das Studio in Omlify als vor Ort erhalten vermerken oder, wenn es die Online-Zahlung nutzt, nach § 8a über Stripe abwickeln. Omlify selbst nimmt keine Zahlungen der Teilnehmenden entgegen.

H2 — § 9 Abs. 4 ersetzen durch (und den Satz „Nach Vertragsende stellt Omlify …“ aus dem Delta nicht zusätzlich anhängen — er ist hier enthalten)

(4) Nach Wirksamwerden der Kündigung stellt Omlify dem Studio für 30 Tage Exporte seiner Daten bereit (insbesondere Teilnehmende, Buchungen, Zahlungen und Belege); in dieser Zeit ist das Konto nur noch zum Export nutzbar. Danach löscht Omlify die im Auftrag des Studios verarbeiteten Daten unwiderruflich nach Maßgabe des Auftragsverarbeitungsvertrags. Ausgenommen sind Daten, die Omlify selbst gesetzlich aufbewahren muss oder zum Nachweis seiner eigenen Pflichten benötigt, insbesondere Nachweise über Zustimmungen zu diesen AGB und zum Auftragsverarbeitungsvertrag; diese löscht Omlify drei Jahre nach Vertragsende.

Technik dazu
„Nur noch zum Export nutzbar“: Wenn es heute keinen solchen Kontozustand gibt → nicht bauen, sondern im Bericht vermerken; Kündigungen laufen ohnehin manuell (delete_tenant_complete). Julius stellt dann vor dem Löschen die Exporte per E-Mail bereit. Vor erster echter Kündigung als Punkt in OFFENE_PUNKTE.