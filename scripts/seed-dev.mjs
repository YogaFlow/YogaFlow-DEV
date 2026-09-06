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
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Nur dieses Projekt darf getroffen werden. Steht bewusst im Klartext im Code:
// eine Sperre, die man aus Versehen wegkonfigurieren kann, ist keine Sperre.
const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

const DEMO_SLUGS = ['demoalpha', 'demobeta'];
const DEMO_PASSWORT = 'DemoPasswort123!';

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
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

  // Ueber die Auth-Nutzer gehen, nicht ueber public.users: Ein abgebrochener Lauf
  // hinterlaesst Auth-Nutzer ohne Profil (die Tenant-Loeschung raeumt public.users
  // per Cascade weg, auth.users bleibt stehen). Deren E-Mail bleibt belegt, und das
  // Neuanlegen scheitert dann mit "already been registered" - genau so ist der
  // zweite Lauf am 2026-09-06 gescheitert.
  const nutzer = await demoAuthNutzer();
  for (const u of nutzer) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) {
      abbruch(
        'Auth-Nutzer ' + u.email + ' konnte nicht geloescht werden: ' + error.message + '\n' +
        '  Abbruch mit Absicht: Auf einer halb geleerten Datenbank weiterzumachen\n' +
        '  erzeugt einen Zustand, den niemand mehr durchschaut. Skript erneut starten.'
      );
    }
  }

  const { data: tenants, error } = await db.from('tenants').select('id, slug').in('slug', DEMO_SLUGS);
  if (error) abbruch('Studios konnten nicht gelesen werden: ' + error.message);
  for (const t of tenants) {
    const { error: e } = await db.from('tenants').delete().eq('id', t.id);
    if (e) abbruch('Studio ' + t.slug + ' konnte nicht geloescht werden: ' + e.message);
  }

  if (!nutzer.length && !tenants.length) console.log('  nichts vorhanden');
  else console.log('  ' + nutzer.length + ' Nutzer und ' + tenants.length + ' Studios entfernt');
}

async function nutzerAnlegen({ email, vorname, nachname, rolle, tenantId }) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORT,
    email_confirm: true, // Supabase-seitig bestaetigt; verschickt keine Mail
    user_metadata: { tenant_id: tenantId, role: rolle, first_name: vorname, last_name: nachname },
  });
  if (error) abbruch('Nutzer ' + email + ' konnte nicht angelegt werden: ' + error.message);

  // Der Trigger handle_new_user legt public.users an, setzt aber email_verified nicht.
  // Genau daran haengt der Zugang (siehe AuthContext.isEmailConfirmed) - ohne diesen
  // Schritt koennte sich kein einziger Demo-Nutzer anmelden.
  const { error: e2 } = await db
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', data.user.id);
  if (e2) abbruch('email_verified fuer ' + email + ' nicht setzbar: ' + e2.message);

  return data.user.id;
}

const NAMEN = [
  ['Anna', 'Andersen'],
  ['Ben', 'Berger'],
  ['Clara', 'Conrad'],
  ['David', 'Duerr'],
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

  const ownerId = await nutzerAnlegen({ email: slug + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id });
  const teacherId = await nutzerAnlegen({ email: slug + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id });
  console.log('  Owner und Lehrer angelegt (' + ownerId.slice(0, 8) + ', ' + teacherId.slice(0, 8) + ')');

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
        teacher_id: teacherId,
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
        user_id: teilnehmer[i],
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

  return { slug, name };
}

console.log('Ziel: ' + url);
console.log('Betroffene Studios: ' + DEMO_SLUGS.join(', ') + ' (nur diese)\n');

await aufraeumen();
const studios = [];
studios.push(await studioAnlegen({ name: 'Demo Alpha', slug: 'demoalpha', teilnehmerAnzahl: 6 }));
studios.push(await studioAnlegen({ name: 'Demo Beta', slug: 'demobeta', teilnehmerAnzahl: 4 }));

console.log('\nFertig. Anmeldung mit dem Passwort: ' + DEMO_PASSWORT + '\n');
for (const s of studios) {
  console.log('  ' + s.name);
  console.log('    https://' + s.slug + '.omlify-dev.de/auth');
  console.log('    lokal:  http://' + s.slug + '.localhost:5173/auth');
  console.log('    Owner:      ' + s.slug + '.owner@example.com');
  console.log('    Lehrer:     ' + s.slug + '.teacher@example.com');
  console.log('    Teilnehmer: ' + s.slug + '.teilnehmer1@example.com  (fortlaufend nummeriert)');
  console.log('');
}
