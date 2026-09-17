#!/usr/bin/env node
/**
 * Legt den Schaufenster-Mandanten "Studio Sonnengruß" in der DEV-Datenbank an.
 *
 * Warum ein eigenes Skript: scripts/seed-dev.mjs löscht bei jedem Lauf die
 * Studios in DEMO_SLUGS (demoalpha, demobeta). Dieser Mandant darf dort nicht
 * hinein, sonst ist er beim nächsten npm run seed:dev weg.
 *
 * Verwendung:  node scripts/seed-showcase.mjs
 *              node scripts/seed-showcase.mjs --reset
 *
 * Es fasst AUSSCHLIESSLICH den Slug "sonnengruss" an. Andere Mandanten werden
 * weder gelesen noch verändert noch gelöscht.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Nur dieses Projekt darf getroffen werden. Steht bewusst im Klartext im Code:
// eine Sperre, die man aus Versehen wegkonfigurieren kann, ist keine Sperre.
const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

const SLUG = 'sonnengruss';
const STUDIO_NAME = 'Studio Sonnengruß';
const PASSWORT = 'Sonnengruss2026!';
const STANDORT = 'Studio Sonnengruß';

const INHABERIN = { vorname: 'Sabine', nachname: 'Krüger', emailPraefix: 'inhaberin', rolle: 'owner' };
const LENA = { vorname: 'Lena', nachname: 'Hoffmann', emailPraefix: 'lena', rolle: 'teacher' };
const MARIE = { vorname: 'Marie', nachname: 'Schuster', emailPraefix: 'marie', rolle: 'teacher' };

const TEILNEHMER = [
  { vorname: 'Julia', nachname: 'Weber' },
  { vorname: 'Sophie', nachname: 'Lang' },
  { vorname: 'Nina', nachname: 'Baumann' },
  { vorname: 'Katharina', nachname: 'Roth' },
  { vorname: 'Jonas', nachname: 'Weber' },
  { vorname: 'Paul', nachname: 'Neumann' },
  { vorname: 'Laura', nachname: 'Hartmann' },
  { vorname: 'Elif', nachname: 'Demir' },
];

const KURSE = [
  {
    schluessel: 'hatha',
    titel: 'Hatha Yoga',
    beschreibung: 'Klassische Haltungen und ruhiges Atmen, ohne Eile und ohne Leistungsdruck.',
    versatz: 1,
    zeit: '08:00',
    plaetze: 12,
    preis: 16,
    lehrerin: 'lena',
    dauer: 60,
    raum: 'Raum 1',
  },
  {
    schluessel: 'vinyasa',
    titel: 'Vinyasa Flow',
    beschreibung: 'Atem und Bewegung fließen in einer dynamischen Stunde zusammen.',
    versatz: 1,
    zeit: '18:30',
    plaetze: 14,
    preis: 18,
    lehrerin: 'lena',
    dauer: 60,
    raum: 'Raum 2',
  },
  {
    schluessel: 'yin',
    titel: 'Yin Yoga',
    beschreibung: 'Lange gehaltene Positionen, die tief ins Bindegewebe wirken.',
    versatz: 2,
    zeit: '20:00',
    plaetze: 10,
    preis: 16,
    lehrerin: 'marie',
    dauer: 75,
    raum: 'Raum 2',
  },
  {
    schluessel: 'ruecken',
    titel: 'Rückenyoga',
    beschreibung: 'Kräftigung und Entlastung für den unteren Rücken, klar angeleitet.',
    versatz: 3,
    zeit: '17:00',
    plaetze: 10,
    preis: 20,
    lehrerin: 'marie',
    dauer: 60,
    raum: 'Raum 1',
  },
  {
    schluessel: 'ashtanga',
    titel: 'Ashtanga Yoga',
    beschreibung: 'Die Primärserie in festem Rhythmus, mit Blickpunkten und ruhigem Atem.',
    versatz: 5,
    zeit: '07:30',
    plaetze: 8,
    preis: 19,
    lehrerin: 'lena',
    dauer: 60,
    raum: 'Raum 1',
  },
  {
    schluessel: 'schwanger',
    titel: 'Schwangerschaftsyoga',
    beschreibung: 'Sanfte Übungen für Becken und Atmung im zweiten und dritten Trimester.',
    versatz: 6,
    zeit: '10:00',
    plaetze: 6,
    preis: 22,
    lehrerin: 'marie',
    dauer: 60,
    raum: 'Raum 1',
  },
  {
    schluessel: 'power',
    titel: 'Power Yoga',
    beschreibung: 'Kraftvolle Stunde mit Halt, Schwung und einem klaren Abschluss.',
    versatz: 8,
    zeit: '19:00',
    plaetze: 12,
    preis: 18,
    lehrerin: 'lena',
    dauer: 60,
    raum: 'Raum 2',
  },
  {
    schluessel: 'kundalini',
    titel: 'Kundalini Yoga',
    beschreibung: 'Bewegungsfolgen, Mantra und Atemtechniken für Klarheit und innere Wärme.',
    versatz: 10,
    zeit: '18:00',
    plaetze: 10,
    preis: 17,
    lehrerin: 'marie',
    dauer: 60,
    raum: 'Raum 2',
  },
  {
    schluessel: 'restorative',
    titel: 'Restorative Yoga',
    beschreibung: 'Gestützte Positionen zum Nachgeben, mit Decken und Kissen.',
    versatz: 13,
    zeit: '20:15',
    plaetze: 12,
    preis: 16,
    lehrerin: 'lena',
    dauer: 75,
    raum: 'Raum 2',
  },
];

// Indizes beziehen sich auf TEILNEHMER. Lena nur bei Maries Kursen.
// Belegung: kein Kurs voll, genau Schwangerschaftsyoga bei noch 2 Plätzen,
// übrige Kurse zwischen einem Drittel und zwei Dritteln.
const ANMELDUNGEN = {
  hatha: { lena: false, teilnehmer: [0, 1, 2, 3, 4, 5] },
  vinyasa: { lena: false, teilnehmer: [0, 1, 2, 3, 4, 6, 7] },
  yin: { lena: true, teilnehmer: [1, 2, 5, 6, 7] },
  ruecken: { lena: true, teilnehmer: [0, 3, 4, 7] },
  ashtanga: { lena: false, teilnehmer: [0, 2, 5, 6] },
  schwanger: { lena: false, teilnehmer: [1, 3, 6, 7] },
  power: { lena: false, teilnehmer: [0, 1, 4, 5, 6, 7] },
  kundalini: { lena: true, teilnehmer: [2, 4, 5, 6] },
  restorative: { lena: false, teilnehmer: [1, 2, 3, 4, 6, 7] },
};

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

function emailFuer(praefix) {
  return SLUG + '.' + praefix + '@example.com';
}

function nameVon(person) {
  return person.vorname + ' ' + person.nachname;
}

/** Kalendertag in Europe/Berlin plus Versatz, als YYYY-MM-DD. */
function tag(versatzTage) {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const wert = (typ) => Number(teile.find((t) => t.type === typ).value);
  const d = new Date(Date.UTC(wert('year'), wert('month') - 1, wert('day') + versatzTage));
  return d.toISOString().slice(0, 10);
}

function endzeit(start, dauerMinuten) {
  const [stunden, minuten] = start.split(':').map(Number);
  const total = stunden * 60 + minuten + dauerMinuten;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');
}

const env = ladeEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) abbruch('VITE_SUPABASE_URL fehlt in .env');
if (!key) abbruch('SUPABASE_SERVICE_ROLE_KEY fehlt in .env (Supabase -> Settings -> API -> service_role)');

// Zwei unabhängige Sperren: die URL und die im Schlüssel eingebackene Projektkennung.
// Beide müssen auf DEV zeigen. Ein versehentlich eingetragener PROD-Wert fällt hier auf.
if (!url.includes(ERLAUBTE_REF)) {
  abbruch(
    'VITE_SUPABASE_URL zeigt nicht auf das DEV-Projekt.\n' +
    '  Erwartet: ' + ERLAUBTE_REF + '\n' +
    '  Gefunden: ' + url + '\n' +
    '  Dieses Skript schreibt Daten und läuft ausschließlich gegen DEV.'
  );
}
const keyRef = refAusKey(key);
if (keyRef !== ERLAUBTE_REF) {
  abbruch('Der Service-Role-Key gehört zum Projekt "' + keyRef + '", erwartet wird "' + ERLAUBTE_REF + '".');
}

const argumente = process.argv.slice(2);
const reset = argumente.includes('--reset');
const unbekannt = argumente.filter((a) => a !== '--reset');
if (unbekannt.length) abbruch('Unbekanntes Argument: ' + unbekannt.join(', ') + '\n  Erlaubt ist nur --reset.');

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function tenantNachSlug() {
  const { data, error } = await db.from('tenants').select('id, slug').eq('slug', SLUG).maybeSingle();
  if (error) abbruch('Mandant konnte nicht gelesen werden: ' + error.message);
  return data;
}

/** Alle Auth-Nutzer mit Sonnengruß-Adressen, über alle Seiten der Admin-API. */
async function showcaseAuthNutzer() {
  const treffer = [];
  const praefix = SLUG + '.';
  for (let seite = 1; ; seite++) {
    const { data, error } = await db.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer konnten nicht gelesen werden: ' + error.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(praefix)) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function aufraeumen() {
  console.log('Alten Schaufenster-Mandanten entfernen (' + SLUG + ')');

  // Über die Auth-Nutzer gehen, nicht über public.users: Ein abgebrochener Lauf
  // hinterlässt Auth-Nutzer ohne Profil (die Tenant-Löschung räumt public.users
  // per Cascade weg, auth.users bleibt stehen). Deren E-Mail bleibt belegt, und das
  // Neuanlegen scheitert dann mit "already been registered".
  const nutzer = await showcaseAuthNutzer();
  for (const u of nutzer) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) {
      abbruch(
        'Auth-Nutzer ' + u.email + ' konnte nicht gelöscht werden: ' + error.message + '\n' +
        '  Abbruch mit Absicht: Auf einer halb geleerten Datenbank weiterzumachen\n' +
        '  erzeugt einen Zustand, den niemand mehr durchschaut. Skript erneut mit --reset starten.'
      );
    }
  }

  const tenant = await tenantNachSlug();
  if (tenant) {
    const { error: e } = await db.from('tenants').delete().eq('id', tenant.id);
    if (e) abbruch('Studio ' + tenant.slug + ' konnte nicht gelöscht werden: ' + e.message);
  }

  if (!nutzer.length && !tenant) console.log('  nichts vorhanden');
  else console.log('  ' + nutzer.length + ' Nutzer und ' + (tenant ? 1 : 0) + ' Studio entfernt');
}

async function nutzerAnlegen({ email, vorname, nachname, rolle, tenantId }) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORT,
    email_confirm: true, // Supabase-seitig bestätigt; verschickt keine Mail
    user_metadata: { tenant_id: tenantId, role: rolle, first_name: vorname, last_name: nachname },
  });
  if (error) abbruch('Nutzer ' + email + ' konnte nicht angelegt werden: ' + error.message);

  // Der Trigger handle_new_user legt public.users an, setzt aber email_verified nicht.
  // Genau daran hängt der Zugang (siehe AuthContext.isEmailConfirmed) - ohne diesen
  // Schritt könnte sich kein einziger Schaufenster-Nutzer anmelden.
  const { error: e2 } = await db
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', data.user.id);
  if (e2) abbruch('email_verified für ' + email + ' nicht setzbar: ' + e2.message);

  return data.user.id;
}

async function anmelden({ courseId, userId, tenantId, kursTitel, wer }) {
  const { error } = await db.from('registrations').insert({
    course_id: courseId,
    user_id: userId,
    tenant_id: tenantId,
    status: 'registered',
    is_waitlist: false,
    waitlist_position: null,
  });
  if (error) abbruch('Anmeldung von ' + wer + ' zu "' + kursTitel + '" fehlgeschlagen: ' + error.message);
}

const bestehend = await tenantNachSlug();
if (bestehend && !reset) {
  abbruch(
    'Mandant "' + SLUG + '" existiert bereits.\n' +
    '  Neu anlegen mit: node scripts/seed-showcase.mjs --reset\n' +
    '  --reset löscht nur diesen einen Mandanten und Auth-Nutzer, deren E-Mail mit "' + SLUG + '." beginnt.'
  );
}

console.log('Ziel: DEV (' + ERLAUBTE_REF + ')');
console.log('Betroffener Mandant: ' + SLUG + ' (nur dieser)\n');

if (reset) await aufraeumen();

console.log('\nStudio "' + STUDIO_NAME + '" (' + SLUG + ')');

const { data: tenant, error: tenantFehler } = await db
  .from('tenants')
  .insert({ name: STUDIO_NAME, slug: SLUG })
  .select()
  .single();
if (tenantFehler) abbruch('Studio ' + SLUG + ' konnte nicht angelegt werden: ' + tenantFehler.message);

const inhaberinId = await nutzerAnlegen({
  email: emailFuer(INHABERIN.emailPraefix),
  vorname: INHABERIN.vorname,
  nachname: INHABERIN.nachname,
  rolle: INHABERIN.rolle,
  tenantId: tenant.id,
});
const lenaId = await nutzerAnlegen({
  email: emailFuer(LENA.emailPraefix),
  vorname: LENA.vorname,
  nachname: LENA.nachname,
  rolle: LENA.rolle,
  tenantId: tenant.id,
});
const marieId = await nutzerAnlegen({
  email: emailFuer(MARIE.emailPraefix),
  vorname: MARIE.vorname,
  nachname: MARIE.nachname,
  rolle: MARIE.rolle,
  tenantId: tenant.id,
});
console.log('  Inhaberin und zwei Lehrerinnen angelegt');

const lehrerIds = { lena: lenaId, marie: marieId };
const konten = [
  { ...INHABERIN, email: emailFuer(INHABERIN.emailPraefix), id: inhaberinId },
  { ...LENA, email: emailFuer(LENA.emailPraefix), id: lenaId },
  { ...MARIE, email: emailFuer(MARIE.emailPraefix), id: marieId },
];

const teilnehmerIds = [];
for (let i = 0; i < TEILNEHMER.length; i++) {
  const person = TEILNEHMER[i];
  const email = emailFuer('teilnehmer' + (i + 1));
  const id = await nutzerAnlegen({
    email,
    vorname: person.vorname,
    nachname: person.nachname,
    rolle: 'user',
    tenantId: tenant.id,
  });
  teilnehmerIds.push(id);
  konten.push({ ...person, emailPraefix: 'teilnehmer' + (i + 1), rolle: 'user', email, id });
}
console.log('  ' + teilnehmerIds.length + ' Teilnehmer angelegt');

const angelegteKurse = [];
for (const v of KURSE) {
  const teacherId = lehrerIds[v.lehrerin];
  if (!teacherId) abbruch('Keine Lehrerin für Kurs "' + v.titel + '"');
  const { data: kurs, error: e } = await db
    .from('courses')
    .insert({
      title: v.titel,
      description: v.beschreibung,
      date: tag(v.versatz),
      time: v.zeit,
      end_time: endzeit(v.zeit, v.dauer),
      location: STANDORT,
      room: v.raum,
      max_participants: v.plaetze,
      price: v.preis,
      teacher_id: teacherId,
      tenant_id: tenant.id,
      duration: v.dauer,
      frequency: 'one_time',
      status: 'active',
    })
    .select()
    .single();
  if (e) abbruch('Kurs "' + v.titel + '" konnte nicht angelegt werden: ' + e.message);
  angelegteKurse.push({ ...kurs, schluessel: v.schluessel, plaetze: v.plaetze });
}
console.log('  ' + angelegteKurse.length + ' Kurse angelegt');

let anmeldungen = 0;
for (const kurs of angelegteKurse) {
  const plan = ANMELDUNGEN[kurs.schluessel];
  if (!plan) abbruch('Keine Anmeldungsplanung für "' + kurs.title + '"');
  if (plan.lena) {
    await anmelden({
      courseId: kurs.id,
      userId: lenaId,
      tenantId: tenant.id,
      kursTitel: kurs.title,
      wer: nameVon(LENA),
    });
    anmeldungen++;
  }
  for (const index of plan.teilnehmer) {
    const person = TEILNEHMER[index];
    if (!person) abbruch('Teilnehmer-Index ' + index + ' ungültig bei "' + kurs.title + '"');
    await anmelden({
      courseId: kurs.id,
      userId: teilnehmerIds[index],
      tenantId: tenant.id,
      kursTitel: kurs.title,
      wer: nameVon(person),
    });
    anmeldungen++;
  }
}
console.log('  ' + anmeldungen + ' Anmeldungen');

const { count: mandantenGesamt, error: countTenantsFehler } = await db
  .from('tenants')
  .select('id', { count: 'exact', head: true });
if (countTenantsFehler) abbruch('Mandanten konnten nicht gezählt werden: ' + countTenantsFehler.message);

const { count: nutzerAnzahl, error: countUsersFehler } = await db
  .from('users')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenant.id);
if (countUsersFehler) abbruch('Nutzer konnten nicht gezählt werden: ' + countUsersFehler.message);

const { data: kurseNachher, error: kurseFehler } = await db
  .from('courses')
  .select('id, title, date, time, max_participants, teacher_id')
  .eq('tenant_id', tenant.id)
  .order('date', { ascending: true })
  .order('time', { ascending: true });
if (kurseFehler) abbruch('Kurse konnten nicht nachgezählt werden: ' + kurseFehler.message);

const { data: regsNachher, error: regsFehler } = await db
  .from('registrations')
  .select('id, course_id, user_id, status, is_waitlist, waitlist_position')
  .eq('tenant_id', tenant.id);
if (regsFehler) abbruch('Anmeldungen konnten nicht nachgezählt werden: ' + regsFehler.message);

const belegung = kurseNachher.map((kurs) => {
  const regs = regsNachher.filter((r) => r.course_id === kurs.id && r.status === 'registered');
  return {
    titel: kurs.title,
    datum: kurs.date,
    zeit: String(kurs.time).slice(0, 5),
    belegt: regs.length,
    plaetze: kurs.max_participants,
    frei: kurs.max_participants - regs.length,
  };
});

const volle = belegung.filter((b) => b.frei <= 0);
const nochZwei = belegung.filter((b) => b.frei === 2);
if (volle.length) abbruch('Mindestens ein Kurs ist voll: ' + volle.map((b) => b.titel).join(', '));
if (nochZwei.length !== 1 || nochZwei[0].titel !== 'Schwangerschaftsyoga') {
  abbruch(
    'Genau ein Kurs muss bei "noch 2 Plätze" stehen (Schwangerschaftsyoga). Gefunden: ' +
    (nochZwei.map((b) => b.titel + ' ' + b.belegt + '/' + b.plaetze).join(', ') || 'keiner')
  );
}

const yin = belegung.find((b) => b.titel === 'Yin Yoga');
if (!yin || yin.belegt !== 6 || yin.plaetze !== 10) {
  abbruch('Yin Yoga muss 6/10 stehen, gefunden: ' + (yin ? yin.belegt + '/' + yin.plaetze : 'kein Kurs'));
}

const lenaKurse = kurseNachher.filter((k) => k.teacher_id === lenaId);
const marieKurse = kurseNachher.filter((k) => k.teacher_id === marieId);
if (lenaKurse.length !== 5) abbruch('Lena muss 5 Kurse haben, gefunden: ' + lenaKurse.length);
if (marieKurse.length !== 4) abbruch('Marie muss 4 Kurse haben, gefunden: ' + marieKurse.length);
if (regsNachher.length !== 49) abbruch('Es müssen 49 Anmeldungen sein, gefunden: ' + regsNachher.length);

const lenaRegs = regsNachher.filter((r) => r.user_id === lenaId);
if (lenaRegs.length !== 3) {
  abbruch('Lena muss genau 3 Anmeldungen haben, gefunden: ' + lenaRegs.length);
}

const lenaKursTitel = lenaRegs.map((r) => {
  const kurs = kurseNachher.find((k) => k.id === r.course_id);
  return kurs ? kurs.title : r.course_id;
});
const erwartetLenaTitel = ['Kundalini Yoga', 'Rückenyoga', 'Yin Yoga'];
const gefundenLenaTitel = lenaKursTitel.slice().sort();
if (gefundenLenaTitel.join('|') !== erwartetLenaTitel.join('|')) {
  abbruch('Lenas Anmeldungen müssen Yin, Rückenyoga und Kundalini sein, gefunden: ' + lenaKursTitel.join(', '));
}

console.log('\n========================================');
console.log('Schaufenster-Mandant — Anmeldung');
console.log('========================================');
console.log('Studio:     ' + STUDIO_NAME);
console.log('Slug:       ' + SLUG);
console.log('Adresse:    https://sonnengruss.omlify-dev.de/auth');
console.log('Lokal:      http://sonnengruss.localhost:5173/auth');
console.log('DEV-Query:  http://127.0.0.1:5173/auth?tenant=sonnengruss');
console.log('Passwort:   ' + PASSWORT);
console.log('');
console.log('Konten:');
for (const k of konten) {
  console.log('  ' + k.rolle.padEnd(8) + '  ' + nameVon(k).padEnd(22) + '  ' + k.email);
}
console.log('');
console.log('*** KONTO FÜR DEN SCREENSHOT ***');
console.log('  Name:    ' + nameVon(LENA));
console.log('  Rolle:   Kursleitung (teacher)');
console.log('  E-Mail:  ' + emailFuer(LENA.emailPraefix));
console.log('  Passwort:' + ' ' + PASSWORT);
console.log('');
console.log('Kurse:');
for (const b of belegung) {
  console.log('  ' + b.datum + '  ' + b.zeit + '  ' + b.titel.padEnd(22) + '  ' + b.belegt + '/' + b.plaetze);
}
console.log('========================================');
console.log('Nachzählung gegen die Datenbank');
console.log('  Mandanten gesamt:           ' + mandantenGesamt);
console.log('  Nutzer in diesem Mandanten: ' + nutzerAnzahl);
console.log('  Kurse:                      ' + kurseNachher.length);
console.log('  Kurse von Lena:             ' + lenaKurse.length + '  (' + lenaKurse.map((k) => k.title).join(', ') + ')');
console.log('  Kurse von Marie:            ' + marieKurse.length + '  (' + marieKurse.map((k) => k.title).join(', ') + ')');
console.log('  Anmeldungen:                ' + regsNachher.length);
console.log('  Anmeldungen von Lena:       ' + lenaRegs.length + '  (' + lenaKursTitel.join(', ') + ')');
console.log('========================================\n');
