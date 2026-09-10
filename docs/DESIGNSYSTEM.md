# Omlify Designsystem v1 — Farben und Tokens

**Stand:** 09.09.2026 (v1.1 — Grünrampe ergänzt, Navigation entschieden) · **Status:** festgelegt
**Ablageort im Repo:** `docs/DESIGNSYSTEM.md`
**Zugehörig:** `claude/Entscheidung_02_Mobile_Strategie.md` (Tenant-Branding als Vorarbeit)

---

## Die eine Regel, an der alles hängt

> **Kein Hex-Wert steht jemals in einer Komponente.**
> Komponenten lesen ausschließlich semantische Tokens (`--color-brand`, nicht `--green-600`).

Grund: Tenant-Branding ist als Vorarbeit vor der Geldkette gesetzt. Jedes Studio bekommt
eigene Farben. Farben, die heute in Komponenten stehen, müssen dafür nächste Woche wieder
herausoperiert werden.

---

## Zwei getrennte Ebenen

| Ebene | Wer bestimmt sie | Beispiele |
|---|---|---|
| **Produkt-Chrome** | Omlify, unveränderlich | Hintergrund, Text, Linien, Status- und Akzentfarben |
| **Tenant-Marke** | das Studio, überschreibbar | `--color-brand`, `--color-brand-soft`, `--color-on-brand`, Logo |

**Warum die Trennung:** Wenn ein Studio Pink als Markenfarbe wählt, darf der Warnhinweis nicht
pink werden und die Storno-Aktion nicht ihre Rot-Bedeutung verlieren. Nur *ein* Token-Paar ist
brandbar — das reicht für Wiedererkennung und lässt das System nie kaputtgehen.

**Zwingende Prüfung beim Branding-Feature:** Kontrast von `--color-on-brand` gegen die gewählte
Studiofarbe serverseitig berechnen (WCAG AA, Verhältnis ≥ 4,5:1 für Text). Bei zu heller
Studiofarbe automatisch auf dunkle Schrift umschalten. Sonst gibt es weiße Schrift auf Hellgelb.

---

## Farbwerte

### Basis (fest)

| Token | Hex | Verwendung |
|---|---|---|
| `--color-bg` | `#F5F3EF` | Seitenhintergrund (warmes Papier statt Blaugrau) |
| `--color-surface` | `#FFFFFF` | Karten, Listen, Sheets |
| `--color-surface-sunken` | `#EAE5DB` | Segmentumschalter, inaktive Flächen |
| `--color-border` | `#E5DFD4` | Rahmen, Trenner |
| `--color-border-strong` | `#D6CDBE` | betonte Trenner, Eingabefeldrahmen |
| `--color-text` | `#1F1B16` | Fließtext, Überschriften |
| `--color-text-muted` | `#6F6558` | Metadaten, Labels |
| `--color-text-subtle` | `#9A9083` | Platzhalter, deaktiviert |

### Grünrampe (fest — die Palette, aus der die Marke schöpft)

| Token | Hex | Verwendung |
|---|---|---|
| `--green-50` | `#F2F6F3` | Nebel — Kopfbereich, Sektionsflächen, aktive Listenzeile |
| `--green-100` | `#E3EDE7` | Dunst — Badges, Icon-Flächen |
| `--green-200` | `#CBDDD3` | Blatt — Fortschrittsbahn, Trenner auf grünem Grund |
| `--green-300` | `#A5C0B2` | Eukalyptus — Icons und Sekundärtext auf Dunkelgrün |
| `--green-500` | `#4A7A69` | Salbei — zweite Aktion, Diagrammflächen, Kopf-Icons |
| `--green-600` | `#2F5A4E` | Tief-Salbei — Hauptaktion |
| `--green-800` | `#23443B` | Tanne — gedrückter Zustand, Text auf `green-50`/`100` |

**Warum eine Rampe statt einzelner Grüntöne:** Jede Stufe hat eine Aufgabe. Sobald Grüntöne
frei gewählt werden, entstehen zwei Töne, die fast gleich aussehen, aber Unterschiedliches
bedeuten — und die Oberfläche wirkt matschig statt ruhig.

**Kontrastregeln:** Text auf `green-50`, `100` und `200` immer in `green-800`, nie in
`--color-text`. Text auf `green-600` und `800` immer in Weiß. `green-300` ist nie Textfarbe
auf hellem Grund (zu wenig Kontrast) — nur auf Dunkelgrün.

### Marke (Standardwert, tenant-überschreibbar)

| Token | Standardwert | Verwendung |
|---|---|---|
| `--color-brand` | `var(--green-600)` | Hauptaktion, Hero-Flächen |
| `--color-brand-pressed` | `var(--green-800)` | gedrückter Zustand |
| `--color-brand-soft` | `var(--green-100)` | Badges, ruhige Markenflächen |
| `--color-brand-on-soft` | `var(--green-800)` | Text auf `brand-soft` |
| `--color-on-brand` | `#FFFFFF` | Text auf `brand` |

Nur diese fünf Tokens sind überschreibbar. Die Rampe selbst bleibt, damit Omlify-eigene
Flächen auch bei einem Studio mit pinker Marke ruhig bleiben.

**Konflikt, der dabei entsteht:** Erfolgsgrün und Markengrün sind im Standardfall dieselbe
Familie. Konsequenz: **Erfolg wird nicht über Farbe allein signalisiert.** Ein gebuchter Kurs
zeigt Häkchen plus Text („Gebucht"), nicht bloß eine grüne Fläche. Das ist ohnehin die
barrierefreiere Lösung.

### Akzent und Status (fest)

| Token | Hex | Verwendung |
|---|---|---|
| `--color-accent` | `#B87A2E` | Safran — Hinweise, Warteliste, Aufmerksamkeitskarten |
| `--color-accent-soft` | `#F7EEDF` | Fläche hinter Akzenttext |
| `--color-success` | `#3F7A5E` | gebucht, bezahlt |
| `--color-success-soft` | `#E4F0E9` | |
| `--color-danger` | `#A8443A` | stornieren, löschen |
| `--color-danger-soft` | `#F6E5E2` | |

**Bewusst gestrichen:** Blau und Lila. Sie kamen aus dem Standard-Tailwind-Set und gehören zu
keiner Aussage. Rollen-Badges nutzen künftig `brand-soft` bzw. neutrale Grautöne, nicht je eine
eigene Farbfamilie.

**Warum Safran und nicht Terracotta:** Salbeigrün, Beige und Terracotta zusammen sind die
Standardpalette jedes Wellness-Auftritts — austauschbar. Safran kommt aus demselben Umfeld,
ist wärmer und funktioniert zugleich semantisch als Achtungsfarbe.

---

## Form und Typografie

| Token | Wert |
|---|---|
| `--radius-sm` | `10px` (Chips, Segmente) |
| `--radius-md` | `14px` (Karten, Listenblöcke) |
| `--radius-lg` | `20px` (Sheets, Hero) |
| `--radius-full` | `999px` (Pills, FAB) |

- **Schriftfamilie:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`.
  Systemschrift, keine Webfont-Ladezeit, auf iOS automatisch SF Pro.
- **Serif nur im Marketing.** Die Landingpage darf eine Serifen-Headline haben, die App nicht —
  in einer Bedienoberfläche kostet sie Lesbarkeit und wirkt zäh.
- **Skala:** 28 / 22 / 19 / 17 / 15 / 13 / 12 px · Zeilenhöhe 1,3 für Überschriften, 1,45 für Text.
- **Gewichte: nur 400 und 500.** 600 und 700 wirken auf hellem Sand grob.
- **Schatten:** nur zwei erlaubt, beide sehr weich und warm getönt
  (`0 1px 2px rgba(31,27,22,.05)`, `0 8px 24px rgba(31,27,22,.10)` für Sheets).
  Standard ist eine 1px-Linie in `--color-border`, kein Schatten.

---

## Navigation und Flächen

**Navigation im Web bleibt das Seitenmenü (Hamburger)** — entschieden am 09.09.2026.
Der Kopfbereich trägt künftig den **Seitentitel**, nicht mehr die Begrüßung: „Willkommen
zurück, Anna!" steht heute auf jedem Bildschirm über dem eigentlichen Titel und verbraucht
eine Zeile ohne Information. Die Begrüßung erscheint nur noch einmal, auf der Übersicht.

Für die spätere Expo-App bleibt die untere Leiste die Vorgabe — dort ist sie Plattformstandard.

**Flächenregel — gegen den Kartenstapel:**

1. Eine Karte umschließt **ein** Objekt. Mehrere gleichartige Zeilen kommen in **einen**
   Block mit Trennlinien, nicht in je eine eigene Karte.
2. Kennzahlen stehen nebeneinander in einer Zeile mit senkrechten Trennern, nicht
   untereinander als drei Kacheln.
3. Höchstens **eine** betonte Fläche pro Bildschirm (die Hero-Karte). Alles Weitere ist
   Weiß auf Sand.
4. Icon-Kacheln in Signalfarben neben Zahlen entfallen ersatzlos — sie tragen keine Aussage.

## Verbindliche Formatierungsregeln

Diese Punkte verursachen mehr „das ist eine Website"-Gefühl als jede Farbe:

1. **Uhrzeit ohne Sekunden.** `18:30`, niemals `18:30:00`.
2. **Datum ausgeschrieben.** `Do, 18. Sep` statt `18.09.2026`. Im laufenden Jahr ohne Jahreszahl.
3. **Relative Zeit im Vordergrund.** „in 4 Stunden", „morgen 09:00" — das Datum als Ergänzung.
4. **Keine Großbuchstaben-Labels.** `KURSLEITUNG` wird zu `Kursleitung` oder entfällt.
5. **Zahlen tabellarisch:** `font-variant-numeric: tabular-nums` überall dort, wo Zahlen
   untereinander stehen. Sonst springen die Zeitangaben in Listen.
6. **Preis mit Euro-Zeichen hinten:** `18 €`, nicht `€18`. Deutsche Konvention.
7. **Destruktive Aktionen sind niemals vollflächig.** „Stornieren" ist Text in
   `--color-danger`, kein roter Balken.
8. **Mindestgröße für Tippziele: 44 × 44 px.**

---

## Technische Umsetzung

**Ablage:** eine einzige Quelldatei `packages/core/src/design/tokens.ts` als reines
TS-Objekt. Daraus werden erzeugt:

- CSS-Variablen für `apps/web` (`:root`-Block, per Build oder zur Laufzeit für Tenant-Werte)
- ein Theme-Objekt für `apps/mobile` (React Native kennt keine CSS-Variablen)

**Warum eine plattformneutrale Quelle:** Nach Entscheidung 02 kommt die Expo-App in Monat 3.
Eine Palette, die nur in `tailwind.config.js` steht, muss dort von Hand nachgebaut werden und
läuft anschließend auseinander.

**Tailwind:** die semantischen Namen in `theme.extend.colors` eintragen und auf die
CSS-Variablen zeigen lassen — `brand: 'var(--color-brand)'`. Dadurch schaltet Tenant-Branding
zur Laufzeit um, ohne dass Tailwind neu gebaut wird.

**Migrationspfad im Bestand:** keine große Umstellung auf einmal. Tokens anlegen, alte Werte
als Alias beibehalten, dann Bildschirm für Bildschirm umstellen. Reihenfolge nach Sichtbarkeit:
öffentliche Buchungsseite → Kursliste → Dashboard → Backoffice.

---

## Offen / zu entscheiden

- **Geschlossen 09.09.2026:** Palette bestätigt. Seitenhintergrund bleibt warmer Sand
  `#F5F3EF`; die grünstichige Variante `#F3F5F1` wurde verworfen, weil sie Wärme kostet.
- Safran bleibt vorerst als einziges Signal außerhalb der Grünrampe, nur als Icon- und
  Textfarbe, nicht als Fläche.
- Dunkelmodus: aktuell nicht vorgesehen. Die Token-Struktur macht ihn später möglich,
  ohne dass etwas neu gebaut wird.
- Logo: das Herz-Symbol ist unverändert übernommen und nicht Teil dieser Entscheidung.
