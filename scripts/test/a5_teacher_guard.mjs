/**
 * A5 — Lehrer-Guard auf courses (nur DEV).
 *
 * Nicht ausführen, bevor 20260928170000_a5_courses_teacher_guard.sql auf DEV
 * liegt. Gegen PROD nie. Eigenes Studio `a5teachguard`, am Ende
 * delete_tenant_complete. Zweites Studio `a5teachguardb` für fremdes Profil.
 *
 * Fälle:
 *  1) Lehrende ändert Titel des eigenen Kurses → ok
 *  2) Lehrende setzt teacher_id auf andere Person → verweigert (RLS oder
 *     INVALID_TEACHER aus courses_teacher_guard_hotfix, läuft vor WITH CHECK)
 *  3) Owner setzt teacher_id auf andere Lehrerin → ok
 *  4) Owner setzt teacher_id auf Teilnehmerin → INVALID_TEACHER
 *  5) Owner setzt teacher_id auf Profil fremdes Studio → INVALID_TEACHER
 *  6) Lehrende legt Kurs mit fremder Kursleitung an → verweigert;
 *     mit sich selbst → ok
 *
 * Verwendung: node scripts/test/a5_teacher_guard.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a5teachguard';
const SLUG_B = 'a5teachguardb';
const TITLE = 'A5_TEACHER_GUARD';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let devOk = false;

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function seedPasswort() {
  const src = readFileSync(join(root, 'scripts', 'seed-dev.mjs'), 'utf8');
  const pass = src.match(/const DEMO_PASSWORT = '([^']+)'/);
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  return pass[1];
}

function abbruch(text) {
  const fehler = new Error(text);
  fehler.abbruch = true;
  throw fehler;
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

function clientMitTenant(url, key, slug = SLUG) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', slug);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function login(url, anon, email, password, slug = SLUG) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function authNutzer(admin, slugPrefix) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(slugPrefix + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  for (const slug of [SLUG, SLUG_B]) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen: ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen: ' + e.message);
    }
    for (const u of await authNutzer(admin, slug)) {
      const { error: e } = await admin.auth.admin.deleteUser(u.id);
      if (e) abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
    }
  }
}

async function nutzerAnlegen(admin, { email, vorname, nachname, rolle, tenantId, password }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { tenant_id: tenantId, first_name: vorname, last_name: nachname },
    app_metadata: { role: rolle },
  });
  if (error) abbruch('Nutzer ' + email + ': ' + error.message);

  const { data: profil, error: eProfil } = await admin
    .from('users')
    .select('id, email, role, tenant_id')
    .eq('auth_user_id', data.user.id)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified ' + email + ': ' + e2.message);
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

function istInvalidTeacher(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  return /INVALID_TEACHER/i.test(text);
}

function istRlsVerweigert(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /42501|row-level security|RLS/i.test(text);
}

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  devOk = true;

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  await resteEntfernen(admin);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A5 Lehrer-Guard', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio A anlegen: ' + tErr.message);

  const { data: tenantB, error: tBErr } = await admin
    .from('tenants')
    .insert({ name: 'A5 Lehrer-Guard B', slug: SLUG_B })
    .select('id')
    .single();
  if (tBErr) abbruch('Studio B anlegen: ' + tBErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olivia',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenant.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Tom',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const teacher2 = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher2@example.com',
    vorname: 'Tina',
    nachname: 'Teacher2',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const teilnehmer = await nutzerAnlegen(admin, {
    email: SLUG + '.user@example.com',
    vorname: 'Ute',
    nachname: 'User',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const fremdOwner = await nutzerAnlegen(admin, {
    email: SLUG_B + '.owner@example.com',
    vorname: 'Fremd',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenantB.id,
    password,
  });
  const fremdTeacher = await nutzerAnlegen(admin, {
    email: SLUG_B + '.teacher@example.com',
    vorname: 'Fremd',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenantB.id,
    password,
  });
  void fremdOwner;

  const { data: kurs, error: kErr } = await admin
    .from('courses')
    .insert({
      tenant_id: tenant.id,
      title: TITLE,
      description: 'A5 Lehrer-Guard Testkurs mit genug Text.',
      date: tag(7),
      time: '18:00:00',
      end_time: '19:00:00',
      duration: 60,
      location: 'Studio A',
      max_participants: 10,
      price: 15,
      teacher_id: teacher.id,
      status: 'active',
    })
    .select('id, title, teacher_id')
    .single();
  if (kErr) abbruch('Kurs anlegen: ' + kErr.message);

  const clientTeacher = await login(url, anon, SLUG + '.teacher@example.com', password);
  const clientOwner = await login(url, anon, SLUG + '.owner@example.com', password);

  // 1) Lehrende ändert Titel
  {
    const { data, error } = await clientTeacher
      .from('courses')
      .update({ title: TITLE + '_EDIT' })
      .eq('id', kurs.id)
      .select('id, title');
    ok('Lehrende Titel ok', !error && (data?.length ?? 0) === 1 && data[0].title === TITLE + '_EDIT', error?.message);
  }

  // 2) Lehrende setzt teacher_id auf andere Person → RLS
  {
    const { data, error } = await clientTeacher
      .from('courses')
      .update({ teacher_id: teacher2.id })
      .eq('id', kurs.id)
      .select('id, teacher_id');
    const verweigert =
      istRlsVerweigert(error) || istInvalidTeacher(error) || ((data?.length ?? 0) === 0 && !error);
    ok('Lehrende teacher_id fremd verweigert', verweigert, error?.message ?? `rows=${data?.length ?? 0}`);

    const { data: check } = await admin.from('courses').select('teacher_id').eq('id', kurs.id).single();
    ok('teacher_id unverändert nach Lehrenden-Versuch', check?.teacher_id === teacher.id);
  }

  // 3) Owner setzt auf andere Lehrerin → ok
  {
    const { data, error } = await clientOwner
      .from('courses')
      .update({ teacher_id: teacher2.id })
      .eq('id', kurs.id)
      .select('id, teacher_id');
    ok(
      'Owner setzt andere Lehrerin',
      !error && (data?.length ?? 0) === 1 && data[0].teacher_id === teacher2.id,
      error?.message,
    );
  }

  // 4) Owner setzt auf Teilnehmerin → INVALID_TEACHER
  {
    const { error } = await clientOwner
      .from('courses')
      .update({ teacher_id: teilnehmer.id })
      .eq('id', kurs.id)
      .select('id');
    ok('Owner → Teilnehmerin INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? 'kein Fehler');
  }

  // 5) Owner setzt auf Profil fremdes Studio → INVALID_TEACHER
  {
    const { error } = await clientOwner
      .from('courses')
      .update({ teacher_id: fremdTeacher.id })
      .eq('id', kurs.id)
      .select('id');
    ok('Owner → fremdes Studio INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? 'kein Fehler');
  }

  // 6) Lehrende INSERT: fremde Kursleitung → verweigert; sich selbst → ok
  {
    const basis = {
      title: TITLE + '_INS',
      description: 'A5 Lehrer-Guard Insert-Test mit genug Text.',
      date: tag(14),
      time: '10:00:00',
      end_time: '11:00:00',
      duration: 60,
      location: 'Studio A',
      max_participants: 8,
      price: 12,
      status: 'active',
    };

    const { data: fremdIns, error: fremdErr } = await clientTeacher
      .from('courses')
      .insert({ ...basis, teacher_id: teacher2.id, tenant_id: tenant.id })
      .select('id');
    const fremdVerweigert = istRlsVerweigert(fremdErr) || istInvalidTeacher(fremdErr);
    ok(
      'Lehrende INSERT fremde Kursleitung verweigert',
      fremdVerweigert,
      fremdErr?.message ?? `rows=${fremdIns?.length ?? 0}`,
    );

    const { count: fremdAnzahl, error: fremdZaehlErr } = await admin
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('title', basis.title);
    if (fremdZaehlErr) abbruch('Kurse zählen: ' + fremdZaehlErr.message);
    ok('kein Kurs mit fremder Kursleitung angelegt', fremdAnzahl === 0, `Anzahl=${fremdAnzahl}`);

    const { data: selfIns, error: selfErr } = await clientTeacher
      .from('courses')
      .insert({ ...basis, title: TITLE + '_INS_SELF', teacher_id: teacher.id, tenant_id: tenant.id })
      .select('id, teacher_id');
    ok(
      'Lehrende INSERT mit sich selbst ok',
      !selfErr && (selfIns?.length ?? 0) === 1 && selfIns[0].teacher_id === teacher.id,
      selfErr?.message,
    );
  }

  const { data: finalRow } = await admin.from('courses').select('teacher_id').eq('id', kurs.id).single();
  ok('Endstand teacher_id = teacher2', finalRow?.teacher_id === teacher2.id);

  await resteEntfernen(admin);
  console.log('\ngrün\n  OK  a5_teacher_guard.mjs\n');
}

main().catch(async (err) => {
  console.error('\n  FEHLER: ' + (err?.message ?? err) + '\n');
  if (devOk) {
    try {
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
    } catch (e) {
      console.error('Aufräumen: ' + (e?.message ?? e));
    }
  }
  process.exit(1);
});
