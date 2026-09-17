#!/usr/bin/env node
/**
 * Setzt die DEV-Datenbank auf einen bekannten Testzustand zurueck.
 *
 * Warum es das gibt: Ohne Daten wird eine Testumgebung nicht benutzt, und von Hand
 * angelegte Testfaelle sind nach dem ersten kaputten Versuch weg. Dieses Skript
 * stellt in Sekunden denselben Ausgangspunkt her - fuer Abnahmen vor einem Release
 * und um nach einer riskanten Migration schnell wieder testen zu koennen.
 *
 * Verwendung:  npm run seed:dev
 *
 * Es fasst AUSSCHLIESSLICH die unten aufgefuehrten Demo-Studios an. Von Hand
 * angelegte Studios wie "teststudio" oder "yomita" bleiben unberuehrt.
 * Prod wird nie angefasst: URL und Service-Role-Key muessen auf das DEV-Projekt zeigen.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Nur dieses Projekt darf getroffen werden. Steht bewusst im Klartext im Code:
// eine Sperre, die man aus Versehen wegkonfigurieren kann, ist keine Sperre.
const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

const DEMO_SLUGS = ['demoalpha', 'demobeta', 'lotusgarten'];
const DEMO_PASSWORT = 'DemoPasswort123!';

function ladeEnv() {
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  if (!existsSync('.env')) return out;
  for (const zeile of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function abbruch(text) {
  console.error('\n  FEHLER: ' + text + '\n');
  process.exit(1);
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

const env = ladeEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) abbruch('VITE_SUPABASE_URL fehlt in .env');
if (!key) abbruch('SUPABASE_SERVICE_ROLE_KEY fehlt in .env (Supabase -> Settings -> API -> service_role)');

// Zwei unabhaengige Sperren: die URL und die im Schluessel eingebackene Projektkennung.
// Beide muessen auf DEV zeigen. Ein versehentlich eingetragener PROD-Wert faellt hier auf.
if (!url.includes(ERLAUBTE_REF)) {
  abbruch(
    'VITE_SUPABASE_URL zeigt nicht auf das DEV-Projekt.\n' +
    '  Erwartet: ' + ERLAUBTE_REF + '\n' +
    '  Gefunden: ' + url + '\n' +
    '  Dieses Skript loescht Daten und laeuft ausschliesslich gegen DEV.'
  );
}
const keyRef = refAusKey(key);
if (keyRef !== ERLAUBTE_REF) {
  abbruch('Der Service-Role-Key gehoert zum Projekt "' + keyRef + '", erwartet wird "' + ERLAUBTE_REF + '".');
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

/** Datum relativ zu heute, als YYYY-MM-DD. */
function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

/** Endzeit aus Start (HH:MM) plus Dauer in Minuten. */
function ende(start, dauerMin) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + dauerMin;
  return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function emailLokal(vorname, nachname) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  return (vorname + '.' + nachname)
    .toLowerCase()
    .replace(/[äöüßÄÖÜ]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-z0-9.]+/g, '');
}

/** Alle Auth-Nutzer mit Demo-Adressen, ueber alle Seiten der Admin-API. */
async function demoAuthNutzer() {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await db.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer konnten nicht gelesen werden: ' + error.message);
    for (const u of data.users) {
      if (DEMO_SLUGS.some((s) => (u.email ?? '').startsWith(s + '.'))) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function aufraeumen() {
  console.log('Alte Demo-Daten entfernen');

  // Reihenfolge seit dem Mehrfachmitgliedschafts-Umbau (11.09.2026): erst die
  // Studios, DANN die Auth-Nutzer. Grund: Das Loeschen eines Auth-Nutzers raeumt
  // sein public.users-Profil per Cascade (users_auth_user_id_fkey) mit weg. Beim
  // Owner greift dabei der Trigger prevent_last_owner_delete, solange der Mandant
  // noch andere Nutzer hat → "Database error deleting user". delete_tenant_complete
  // deaktiviert den Trigger gezielt und raeumt public.users per Cascade weg; danach
  // sind die Auth-Nutzer profillos und lassen sich gefahrlos loeschen.
  const { data: tenants, error } = await db.from('tenants').select('id, slug').in('slug', DEMO_SLUGS);
  if (error) abbruch('Studios konnten nicht gelesen werden: ' + error.message);
  for (const t of tenants) {
    const { error: e } = await db.rpc('delete_tenant_complete', { p_tenant_id: t.id });
    if (e) abbruch('Studio ' + t.slug + ' konnte nicht geloescht werden: ' + e.message);
  }

  // Danach die (jetzt profillosen) Auth-Nutzer. Ein abgebrochener Lauf oder das
  // Tenant-Loeschen hinterlaesst Auth-Nutzer ohne Profil; deren E-Mail bleibt belegt
  // und das Neuanlegen scheitert sonst mit "already been registered".
  const nutzer = await demoAuthNutzer();
  for (const u of nutzer) {
    const { error: e } = await db.auth.admin.deleteUser(u.id);
    if (e) {
      abbruch(
        'Auth-Nutzer ' + u.email + ' konnte nicht geloescht werden: ' + e.message + '\n' +
        '  Abbruch mit Absicht: Auf einer halb geleerten Datenbank weiterzumachen\n' +
        '  erzeugt einen Zustand, den niemand mehr durchschaut. Skript erneut starten.'
      );
    }
  }

  if (!nutzer.length && !tenants.length) console.log('  nichts vorhanden');
  else console.log('  ' + nutzer.length + ' Nutzer und ' + tenants.length + ' Studios entfernt');
}

async function nutzerAnlegen({ email, vorname, nachname, rolle, tenantId, strasse, hausnr, plz, stadt, telefon }) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORT,
    email_confirm: true, // Supabase-seitig bestaetigt; verschickt keine Mail
    user_metadata: {
      tenant_id: tenantId,
      role: rolle,
      first_name: vorname,
      last_name: nachname,
      street: strasse ?? null,
      house_number: hausnr ?? null,
      postal_code: plz ?? null,
      city: stadt ?? null,
      phone: telefon ?? null,
    },
  });
  if (error) abbruch('Nutzer ' + email + ' konnte nicht angelegt werden: ' + error.message);

  // Seit dem Mehrfachmitgliedschafts-Umbau (11.09.2026) ist public.users.id NICHT mehr
  // die Login-ID (auth.users.id), sondern eine eigene UUID; der Login steht in
  // auth_user_id. Das vom Trigger handle_new_user angelegte Profil deshalb ueber
  // auth_user_id aufloesen und dessen id verwenden. courses.teacher_id und
  // registrations.user_id zeigen auf public.users.id, nicht auf die Login-ID.
  const { data: profil, error: eProfil } = await db
    .from('users')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .single();
  if (eProfil || !profil) {
    abbruch('Profil fuer ' + email + ' nicht gefunden: ' + (eProfil?.message ?? 'keine Zeile'));
  }

  // Der Trigger handle_new_user legt public.users an, setzt aber email_verified nicht.
  // Genau daran haengt der Zugang (siehe AuthContext.isEmailConfirmed) - ohne diesen
  // Schritt koennte sich kein einziger Demo-Nutzer anmelden.
  const { error: e2 } = await db
    .from('users')
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      gdpr_consent: true,
      gdpr_consent_date: new Date().toISOString(),
    })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified fuer ' + email + ' nicht setzbar: ' + e2.message);

  return { id: profil.id, email, vorname, nachname, rolle };
}

const NAMEN = [
  ['Anna', 'Andersen'],
  ['Ben', 'Berger'],
  ['Clara', 'Conrad'],
  ['David', 'Dürr'],
  ['Eva', 'Engel'],
  ['Felix', 'Frank'],
];

// Alle Kurse werden zunaechst in der Zukunft angelegt: der Trigger
// prevent_past_course_registration verbietet Anmeldungen zu vergangenen Kursen.
// Die Vergangenheitskurse werden erst nach den Anmeldungen zurueckdatiert.
const KURS_VORLAGEN = [
  { titel: 'Hatha Yoga am Morgen', beschreibung: 'Ruhiger Start in den Tag.', zeit: '08:00', plaetze: 12, preis: 15.0, versatz: 3, rueckdatieren: null },
  { titel: 'Vinyasa Flow', beschreibung: 'Dynamische Abfolge fuer Geuebte.', zeit: '18:30', plaetze: 3, preis: 18.0, versatz: 5, rueckdatieren: null },
  { titel: 'Yin Yoga', beschreibung: 'Lange gehaltene Positionen.', zeit: '20:00', plaetze: 10, preis: 16.0, versatz: 12, rueckdatieren: null },
  { titel: 'Rueckenkurs', beschreibung: 'Kraeftigung fuer den unteren Ruecken.', zeit: '17:00', plaetze: 8, preis: 20.0, versatz: 4, rueckdatieren: -14 },
  { titel: 'Schwangerschaftsyoga', beschreibung: 'Sanfte Uebungen im zweiten Trimester.', zeit: '10:00', plaetze: 6, preis: 22.0, versatz: 6, rueckdatieren: -7 },
];

async function studioAnlegen({ name, slug, teilnehmerAnzahl }) {
  console.log('\nStudio "' + name + '" (' + slug + ')');

  const { data: tenant, error } = await db.from('tenants').insert({ name, slug }).select().single();
  if (error) abbruch('Studio ' + slug + ' konnte nicht angelegt werden: ' + error.message);

  const owner = await nutzerAnlegen({ email: slug + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id });
  const teacher = await nutzerAnlegen({ email: slug + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id });
  console.log('  Owner und Lehrer angelegt (' + owner.id.slice(0, 8) + ', ' + teacher.id.slice(0, 8) + ')');

  const teilnehmer = [];
  for (let i = 0; i < teilnehmerAnzahl; i++) {
    const [v, n] = NAMEN[i % NAMEN.length];
    teilnehmer.push(
      await nutzerAnlegen({
        email: slug + '.teilnehmer' + (i + 1) + '@example.com',
        vorname: v,
        nachname: n,
        rolle: 'user',
        tenantId: tenant.id,
      })
    );
  }
  console.log('  ' + teilnehmer.length + ' Teilnehmer angelegt');

  const kurse = [];
  for (const v of KURS_VORLAGEN) {
    const { data: kurs, error: e } = await db
      .from('courses')
      .insert({
        title: v.titel,
        description: v.beschreibung,
        date: tag(v.versatz),
        time: v.zeit,
        location: 'Studio ' + name,
        room: 'Raum 1',
        max_participants: v.plaetze,
        price: v.preis,
        teacher_id: teacher.id,
        tenant_id: tenant.id,
        duration: 60,
        frequency: 'one_time',
        status: 'active',
      })
      .select()
      .single();
    if (e) abbruch('Kurs "' + v.titel + '" konnte nicht angelegt werden: ' + e.message);
    kurse.push({ ...kurs, rueckdatieren: v.rueckdatieren });
  }
  console.log('  ' + kurse.length + ' Kurse angelegt');

  // Vinyasa Flow hat nur 3 Plaetze und bekommt bewusst mehr Anmeldungen,
  // damit der Wartelisten-Fall in der Abnahme ueberhaupt pruefbar ist.
  let angemeldet = 0;
  let warteliste = 0;
  for (const kurs of kurse) {
    const anzahl = kurs.max_participants === 3 ? teilnehmer.length : Math.min(2, teilnehmer.length);
    for (let i = 0; i < anzahl; i++) {
      const aufWarteliste = i >= kurs.max_participants;
      const { error: e } = await db.from('registrations').insert({
        course_id: kurs.id,
        user_id: teilnehmer[i].id,
        tenant_id: tenant.id,
        status: aufWarteliste ? 'waitlist' : 'registered',
        is_waitlist: aufWarteliste,
        waitlist_position: aufWarteliste ? i - kurs.max_participants + 1 : null,
      });
      if (e) {
        console.warn('  Anmeldung uebersprungen (' + kurs.title + '): ' + e.message);
        continue;
      }
      if (aufWarteliste) warteliste++;
      else angemeldet++;
    }
  }
  console.log('  ' + angemeldet + ' Anmeldungen, ' + warteliste + ' auf Warteliste');

  // Jetzt erst zurueckdatieren - der Trigger greift beim Anmelden, nicht beim Aendern.
  let vergangen = 0;
  for (const kurs of kurse) {
    if (kurs.rueckdatieren === null) continue;
    const { error: e } = await db.from('courses').update({ date: tag(kurs.rueckdatieren) }).eq('id', kurs.id);
    if (e) {
      console.warn('  Rueckdatierung fehlgeschlagen (' + kurs.title + '): ' + e.message);
      continue;
    }
    vergangen++;
  }
  console.log('  ' + vergangen + ' Kurse in die Vergangenheit verschoben');

  return {
    slug,
    name,
    logins: [
      '    Owner:      ' + slug + '.owner@example.com',
      '    Lehrer:     ' + slug + '.teacher@example.com',
      '    Teilnehmer: ' + slug + '.teilnehmer1@example.com  (fortlaufend nummeriert)',
    ],
  };
}

const LOTUSGARTEN = {
  name: 'Lotusgarten Yoga',
  slug: 'lotusgarten',
  tagline: 'Yoga im Herzen Heidelbergs',
  brandColor: '#2F5A4E',
  location: 'Hauptstraße 22, 69117 Heidelberg',
  stadt: 'Heidelberg',
  plz: '69117',
  owner: {
    vorname: 'Katharina',
    nachname: 'Berger',
    strasse: 'Plöck',
    hausnr: '42',
    telefon: '06221555101',
  },
  lehrer: [
    {
      vorname: 'Miriam',
      nachname: 'Schäfer',
      strasse: 'Untere Straße',
      hausnr: '18',
      telefon: '06221555102',
    },
    {
      vorname: 'Hannah',
      nachname: 'Krüger',
      strasse: 'Rohrbacher Straße',
      hausnr: '9',
      telefon: '06221555103',
    },
  ],
  teilnehmer: [
    { vorname: 'Sophie', nachname: 'Richter', strasse: 'Bergheimer Straße', hausnr: '61', plz: '69115', telefon: '01715551001' },
    { vorname: 'Emma', nachname: 'Wagner', strasse: 'Merianstraße', hausnr: '8', plz: '69117', telefon: '01715551002' },
    { vorname: 'Laura', nachname: 'Becker', strasse: 'Gaisbergstraße', hausnr: '14', plz: '69115', telefon: '01715551003' },
    { vorname: 'Julia', nachname: 'Hoffmann', strasse: 'Werderstraße', hausnr: '27', plz: '69120', telefon: '01715551004' },
    { vorname: 'Nina', nachname: 'Vogel', strasse: 'Kaiserstraße', hausnr: '5', plz: '69115', telefon: '01715551005' },
    { vorname: 'Clara', nachname: 'König', strasse: 'Rohrbacher Straße', hausnr: '33', plz: '69115', telefon: '01715551006' },
    { vorname: 'Anna', nachname: 'Neumann', strasse: 'Schröderstraße', hausnr: '12', plz: '69120', telefon: '01715551007' },
    { vorname: 'Marie', nachname: 'Hartmann', strasse: 'Plöck', hausnr: '7', plz: '69117', telefon: '01715551008' },
    { vorname: 'Johanna', nachname: 'Keller', strasse: 'Ladenburger Straße', hausnr: '21', plz: '69120', telefon: '01715551009' },
    { vorname: 'Paula', nachname: 'Brandt', strasse: 'Zähringer Straße', hausnr: '4', plz: '69115', telefon: '01715551010' },
    { vorname: 'Lisa', nachname: 'Meier', strasse: 'Handschuhsheimer Landstraße', hausnr: '56', plz: '69121', telefon: '01715551011' },
    { vorname: 'Franziska', nachname: 'Lehmann', strasse: 'Neuenheimer Landstraße', hausnr: '10', plz: '69120', telefon: '01715551012' },
  ],
};

/**
 * Jede Teilnehmerin hat eine andere Kurskombination.
 * Vinyasa Abend (6 Plaetze) und Ruecken-Yoga (4 Plaetze) sind voll und haben Warteliste.
 * Indizes beziehen sich auf LOTUSGARTEN.teilnehmer.
 */
const LOTUSGARTEN_ANMELDUNGEN = {
  hatha: [0, 1, 2, 3, 4, 5, 6],
  vinyasa: [0, 1, 2, 3, 4, 5],
  vinyasaWait: [6, 7, 8],
  yin: [1, 3, 7, 9],
  schwanger: [8, 10],
  ruecken: [2, 4, 9, 11],
  rueckenWait: [0, 7],
  meditation: [0, 3, 5, 8, 10],
  einsteiger: [11],
  park: [1, 2, 5, 6, 9, 10],
};

async function kursAnlegen({ tenantId, teacherId, titel, beschreibung, zeit, dauer, plaetze, preis, versatz, raum, frequency, seriesId, status }) {
  const { data: kurs, error } = await db
    .from('courses')
    .insert({
      title: titel,
      description: beschreibung,
      date: tag(versatz),
      time: zeit,
      end_time: ende(zeit, dauer),
      location: LOTUSGARTEN.location,
      room: raum,
      max_participants: plaetze,
      price: preis,
      teacher_id: teacherId,
      tenant_id: tenantId,
      duration: dauer,
      frequency,
      series_id: seriesId ?? null,
      status: status ?? 'active',
      prerequisites: 'Bitte eigene Matte mitbringen.',
    })
    .select()
    .single();
  if (error) abbruch('Kurs "' + titel + '" konnte nicht angelegt werden: ' + error.message);
  return kurs;
}

async function anmelden({ tenantId, courseId, userIds, waitlist = false, startPosition = 1 }) {
  let ok = 0;
  for (let i = 0; i < userIds.length; i++) {
    const { error } = await db.from('registrations').insert({
      course_id: courseId,
      user_id: userIds[i],
      tenant_id: tenantId,
      status: waitlist ? 'waitlist' : 'registered',
      is_waitlist: waitlist,
      waitlist_position: waitlist ? startPosition + i : null,
    });
    if (error) {
      console.warn('  Anmeldung uebersprungen: ' + error.message);
      continue;
    }
    ok++;
  }
  return ok;
}

async function lotusgartenAnlegen() {
  const { name, slug } = LOTUSGARTEN;
  console.log('\nStudio "' + name + '" (' + slug + ')');

  const { data: tenant, error } = await db
    .from('tenants')
    .insert({
      name,
      slug,
      tagline: LOTUSGARTEN.tagline,
      brand_color: LOTUSGARTEN.brandColor,
      default_max_participants: 12,
    })
    .select()
    .single();
  if (error) abbruch('Studio ' + slug + ' konnte nicht angelegt werden: ' + error.message);

  const person = async (p, rolle) =>
    nutzerAnlegen({
      email: slug + '.' + emailLokal(p.vorname, p.nachname) + '@example.com',
      vorname: p.vorname,
      nachname: p.nachname,
      rolle,
      tenantId: tenant.id,
      strasse: p.strasse,
      hausnr: p.hausnr,
      plz: p.plz ?? LOTUSGARTEN.plz,
      stadt: LOTUSGARTEN.stadt,
      telefon: p.telefon,
    });

  const owner = await person(LOTUSGARTEN.owner, 'owner');
  const miriam = await person(LOTUSGARTEN.lehrer[0], 'teacher');
  const hannah = await person(LOTUSGARTEN.lehrer[1], 'teacher');
  console.log('  Owner und zwei Lehrerinnen angelegt');

  const teilnehmer = [];
  for (const p of LOTUSGARTEN.teilnehmer) {
    teilnehmer.push(await person(p, 'user'));
  }
  console.log('  ' + teilnehmer.length + ' Teilnehmerinnen angelegt');

  const ids = (idx) => idx.map((i) => teilnehmer[i].id);
  const hathaSerie = randomUUID();

  const hatha = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Hatha Yoga am Morgen',
    beschreibung: 'Ruhiger Einstieg mit Sonnengrüßen, Haltungen und einer kurzen Entspannung. Geeignet für alle Levels.',
    zeit: '08:00',
    dauer: 75,
    plaetze: 12,
    preis: 16,
    versatz: 3,
    raum: 'Altbau',
    frequency: 'weekly',
    seriesId: hathaSerie,
  });
  // Zwei weitere Termine derselben Woche-Serie, noch ohne Anmeldungen.
  await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Hatha Yoga am Morgen',
    beschreibung: 'Ruhiger Einstieg mit Sonnengrüßen, Haltungen und einer kurzen Entspannung. Geeignet für alle Levels.',
    zeit: '08:00',
    dauer: 75,
    plaetze: 12,
    preis: 16,
    versatz: 10,
    raum: 'Altbau',
    frequency: 'weekly',
    seriesId: hathaSerie,
  });
  await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Hatha Yoga am Morgen',
    beschreibung: 'Ruhiger Einstieg mit Sonnengrüßen, Haltungen und einer kurzen Entspannung. Geeignet für alle Levels.',
    zeit: '08:00',
    dauer: 75,
    plaetze: 12,
    preis: 16,
    versatz: 17,
    raum: 'Altbau',
    frequency: 'weekly',
    seriesId: hathaSerie,
  });

  const vinyasa = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: hannah.id,
    titel: 'Vinyasa Flow am Abend',
    beschreibung: 'Dynamische Stunde, die Atem und Bewegung verbindet. Für Geübte, der Kurs ist bewusst klein gehalten.',
    zeit: '18:30',
    dauer: 90,
    plaetze: 6,
    preis: 18,
    versatz: 5,
    raum: 'Gartenraum',
    frequency: 'one_time',
  });

  const yin = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Yin Yoga',
    beschreibung: 'Lange gehaltene Positionen für Hüfte, Rücken und Schultern. Leise Stunde zum Runterkommen.',
    zeit: '19:45',
    dauer: 75,
    plaetze: 10,
    preis: 16,
    versatz: 8,
    raum: 'Altbau',
    frequency: 'one_time',
  });

  const schwanger = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: hannah.id,
    titel: 'Schwangerschaftsyoga',
    beschreibung: 'Sanfte Übungen, Atemarbeit und Entspannung ab dem zweiten Trimester. Mit Varianten für jedes Stadium.',
    zeit: '10:00',
    dauer: 60,
    plaetze: 6,
    preis: 22,
    versatz: 6,
    raum: 'Gartenraum',
    frequency: 'one_time',
  });

  const ruecken = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Rücken-Yoga',
    beschreibung: 'Kräftigung und Mobilisation für den unteren Rücken. Kleine Gruppe, damit individuell korrigiert werden kann.',
    zeit: '17:00',
    dauer: 60,
    plaetze: 4,
    preis: 20,
    versatz: 4,
    raum: 'Altbau',
    frequency: 'one_time',
  });

  const meditation = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: hannah.id,
    titel: 'Workshop Meditation und Achtsamkeit',
    beschreibung: 'Einführung in Sitzmeditation, Body-Scan und kurze Alltagsübungen. Offen für Einsteigerinnen.',
    zeit: '11:00',
    dauer: 120,
    plaetze: 12,
    preis: 35,
    versatz: 14,
    raum: 'Gartenraum',
    frequency: 'one_time',
  });

  const einsteiger = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: hannah.id,
    titel: 'Sanftes Yoga für Einsteigerinnen',
    beschreibung: 'Grundhaltungen, Atem und Ausrichtung ohne Leistungsdruck. Ideal für den Einstieg oder nach einer Pause.',
    zeit: '09:30',
    dauer: 60,
    plaetze: 10,
    preis: 14,
    versatz: 9,
    raum: 'Altbau',
    frequency: 'one_time',
  });

  const park = await kursAnlegen({
    tenantId: tenant.id,
    teacherId: miriam.id,
    titel: 'Yoga im Park',
    beschreibung: 'Offene Stunde an der Neckarwiese bei gutem Wetter. Matte und Decke nicht vergessen.',
    zeit: '10:00',
    dauer: 60,
    plaetze: 8,
    preis: 12,
    versatz: 2,
    raum: 'Neckarwiese',
    frequency: 'one_time',
  });

  console.log('  10 Kurstermine angelegt (Hatha als Serie, zwei volle Kurse mit Warteliste)');

  let angemeldet = 0;
  let warteliste = 0;
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: hatha.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.hatha) });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: vinyasa.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.vinyasa) });
  warteliste += await anmelden({ tenantId: tenant.id, courseId: vinyasa.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.vinyasaWait), waitlist: true });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: yin.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.yin) });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: schwanger.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.schwanger) });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: ruecken.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.ruecken) });
  warteliste += await anmelden({ tenantId: tenant.id, courseId: ruecken.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.rueckenWait), waitlist: true });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: meditation.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.meditation) });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: einsteiger.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.einsteiger) });
  angemeldet += await anmelden({ tenantId: tenant.id, courseId: park.id, userIds: ids(LOTUSGARTEN_ANMELDUNGEN.park) });
  console.log('  ' + angemeldet + ' Anmeldungen, ' + warteliste + ' auf Warteliste');

  const { error: ePark } = await db.from('courses').update({ date: tag(-8) }).eq('id', park.id);
  if (ePark) console.warn('  Rueckdatierung Yoga im Park fehlgeschlagen: ' + ePark.message);
  else console.log('  1 Kurs in die Vergangenheit verschoben (Yoga im Park)');

  return {
    slug,
    name,
    logins: [
      '    Owner:      ' + owner.email + '  (' + owner.vorname + ' ' + owner.nachname + ')',
      '    Lehrerin:   ' + miriam.email + '  (' + miriam.vorname + ' ' + miriam.nachname + ')',
      '    Lehrerin:   ' + hannah.email + '  (' + hannah.vorname + ' ' + hannah.nachname + ')',
      '    Teilnehmerin z. B.: ' + teilnehmer[0].email + '  (' + teilnehmer[0].vorname + ' ' + teilnehmer[0].nachname + ')',
    ],
  };
}

console.log('Ziel: ' + url);
console.log('Betroffene Studios: ' + DEMO_SLUGS.join(', ') + ' (nur diese)\n');

await aufraeumen();
const studios = [];
studios.push(await studioAnlegen({ name: 'Demo Alpha', slug: 'demoalpha', teilnehmerAnzahl: 6 }));
studios.push(await studioAnlegen({ name: 'Demo Beta', slug: 'demobeta', teilnehmerAnzahl: 4 }));
studios.push(await lotusgartenAnlegen());

console.log('\nFertig. Anmeldung mit dem Passwort: ' + DEMO_PASSWORT + '\n');
for (const s of studios) {
  console.log('  ' + s.name);
  console.log('    https://' + s.slug + '.omlify-dev.de/auth');
  console.log('    lokal:  http://' + s.slug + '.localhost:5173/auth');
  for (const zeile of s.logins) console.log(zeile);
  console.log('');
}
