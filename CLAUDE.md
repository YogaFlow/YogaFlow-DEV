# Omlify — Projektkontext für Claude Code

Diese Datei wird bei jedem Start automatisch gelesen. Sie beschreibt das Produkt, die
Arbeitsweise und den aktuellen Stand. Halte sie aktuell, wenn sich etwas Grundlegendes ändert.

---

## Was Omlify ist

Multi-Tenant-SaaS für Yoga-Lehrende und -Studios im deutschen Markt. Jeder Tenant hat eine
eigene Subdomain, eigenes Branding und strikt getrennte Daten. Kernfunktionen heute:
Kursverwaltung, Buchungen, Teilnehmerverwaltung, Rollen, Nachrichten.

Langfristiges Zielbild: ein Betriebssystem für Yoga-Unternehmen, das operative und
administrative Arbeit abnimmt — Buchung ist nur der Anfang. AI kommt später und tief in die
Prozesse integriert, nicht als angeklebter Chatbot.

Zielgruppe zuerst: selbstständige Yoga-Lehrende, nicht große Studioketten.

## Wer hier arbeitet

Julius, Gründer. Kommuniziert auf Deutsch, Code-Bezeichner auf Englisch. Entwickelt
AI-assistiert — nicht jede Zeile im Repo ist von Hand geschrieben. Er will Architektur
verstehen, nicht nur fertigen Code bekommen.

## Wie hier gearbeitet wird

**Audit vor Umsetzung.** Bevor etwas geändert wird, wird die Ursache belegt. Keine
Vermutungen über Code, der nicht gelesen wurde.

**STOPP-Gates.** Größere Aufgaben laufen in nummerierten Schritten mit ausdrücklichen
Haltepunkten. An einem STOPP wird auf Freigabe gewartet, nicht weitergearbeitet.

**Nachweise statt Zusicherungen.** Build-Ausgaben, `grep`-Zählwerte und Screenshots im
Wortlaut. „Funktioniert wie erwartet" ohne Beleg zählt nicht.

**Unsicherheiten offenlegen.** Wenn bei einer Aufgabe eine Entscheidung selbst getroffen
wurde, gehört sie mit Datei, Zeile und Begründung in den Abschlussbericht.

**Nach jedem abgenommenen STOPP pushen.** `omlify-dev.de` baut aus Branch `Julius`.
Nicht gepusste Commits bedeuten, dass Julius auf dem Handy einen veralteten Stand bewertet —
das ist schon einmal passiert und hat Zeit gekostet.

**Widersprechen ist erwünscht.** Wenn eine Anweisung fachlich falsch ist oder ein Feature
sich in einen Design- oder Refactoring-Durchlauf einschleicht: sagen, nicht ausführen.

## Harte Grenzen

- Keine Datenbankmigration und kein Schemaeingriff ohne ausdrückliche Freigabe.
- Keine Änderung an Auth, RLS, Rollen oder Tenant-Auflösung ohne eigenen, angekündigten Auftrag.
- Keine neuen Abhängigkeiten ohne Rückfrage.
- Produktionsdaten werden nie verändert.
- Der Service-Role-Key bleibt serverseitig. Niemals in eine `VITE_`-Variable.
- Feature-Arbeit und Design-/Aufräumarbeit kommen nie in denselben Commit.

---

## Stack und Struktur

- React 18, Vite 7, TypeScript, Tailwind CSS 3.4
- Supabase (PostgreSQL, Auth, RPCs, Edge Functions)
- Cloudflare Pages, DEV baut aus Branch `Julius` → `omlify-dev.de`
- Geplant für Monat 3: native App mit Expo für den Teilnehmer-Fluss. Die Web-App bleibt
  für Backoffice und öffentliche Buchungsseite. Deshalb sind Design-Tokens
  plattformneutral gehalten.

**Wichtige Dateien**

- `src/design/tokens.ts` — einzige Farbquelle, wandert später in ein gemeinsames Paket
- `src/lib/format.ts` — Datum, Uhrzeit, Preis, Dauer. Formatierung passiert nirgendwo sonst.
- `src/lib/courseDateFilter.ts` — Filterlogik der Kursliste
- `docs/DESIGNSYSTEM.md` — verbindliche Farben, Formregeln, Formatierungsregeln

**Datenmodell — Fallen**

- Die Nutzertabelle heißt `users`, nicht `profiles`. Chat liegt in `messages`,
  es gibt keine `conversations`.
- `courses.date` ist `date`, `courses.time` und `end_time` sind `time without time zone`.
  Alle drei kommen als **String** an (`"2026-05-14"`, `"16:15:00"`).
  **Diese Werte dürfen niemals durch `new Date()` laufen** — das verschiebt Uhrzeiten je
  nach Umgebung. `messages.created_at` und `registrations.registered_at` sind dagegen
  `timestamptz`, dort ist `Intl.DateTimeFormat` mit `Europe/Berlin` korrekt.
- `users.tenant_id` ist `NOT NULL`, es gibt keine Membership-Tabelle: Ein Konto gehört zu
  genau einem Tenant.
- Rollen: `owner`, `admin`, `teacher`, `user`.

**Tenant-Isolation (geprüft am 09.09.2026)**

RLS ist auf allen 12 Tabellen in `public` aktiv. Die Policies vergleichen durchgängig
`tenant_id = yogaflow_private.get_my_tenant_id()`, in `USING` und `WITH CHECK`. Anwendungs-
Queries filtern deshalb bewusst nicht selbst nach `tenant_id` — die Durchsetzung liegt in der
Datenbank. Helferfunktionen sind `SECURITY DEFINER` mit `SET search_path TO 'public'`.
`get_my_tenant_id()` liefert bei fehlendem Profil `NULL`, die Policy schlägt dann fehl.
Das ist fail-closed und soll so bleiben.

---

## Designsystem

Maßgeblich ist `docs/DESIGNSYSTEM.md`. Das Wichtigste in Kürze:

- Kein Hex-Wert in einer Komponente. Nur semantische Tokens.
- Die Grünrampe heißt **`sage`**, nicht `green` — sonst würde Tailwinds eigenes Grün
  überschrieben.
- Hintergrund warmer Sand `#F5F3EF`, Marke Tief-Salbei `#2F5A4E`, Akzent Safran `#B87A2E`.
- Nur `--color-brand` und die vier zugehörigen Tokens sind später pro Tenant überschreibbar.
- Uhrzeit nie mit Sekunden, Datum ausgeschrieben, Preis als `18 €`.
- Gefüllt in `danger` ist nur ein Knopf, der sofort etwas Unwiderrufliches auslöst.
- Erfolg wird nie allein über Farbe signalisiert.

---

## Stand (09.09.2026)

**Fertig:** Paket 1 (Tokens, Farbmigration, Grundflächen, Form) und Paket 2 (Datum, Uhrzeit,
Preis, `tabular-nums`, Versalien).

Commits auf `Julius`: `5cb3122`, `be31c44`, `9270058`, `da7d715`.
Wiederherstellungspunkt vor Beginn: Tag `pre-design-tokens` (`8cb4712`).

**Als Nächstes — Paket 3, Layout:**

9. Kursliste: Kartenstapel → nach Tagen gruppierte Blöcke mit Zeitspalte links
10. Teilnehmerliste: gleiche Umstellung
11. Dashboard: Kennzahl-Kacheln → eine Zeile mit Trennern
12. Dashboard: Hero-Karte „deine nächste Stunde"
13. Kopfbereich trägt den Seitentitel statt „Willkommen zurück, {Name}!"

**Danach — Paket 4:** destruktive Aktionen entschärfen, Tippziele 44 px, Leerzustände als
Einladung, Gedrückt-Zustand statt Hover.

**Notiert, bewusst nicht jetzt:**

- `Dashboard.tsx` ab Zeile 306: Fallback ist für alle vier Rollen unerreichbar, weil
  `teacher` vorher aus der Funktion springt. Toter Code, beim Dashboard-Umbau mitnehmen.
- Dieselbe Zahl heißt für `user` „Alle Kurse" und für `admin`/`owner` „Kommende Kurse".
  Namensangleichung bei Gelegenheit.
- `unregister_from_course` hat `pg_temp` im `search_path`, ohne temporäre Tabellen zu nutzen.
  Beim nächsten Anfassen entfernen.
- `public/hero-dashboard.png` zeigt einen veralteten Stand samt „Frank". Wird nach Paket 3
  komplett neu erstellt, nicht korrigiert.
- JS-Bundle 1.040 kB, gzip 272 kB. Relevant, weil die Zielgruppe über Instagram aufs Handy
  kommt. Nach Paket 3 angehen, zusammen mit der Frage, ob die Marketingseite aus der SPA
  gelöst wird.
- Prüfen, ob `users.email` global oder pro Tenant eindeutig ist. Bei global eindeutig kann
  eine Teilnehmerin nicht bei zwei Studios buchen.
- Der Lehrerfilter auf der Kursseite ist sichtbar — ungeklärt, ob er tatsächlich filtert.

---

## Was nicht hier entschieden wird

Produktstrategie, Positionierung, Preisgestaltung, Zielbild und die Frage, ob ein Feature
überhaupt gebaut werden soll, bespricht Julius in einem separaten Claude-Projekt, in dem die
Entscheidungsdokumente liegen. Wenn eine Aufgabe hier eine solche Frage aufwirft: benennen
und zurückspielen, statt sie nebenbei zu beantworten.
