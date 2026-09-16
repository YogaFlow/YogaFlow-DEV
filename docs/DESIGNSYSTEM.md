# Omlify Designsystem v1 — Farben und Tokens

**Stand:** 16.09.2026 (v1.7 — Meta-Zeile der Kurszeile umbrechen) · **Status:** festgelegt
**Ablageort im Repo:** `docs/DESIGNSYSTEM.md`
**Zugehörig:** `claude/Entscheidung_02_Mobile_Strategie.md` (Tenant-Branding als Vorarbeit)

**v1.7:** Die Meta-Zeile der Kurszeile bricht um (höchstens zwei Zeilen) statt
mit Auslassungspunkten abzuschneiden.

**v1.6:** Kurszeilen zeigen keine Teilnehmerzahl (`n/max Plätze`). Die belegten
Plätze stehen nur auf der Kursdetailseite.

**v1.5:** Tenant-Branding ist umgesetzt. Ein Studio wählt eine Markenfarbe;
`deriveBrandTokens` leitet die fünf Tokens ab. Logo, Name und Kurzbeschreibung
laufen über `StudioMark`. Helle Farben sind nicht wählbar (`on-brand` bleibt Weiß).
Siehe Abschnitt Marke sowie Logo und Studiokopf.

**v1.4:** Anrede immer „du" (alle Rollen, App, Landingpage, Mails, Meldungen aus
Edge Functions und Datenbank-Funktionen). Kleingeschrieben; keine
Umlaut-Ersatzschreibung in Nutzertexten; im Nutzertext „Studio", nicht „Tenant".
Siehe Abschnitt Sprache.

**v1.3:** Alle Kurslisten nutzen `CourseRow`. Titel höchstens zwei Zeilen,
keine Beschreibung, keine Knöpfe und keine Teilnehmerzahl in der Zeile; die ganze Zeile öffnet die Kursdetailseite.
Aktionsleiste unten: eigener Zustand und genau eine Aktion, Knöpfe `rounded-full`, mind. 44 px.

**v1.2:** Safran als Rampe (`50`/`100`/`500`/`700`); jeder Safran-Text in `accent-text`
(`saffron-700`). `green-300` nie als Textfarbe. Text auf `brand`-Flächen nur in `on-brand`.
Kurszeilen: Datumsblock bzw. Zeit-Chip, Safran-Status über `AccentPill`.

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

**Zwingende Prüfung:** Die Studiofarbe braucht Kontrast ≥ 4,5:1 gegen `#FFFFFF` und
`#F5F3EF`. Geprüft im Client (`isBrandColorAllowed`) und in der Datenbank
(`yogaflow_private.is_brand_color_allowed`). Helle Farben sind nicht wählbar;
`--color-on-brand` bleibt Weiß.

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
| `--green-300` | `#A5C0B2` | Eukalyptus — Icons und Linien auf Dunkelgrün, nie Textfarbe |
| `--green-500` | `#4A7A69` | Salbei — zweite Aktion, Diagrammflächen, Kopf-Icons |
| `--green-600` | `#2F5A4E` | Tief-Salbei — Hauptaktion |
| `--green-800` | `#23443B` | Tanne — gedrückter Zustand, Text auf `green-50`/`100` |

Im Code heißt die Rampe `sage-*` (`--sage-50` …), weil `green` Tailwinds eigenes Grün überschreiben würde.

**Warum eine Rampe statt einzelner Grüntöne:** Jede Stufe hat eine Aufgabe. Sobald Grüntöne
frei gewählt werden, entstehen zwei Töne, die fast gleich aussehen, aber Unterschiedliches
bedeuten — und die Oberfläche wirkt matschig statt ruhig.

**Kontrastregeln:** Text auf `green-50`, `100` und `200` immer in `green-800`, nie in
`--color-text`. Text auf `green-600` und `800` immer in Weiß. `green-300` ist nie Textfarbe —
ca. 4,0:1 auf `green-600`, zu wenig für Text. Nur Icons und Linien auf Dunkelgrün.
**Text und Icons auf `brandSoft` nur in `brandOnSoft`, nie in `brand`.** Bei Studiofarben
knapp über 4,5:1 auf Weiß fällt `brand` auf der eigenen Soft-Fläche darunter.
**Erfolgsflächen:** Text auf `successSoft` in `text`, Icon in `success` — `success` auf
`successSoft` hat nur 4,32:1.

Die Grünrampe `sage-*` direkt nur noch für feste Omlify-Flächen (Meta-Icons Kursdetail,
Status „Angemeldet" in der Teilnehmerliste, Onboarding, Landingpage). Rollen-Pillen
Admin/Kursleitung nutzen `brandSoft`/`brandOnSoft`. Tailwind-Opazität (`bg-brandSoft/30`)
erzeugt bei `var()`-Farben kein CSS — nicht verwenden.

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

**Umsetzung.** Das Studio wählt **eine** Markenfarbe; `deriveBrandTokens`
(`src/design/brand.ts`) leitet die fünf Tokens ab: pressed = 25 % Richtung Schwarz,
soft = 13 % Farbe auf Weiß, on-soft = pressed, bis ≥ 4,5:1 gegen soft abgedunkelt,
on-brand Weiß. `#2F5A4E` liefert exakt die Standard-Tokens.

Kontrastregel: erlaubt nur ≥ 4,5:1 gegen `#FFFFFF` UND `#F5F3EF`. Geprüft im Client
(`isBrandColorAllowed`) und in der Datenbank (`yogaflow_private.is_brand_color_allowed`,
CHECK `tenants_brand_color_allowed`). Früher vorgesehen: bei zu heller Studiofarbe
automatisch auf dunkle Schrift umschalten. Das gilt nicht mehr: `on-brand` bleibt immer
Weiß, helle Farben sind nicht wählbar.

Voreinstellungen aus `BRAND_PRESETS`:

| Name | Hex |
|---|---|
| Salbei | `#2F5A4E` |
| Olive | `#5A6B2E` |
| Petrol | `#1F5F6B` |
| Nachtblau | `#2C4A7A` |
| Lavendel | `#5B4B8A` |
| Pflaume | `#6E3B5E` |
| Beere | `#A23B62` |
| Erde | `#6A4E3B` |
| Schiefer | `#3D4852` |

Salbei wird als `NULL` gespeichert (= Standard, zieht bei künftiger Änderung des
Standards mit). Terrakotta bewusst nicht — zu nah an `danger`.

Laufzeit: CSS-Variablen auf `<html>` (`src/lib/brandTheme.ts`), Cache pro Studio in
`localStorage` gegen Aufblitzen. Warn-, Status-, Safran-, Grund- und Textfarben
ändern sich nie.

**Text auf brand-Flächen nur in `on-brand`.** Rangfolge über Größe und Gewicht, nicht über
eine zweite Farbe — sonst bricht sie bei Tenant-Branding. Beispiel: Hero-Karte auf der Übersicht.

`text-onBrand` steht auch auf `bg-danger` (Badges, Dialoge). Unkritisch, weil `on-brand`
immer Weiß bleibt; ändert sich `on-brand` je, eigenes `on-danger` einführen.

**Konflikt, der dabei entsteht:** Erfolgsgrün und Markengrün sind im Standardfall dieselbe
Familie. Konsequenz: **Erfolg wird nicht über Farbe allein signalisiert.** Ein gebuchter Kurs
zeigt Häkchen plus Text („Gebucht"), nicht bloß eine grüne Fläche. Das ist ohnehin die
barrierefreiere Lösung.

### Akzent und Status (fest)

**Safran-Rampe** (fest — die Palette, aus der der Akzent schöpft)

| Token | Hex | Verwendung |
|---|---|---|
| `--saffron-50` | `#FBF6EC` | hellste Stufe |
| `--saffron-100` | `#F7EEDF` | weiche Fläche hinter Akzent |
| `--saffron-500` | `#B87A2E` | Icons, Rahmen |
| `--saffron-700` | `#8A5A1F` | jeder Safran-Text |

| Token | Wert | Verwendung |
|---|---|---|
| `--color-accent` | `var(--saffron-500)` | Icons, Rahmen |
| `--color-accent-soft` | `var(--saffron-100)` | weiche Fläche |
| `--color-accent-text` | `var(--saffron-700)` | jeder Safran-Text |
| `--color-success` | `#3F7A5E` | gebucht, bezahlt |
| `--color-success-soft` | `#E4F0E9` | |
| `--color-danger` | `#A8443A` | stornieren, löschen |
| `--color-danger-soft` | `#F6E5E2` | |

**Kontrastregel:** Safran als Text immer in `accent-text` (`saffron-700`) — auf Weiß, Sand
und `accent-soft`. `saffron-500` nur für Icons und Rahmen.

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

**Kurszeilen:**

- Alle Kurslisten nutzen `CourseRow`
  (`src/components/courses/CourseRow.tsx`). Aufbau: Datumsblock oder Zeit-Chip · Titel
  (höchstens zwei Zeilen) und Preis · Meta (höchstens zwei Zeilen, umbrechen statt `…`)
  · optional Status · Pfeil.
- In Kurszeilen keine Beschreibung, keine Knöpfe und keine Teilnehmerzahl
  (`n/max Plätze`). Die ganze Zeile öffnet die Kursdetailseite; die belegten
  Plätze stehen nur dort.
- Listen ohne Tagesgruppen: Datumsblock links (Wochentag / Tag / Monat),
  `brand-soft` / `brand-on-soft`, oben ausgerichtet.
- Listen mit Tagesgruppen: Uhrzeit als kompakter Chip links, so groß wie der Inhalt,
  oben ausgerichtet, nie auf Zeilenhöhe gestreckt. Endzeit als „bis HH:MM" in der
  Meta-Zeile.
- Safran-Status („noch N Plätze", Warteliste) immer über die Komponente `AccentPill`
  (`src/components/ui/AccentPill.tsx`), nie als bloßer Text.
- Übersicht für Teilnehmende: die Hero-Karte ist die eine betonte Fläche (Regel 3).

**Kursdetailseite:**

- Oben der Kurszustand (Abgesagt, Hat bereits begonnen, Ausgebucht, noch N Plätze,
  Dein Kurs). Unten in der Aktionsleiste der eigene Zustand (pro Termin, Angemeldet,
  Warteliste) und genau eine Aktion.
- Knöpfe dort einheitlich `rounded-full`, mind. 44 px. „Abmelden" mit Rahmen, nie
  gefüllt (Regel 7). Mobil fest am unteren Rand, ab `lg` sticky.
- Destruktive Verwaltungsaktionen (Kurs löschen) stehen als Textknopf in `danger`
  unter dem Inhalt, nie in der Aktionsleiste. Gefüllt in `danger` ist nur der
  endgültige Bestätigungsknopf im Dialog.

**Logo und Studiokopf:**

`StudioMark` (`src/components/branding/StudioMark.tsx`) ist die einzige Stelle für
„Logo oder Name". Logo PNG/JPG/WebP ≤ 1 MB, kein SVG (kann Skripte enthalten).
Anzeige je Ort schaltbar (Seitenleiste; Anmelde- und Beitrittsseite), Name neben
Logo wählbar, nie beides unsichtbar; Logo ohne sichtbaren Namen steht im `<h1>`
mit Studioname als `alt`, sonst `alt=""`. Ohne Logo: Name bzw. Herz-Kreis.
Kurzbeschreibung (≤ 140 Zeichen) ersetzt auf der Anmeldeseite den festen Untertitel.
Tab-Titel = Studioname (Apex: „Omlify – Yoga-Studio-Management"). Favicon: Logo nur
wenn Seitenverhältnis 0,8–1,25 und mindestens ein Logo-Schalter an; sonst Herz in
Studiofarbe; ohne Branding `public/favicon.svg`.

## Sprache

Omlify spricht immer mit „du" an — alle Rollen, App, Landingpage, Mails,
Meldungen aus Edge Functions und Datenbank-Funktionen. Entschieden 15.09.2026.

- Anrede kleingeschrieben (du, dich, dir, dein); am Satzanfang und in
  Überschriften groß.
- Unpersönliche Formen sind erlaubt („Bitte später erneut versuchen.").
- Keine Umlaut-Ersatzschreibung (ae/oe/ue) in Nutzertexten.
- Im Code heißt es „Studio", nicht „Tenant", sobald ein Text Nutzende erreicht.

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

**Ablage:** heute `src/design/tokens.ts` als reines TS-Objekt; `brand.ts` liest sie.
Später wandert die Datei nach `packages/core/src/design/tokens.ts`. Daraus werden erzeugt:

- CSS-Variablen für die Web-App. Laufzeitquelle bleibt `:root` in `src/index.css`,
  überschrieben durch `brandTheme.ts` (Tenant-Werte auf `<html>`)
- später ein Theme-Objekt für `apps/mobile` (React Native kennt keine CSS-Variablen)

**Warum eine plattformneutrale Quelle:** Nach Entscheidung 02 kommt die Expo-App in Monat 3.
Eine Palette, die nur in `tailwind.config.js` steht, muss dort von Hand nachgebaut werden und
läuft anschließend auseinander. `brand.ts` bleibt deshalb ohne DOM und ohne React.

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
- Seit 14.09.2026: Safran darf als weiche Fläche (`accent-soft`) erscheinen — für
  Hinweise, Warteliste, knappe Plätze. Nie als gefüllte Fläche in `saffron-500`, nie für
  eine Hauptaktion.
- Dunkelmodus: aktuell nicht vorgesehen. Die Token-Struktur macht ihn später möglich,
  ohne dass etwas neu gebaut wird.
- Logo: umgesetzt in v1.5. Ohne hochgeladenes Logo bleibt das Herz der Rückfall
  (Seitenleiste: Studioname; Anmelde- und Beitrittsseite: Herz-Kreis).
