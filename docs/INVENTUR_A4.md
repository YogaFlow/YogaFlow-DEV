# Inventur A4 — Kartenprodukte

Nur Lesen. Bezug: `docs/EPIC_GELDKETTE_1A_NACHTRAG_2026-09-21.md` (Story A4, Einfluss A5/A6, E16). Keine Entscheidungen.

---

## 1. Bestehende Fundstellen (pass / package / credit / abo)

| Bereich | Fund | Bemerkung |
|---|---|---|
| Schema | keine Tabellen `pass_products`, `passes`, `pass_movements` | noch nicht angelegt |
| `payments` (A3) | `subject_type IN ('registration', 'pass_purchase')`; bei `pass_purchase` ist `registration_id` **NULL** erlaubt | vorbereitet für A5 |
| Typen | `src/types/index.ts`: `PaymentSubjectType = 'registration' \| 'pass_purchase'` | Client kennt den Wert, UI nutzt ihn noch nicht für Karten |
| A9 | Kommentar in `cancel_course`: Platzhalter für A6 `pass_movements redeem_reversal` | kein Code |
| UI / Routing | kein Menüpunkt, keine Seite „Karten“ | — |
| Suche `package` / `credit` / `abo` / `Guthaben` | keine Produkt-Tabellen oder UI | Treffer nur AbortController u. Ä. |

---

## 2. Serien und `pass_eligible`

| Ort | Datei:Zeile | Relevanz |
|---|---|---|
| Serie anlegen | `src/pages/CreateCourse.tsx:343` `seriesId = isRecurring ? crypto.randomUUID() : null` | gemeinsames `series_id` für alle Termine |
| Insert Serie | `CreateCourse.tsx:355–368` | Schleife über Daten, jedes Insert setzt `series_id: seriesId` |
| Einzeltermin | `CreateCourse.tsx:371+` | ohne `series_id` |
| Serie laden / Scope | `src/pages/EditCourse.tsx:147–151`, `:334–341`, `:479`, `:531–535` | Update einzelner Termin vs. ganze Serie über `series_id` |

**Wo `pass_eligible` setzen (laut Nachtrag):**

- Beim Anlegen der Serie: in der Insert-Schleife in `CreateCourse.tsx` (~355–368) für **alle** Termine denselben Wert (Default `true`).
- Einzeln abschaltbar: in `EditCourse.tsx` am Einzeltermin (Scope nicht Serie), analog zu anderen Kursfeldern; Serien-Update könnte den Wert auf alle zukünftigen Termine spiegeln — offen, siehe Abschnitt 6.

---

## 3. Rechte-Muster für `pass_products`

Passend für „nur owner/admin“:

| Muster | Ort | Nutzung |
|---|---|---|
| `yogaflow_private.is_tenant_manager()` | RLS Policies, SECURITY-DEFINER-RPCs | owner/admin des aktuellen Studios |
| A2 Erlass | `set_coverage_waived` / `revert_coverage_waived` | `IF NOT is_tenant_manager() THEN …` |
| A3 Zahlungen | Policy + `record_manual_payment` | Manager studioweit; Lehrende nur eigener Kurs |
| Buchungseinstellungen | `update_booking_settings` | nur Manager |
| Events/Audit Select | Policies mit `is_tenant_manager()` | Lesen für Manager |

Empfehlung für die Inventur (keine Entscheidung): Policies und RPCs für `pass_products` analog Erlass/Buchungseinstellungen über `is_tenant_manager()`, nicht über Lehrer-Kursbindung.

---

## 4. Navigation — wo „Kartenprodukte“ hingehören

Bestehende Einstellungs-/Verwaltungsflächen:

| Fläche | Route / Einstieg | Inhalt heute |
|---|---|---|
| Einstellungen | `/settings` (Sidebar, Owner/Admin) | Studio & Design (`StudioDesignSection`), Standard-Teilnehmerzahl |
| Nutzerverwaltung | `/users` | Personen, Rollen |
| Kurse / Kurse verwalten | `/courses`, MyCourses | Termine |
| Teilnehmer / Kasse | Participants, CourseCheckout | Buchungen, Vermerke |
| Dashboard | Kurzlink Einstellungen | — |

Kartenprodukte sind Stammdaten (Preis, Einheiten, Gültigkeit), kein Kursablauf. Naheliegend: Abschnitt unter **Einstellungen** oder eigener Menüpunkt nur für Manager — Entscheidung offen (Abschnitt 6).

---

## 5. Konflikte Nachtrag-Modell vs. heutiges Schema

| Thema | Nachtrag / A5 | Heute | Konflikt? |
|---|---|---|---|
| `payments.registration_id NOT NULL` vs. `subject_type = 'pass_purchase'` | Verkauf ohne Buchungs-FK | A3: `registration_id` darf NULL sein, wenn `subject_type = 'pass_purchase'`; CHECK erzwingt das | **Kein Konflikt** — A3 hat die Erweiterung für A5 schon gebaut |
| `subject_type` | `pass_purchase` | Enum/CHECK bereits in A3 | vorbereitet |
| Tabellennamen `passes` / `pass_products` / `pass_movements` | neu | keine Kollision in `public` | — |
| `courses.pass_eligible` | neu, Default true | Spalte fehlt | Backward-compatible Default |
| `coverage_status = 'pass'` | A6 | A2 kennt `not_required`, `open`, `paid`, `waived` — Wert `pass` fehlt noch | A6-Migration muss Enum/CHECK erweitern |
| A9 Absage | Einheit zurück (A6) | nur Kommentar-Platzhalter | kein Schema-Konflikt |

---

## 6. Offene Entscheidungen (nicht getroffen)

1. **Gültigkeitsregel Standard** — Nachtrag/E16: Standard „3 Jahre zum Jahresende“ vs. `months`; Hinweistext unter 12 Monaten (E16 entschieden als Regel, konkrete UI-Kopie und Default-Werte in A4 noch festzuziehen).
2. **Archivieren** — nur `archived_at`, kein Löschen; ob archivierte Produkte in Dropdowns ausgeblendet oder grau sind.
3. **Wer legt an** — nur owner, oder owner+admin (`is_tenant_manager`)? Nachtrag: nur owner/admin.
4. **Serienvorgabe `pass_eligible`** — Default true für alle Serientermine; ob Serien-Edit den Schalter auf alle Termine schreibt oder nur auf den geöffneten.
5. **E16-Hinweistext** — Wortlaut des Verbraucher-Hinweises bei Gültigkeit &lt; 12 Monate (Rechts-Epic prüft später).
6. **Navigation** — Einstellungen-Abschnitt vs. eigener Sidebar-Punkt.
7. **E13 (berührt A5, nicht A4)** — dürfen Lehrende Karten *verkaufen*? Für A4-Produktanlage irrelevant, aber UI „Karte verkaufen“ später abhängig.

---

## 7. Kurzfazit für den Bau von A4

- Kein bestehendes Karten-UI; Schema für Zahlungsvermerk-Kauf (`pass_purchase`) ist in A3 vorbereitet.
- `pass_eligible` hängt an CreateCourse-Serienschleife und EditCourse-Einzel/Serie.
- Rechte-Muster: `is_tenant_manager()`.
- Nächster Schritt laut Nachtrag: Schema `pass_products` + `courses.pass_eligible` → Freigabe → STOPP.
