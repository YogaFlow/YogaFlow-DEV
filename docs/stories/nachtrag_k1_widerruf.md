Nachtrag K1 — Widerruf robust machen (Claude-Review DEV, 05.10.2026)

Für Cursor. HEAD 0b9ee32. Claude hat confirm_pass_withdrawal_core, pass_withdrawal_preview, lookup_/confirm_pass_withdrawal_public, pass_wertersatz_cents auf DEV gelesen. Gut: Wertersatz-Formel exakt wie vorgegeben, öffentliche Seite neutral + Rate-Limit + IP nur als Hash, Bestätigung an gespeicherte Mail. Drei Befunde, je ein Commit, check:ci, Bericht ergänzen.

W1 — Resttermine sofort beim Widerruf entwerten

Heute: Bei Erstattung > 0 wird nur request_refund angestoßen; die Karte bleibt aktiv, bis der Erstattungsauftrag durch ist. In dieser Zeit kann die Käuferin weiter buchen → mehr genutzte Termine als berechnet. Fix: void_pass_remaining(..., 'withdrawal', ...) in derselben Transaktion vor request_refund aufrufen, Karte sofort nicht mehr buchbar. Test: Widerruf bestätigt → Buchung mit dieser Karte sofort abgelehnt, auch wenn die Erstattung noch läuft.

W2 — Doppelter Widerruf ohne Nebenwirkungen

Heute: Ereignis + Mail „Widerruf eingegangen“ werden vor request_refund geschrieben; schlägt die zweite Erstattung fehl (Summenprüfung), bleibt trotzdem eine zweite Mail stehen. Die Prüfung ALREADY_WITHDRAWN greift nur, wenn der Status schon nicht mehr active ist. Fix: Zu Beginn mit FOR UPDATE auf die Karte prüfen, ob bereits ein Widerruf existiert (Ereignis pass.withdrawal_received oder payment_refunds.reason = 'withdrawal' oder void mit Grund withdrawal) → sofort ALREADY_WITHDRAWN zurück, ohne Ereignis/Mail. Danach erst Entwerten (W1), Ereignis, Mail, Erstattung — alles in einer Transaktion; Fehler der Erstattung → RAISE (alles zurückrollen), nicht RETURN. Test: zweimal schnell hintereinander bestätigen (auch öffentlich) → genau 1 Ereignis, 1 Mail, 1 Erstattung.

W3 — „Genutzt“ = gebuchte Termine, offen gesagt

Heute zählen auch künftig gebuchte Termine als genutzt (Netto der redeem-Bewegungen). Das bleibt so (Regel K12, in Entscheidung 15 ergänzen): Mit der Karte gebuchte Termine bleiben nach dem Widerruf gebucht und werden als genutzt berechnet. Pflicht: Das vorher transparent machen. Im Widerrufs-Dialog (App + öffentliche Seite), wenn kommende Buchungen mit dieser Karte existieren:

„Du hast 2 kommende Termine mit dieser Karte gebucht (Mi 8. Okt, Fr 10. Okt). Sie bleiben gebucht und werden als genutzt berechnet. Wenn du sie nicht wahrnehmen willst, melde dich vorher ab — dann bekommst du mehr zurück.“ Dazu im Rechenweg: „2 genutzt (davon 2 kommend)“. Unit-Test der Texte.

Zusätzlich
E2E kauft mit synthetischem PaymentIntent → der echte Stripe-Weg (Webhook → complete_* → Karte) ist nur im Klicktest geprüft. Nach Julius' Klickpunkt 3 im Bericht festhalten: PaymentIntent-Ende, payment_attempts-Status, passes-Zeile, Beleg, Hauptbuch-Zeilen (nur IDs/Zähler).