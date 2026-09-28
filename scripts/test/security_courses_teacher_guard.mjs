#!/usr/bin/env node
/**
 * Sicherheits-Hotfix — Kursleitung auf courses (nur DEV).
 *
 * Nicht ausführen, bevor
 * 20260928213000_security_courses_teacher_guard_hotfix.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio `secteachguard`, zweites Studio
 * `secteachguardb` für das fremde Profil; am Ende delete_tenant_complete.
 *
 * Fälle (übernommen und erweitert aus scripts/test/a5_teacher_guard.mjs):
 *  1) Lehrerin setzt teacher_id des eigenen Kurses auf andere Lehrerin → INVALID_TEACHER
 *  2) Lehrerin legt Kurs mit fremder teacher_id an → INVALID_TEACHER;
 *     mit sich selbst → ok
 *  3) Lehrerin ändert Titel und schickt teacher_id unverändert mit → ok
 *  4) Admin setzt teacher_id auf Lehrerin des Studios → ok;
 *     Owner auf Profil eines anderen Studios → INVALID_TEACHER;
 *     Owner auf Teilnehmerin → INVALID_TEACHER
 *  5) Owner legt Serie mit Lehrerin an → ok
 *
 * Auf DEV liegt zusätzlich 20260928170000 (Trigger courses_teacher_guard,
 * feuert alphabetisch vor dem Hotfix). Fälle 1 und 2 fängt dort der
 * Hotfix-Trigger; ohne ihn käme 42501 aus der A5-Policy.
 *
 * Verwendung: node scripts/test/security_courses_teacher_guard.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'secteachguard';
const SLUG_B = 'secteachguardb';
const TITLE = 'SEC_TEACHER_GUARD';

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

function kursFelder(tenantId, teacherId, extra = {}) {
  return {
    tenant_id: tenantId,
    title: TITLE,
    description: 'Hotfix Lehrer-Guard Testkurs mit genug Text.',
    date: tag(7),
    time: '18:00:00',
    end_time: '19:00:00',
    duration: 60,
    location: 'Studio A',
    max_participants: 10,
    price: 15,
    teacher_id: teacherId,
    status: 'active',
    ...extra,
  };
}

async function teacherVon(admin, kursId) {
  const { data, error } = await admin.from('courses').select('teacher_id').eq('id', kursId).single();
  if (error) abbruch('Kurs lesen: ' + error.message);
  return data.teacher_id;
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
    .insert({ name: 'Hotfix Lehrer-Guard', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio A anlegen: ' + tErr.message);

  const { data: tenantB, error: tBErr } = await admin
    .from('tenants')
    .insert({ name: 'Hotfix Lehrer-Guard B', slug: SLUG_B })
    .select('id')
    .single();
  if (tBErr) abbruch('Studio B anlegen: ' + tBErr.message);

  const anlegen = (kurz, vorname, rolle, tenantId, slug = SLUG) =>
    nutzerAnlegen(admin, {
      email: `${slug}.${kurz}@example.com`,
      vorname,
      nachname: 'Test',
      rolle,
      tenantId,
      password,
    });

  await anlegen('owner', 'Olivia', 'owner', tenant.id);
  await anlegen('admin', 'Adam', 'admin', tenant.id);
  const teacher = await anlegen('teacher', 'Tom', 'teacher', tenant.id);
  const teacher2 = await anlegen('teacher2', 'Tina', 'teacher', tenant.id);
  const teilnehmer = await anlegen('user', 'Ute', 'user', tenant.id);
  await anlegen('owner', 'Fremd', 'owner', tenantB.id, SLUG_B);
  const fremdTeacher = await anlegen('teacher', 'Fremd', 'teacher', tenantB.id, SLUG_B);

  const { data: kurs, error: kErr } = await admin
    .from('courses')
    .insert(kursFelder(tenant.id, teacher.id))
    .select('id, teacher_id')
    .single();
  if (kErr) abbruch('Kurs anlegen: ' + kErr.message);

  const clientTeacher = await login(url, anon, SLUG + '.teacher@example.com', password);
  const clientOwner = await login(url, anon, SLUG + '.owner@example.com', password);
  const clientAdmin = await login(url, anon, SLUG + '.admin@example.com', password);

  // 1) Lehrerin setzt teacher_id des eigenen Kurses auf andere Lehrerin
  {
    const { data, error } = await clientTeacher
      .from('courses')
      .update({ teacher_id: teacher2.id })
      .eq('id', kurs.id)
      .select('id');
    ok('1 Lehrerin → andere Lehrerin INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? `rows=${data?.length ?? 0}`);
    ok('1 teacher_id unverändert', (await teacherVon(admin, kurs.id)) === teacher.id);
  }

  // 2) Lehrerin legt Kurs an: fremde teacher_id verweigert, eigene ok
  {
    const { data, error } = await clientTeacher
      .from('courses')
      .insert(kursFelder(tenant.id, teacher2.id, { title: TITLE + '_INS_FREMD', date: tag(14) }))
      .select('id');
    ok('2 Lehrerin INSERT fremde teacher_id INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? `rows=${data?.length ?? 0}`);

    const { data: selbst, error: selbstErr } = await clientTeacher
      .from('courses')
      .insert(kursFelder(tenant.id, teacher.id, { title: TITLE + '_INS_SELF', date: tag(14) }))
      .select('id, teacher_id');
    ok(
      '2 Lehrerin INSERT mit sich selbst ok',
      !selbstErr && (selbst?.length ?? 0) === 1 && selbst[0].teacher_id === teacher.id,
      selbstErr?.message,
    );
  }

  // 3) Lehrerin ändert Titel, teacher_id unverändert mitgeschickt (wie EditCourse)
  {
    const { data, error } = await clientTeacher
      .from('courses')
      .update({ title: TITLE + '_EDIT', teacher_id: teacher.id })
      .eq('id', kurs.id)
      .select('id, title, teacher_id');
    ok(
      '3 Lehrerin Titel + unveränderte teacher_id ok',
      !error && (data?.length ?? 0) === 1 && data[0].title === TITLE + '_EDIT' && data[0].teacher_id === teacher.id,
      error?.message,
    );
  }

  // 4a) Admin setzt teacher_id auf Lehrerin des Studios → ok
  {
    const { data, error } = await clientAdmin
      .from('courses')
      .update({ teacher_id: teacher2.id })
      .eq('id', kurs.id)
      .select('id, teacher_id');
    ok(
      '4a Admin → Lehrerin des Studios ok',
      !error && (data?.length ?? 0) === 1 && data[0].teacher_id === teacher2.id,
      error?.message,
    );
  }

  // 4b) Owner setzt teacher_id auf Profil eines anderen Studios
  {
    const { error } = await clientOwner
      .from('courses')
      .update({ teacher_id: fremdTeacher.id })
      .eq('id', kurs.id)
      .select('id');
    ok('4b Owner → fremdes Studio INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? 'kein Fehler');
  }

  // 4c) Owner setzt teacher_id auf Teilnehmerin
  {
    const { error } = await clientOwner
      .from('courses')
      .update({ teacher_id: teilnehmer.id })
      .eq('id', kurs.id)
      .select('id');
    ok('4c Owner → Teilnehmerin INVALID_TEACHER', istInvalidTeacher(error), error?.message ?? 'kein Fehler');
    ok('4 teacher_id bleibt teacher2', (await teacherVon(admin, kurs.id)) === teacher2.id);
  }

  // 5) Owner legt Serie mit Lehrerin an (wie CreateCourse: ein Insert, mehrere Zeilen)
  {
    const serienId = crypto.randomUUID();
    const zeilen = [21, 28, 35].map((t) =>
      kursFelder(tenant.id, teacher.id, { title: TITLE + '_SERIE', date: tag(t), series_id: serienId }),
    );
    const { data, error } = await clientOwner
      .from('courses')
      .insert(zeilen)
      .select('id, teacher_id, series_id');
    ok(
      '5 Owner Serie mit Lehrerin ok',
      !error && (data?.length ?? 0) === 3 && data.every((z) => z.teacher_id === teacher.id && z.series_id === serienId),
      error?.message ?? `rows=${data?.length ?? 0}`,
    );
  }

  await resteEntfernen(admin);
  console.log('\ngrün\n  OK  security_courses_teacher_guard.mjs\n');
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
