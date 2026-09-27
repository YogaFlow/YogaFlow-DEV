#!/usr/bin/env node
/**
 * 4.3 Schritt 2 — delete-user gegen die auf DEV deployte Function.
 *
 * Nicht ausführen, bevor delete-user auf DEV deployed ist.
 * Gegen PROD nie. Eigenes Studio s43delfn und s43delfnb, am Ende
 * delete_tenant_complete und die Test-Logins per auth.admin.deleteUser.
 *
 * Verwendung: node scripts/test/s4_3_delete_user_fn.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's43delfn';
const SLUG_B = 's43delfnb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHLUESSEL = new Set(['success', 'code', 'message', 'mode', 'login_deleted', 'upcoming_courses']);

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

function clientMitTenant(url, key, slug) {
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

async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function zugang(client) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) abbruch('Access-Token fehlt');
  return data.session.access_token;
}

async function authNutzer(admin) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      const mail = u.email ?? '';
      if (mail.startsWith(SLUG + '.') || mail.startsWith(SLUG_B + '.')) treffer.push(u);
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
  }
  for (const u of await authNutzer(admin)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e && !/not found/i.test(e.message)) {
      abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
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
    .select('id, email, role, tenant_id, auth_user_id, first_name, last_name')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('Profilfelder ' + email + ': ' + e2.message);
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

async function kursAnlegen(admin, felder) {
  const { data, error } = await admin.from('courses').insert(felder).select('id').single();
  if (error) abbruch('Kurs ' + felder.title + ': ' + error.message);
  return data.id;
}

async function funktion(url, anon, slug, accessToken, userId) {
  const headers = {
    apikey: anon,
    'Content-Type': 'application/json',
    'x-omlify-tenant': slug,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${url}/functions/v1/delete-user`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    abbruch('Antwort ist kein JSON, Status ' + res.status);
  }
  return { status: res.status, body };
}

function koerperSauber(body, verboten) {
  if (!body || typeof body !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(body, 'details')) return false;
  if (!Object.keys(body).every((key) => SCHLUESSEL.has(key))) return false;
  const text = JSON.stringify(body).toLowerCase();
  return !verboten.some((wert) => wert && text.includes(String(wert).toLowerCase()));
}

async function loginExistiert(admin, authUserId) {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error) return false;
  return Boolean(data?.user);
}

async function profilLesen(admin, id) {
  const { data, error } = await admin
    .from('users')
    .select('id, first_name, email, auth_user_id, anonymized_at, tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error) abbruch('Profil lesen: ' + error.message);
  return data;
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
    .insert({ name: 'S43 Function', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const { data: tenantB, error: bErr } = await admin
    .from('tenants')
    .insert({ name: 'S43 Function B', slug: SLUG_B })
    .select('id')
    .single();
  if (bErr) abbruch('Studio B anlegen: ' + bErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const owner2 = await nutzerAnlegen(admin, {
    email: SLUG + '.owner2@example.com', vorname: 'Otto', nachname: 'Zweit', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Thea', nachname: 'Lehrer', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const teacherNext = await nutzerAnlegen(admin, {
    email: SLUG + '.teachernext@example.com', vorname: 'Timo', nachname: 'Kommend', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const plain = await nutzerAnlegen(admin, {
    email: SLUG + '.plain@example.com', vorname: 'Pia', nachname: 'Ohne', rolle: 'user', tenantId: tenant.id, password,
  });
  const paid = await nutzerAnlegen(admin, {
    email: SLUG + '.paid@example.com', vorname: 'Klara', nachname: 'Kasse', rolle: 'user', tenantId: tenant.id, password,
  });
  const multi = await nutzerAnlegen(admin, {
    email: SLUG + '.multi@example.com', vorname: 'Mia', nachname: 'Multi', rolle: 'user', tenantId: tenant.id, password,
  });

  const verboten = [
    owner.email, owner2.email, teacher.email, teacherNext.email, plain.email, paid.email, multi.email,
    owner.first_name, owner2.first_name, teacher.first_name, teacherNext.first_name,
    plain.first_name, paid.first_name, multi.first_name,
    'Olivia', 'Otto', 'Thea', 'Timo', 'Pia', 'Klara', 'Mia',
  ];

  const basis = {
    tenant_id: tenant.id,
    description: 'S43 Function Testkurs',
    location: 'Test',
    status: 'active',
    frequency: 'one_time',
    max_participants: 10,
    price: 15,
  };
  const coursePaid = await kursAnlegen(admin, {
    ...basis, teacher_id: teacher.id, title: 'S43FN_BAR', date: tag(5), time: '10:00:00', end_time: '11:00:00',
  });
  const courseNext = await kursAnlegen(admin, {
    ...basis, teacher_id: teacherNext.id, title: 'S43FN_KOMMEND', date: tag(9), time: '15:00:00', end_time: '16:00:00',
  });

  const clientOwner = await login(url, anon, owner.email, password, SLUG);
  const clientTeacher = await login(url, anon, teacher.email, password, SLUG);
  const clientPaid = await login(url, anon, paid.email, password, SLUG);
  const clientMultiB = await login(url, anon, multi.email, password, SLUG_B);
  const tokenOwner = await zugang(clientOwner);
  const tokenTeacher = await zugang(clientTeacher);

  const { data: anmeldung, error: aErr } = await clientPaid.rpc('register_for_course', { p_course_id: coursePaid });
  if (aErr || !anmeldung?.success) abbruch('Anmeldung Klara: ' + (aErr?.message || anmeldung?.message || anmeldung?.error));
  const { data: reg, error: rErr } = await admin
    .from('registrations')
    .select('id')
    .eq('course_id', coursePaid)
    .eq('user_id', paid.id)
    .single();
  if (rErr) abbruch('Buchung: ' + rErr.message);
  const bar = await clientOwner.rpc('record_manual_payment', {
    p_registration_id: reg.id,
    p_method: 'cash',
  });
  if (bar.error || !bar.data?.success) abbruch('Barvermerk: ' + (bar.error?.message || bar.data?.error));
  const { error: datumErr } = await admin.from('courses').update({ date: tag(-3) }).eq('id', coursePaid);
  if (datumErr) abbruch('Kurs in die Vergangenheit: ' + datumErr.message);

  const beitritt = await clientMultiB.rpc('join_tenant', { p_first_name: 'Mia', p_last_name: 'Multi' });
  if (beitritt.error || !beitritt.data?.success) abbruch('join_tenant: ' + (beitritt.error?.message || beitritt.data?.error));
  const { data: profilB, error: bProfilErr } = await admin
    .from('users')
    .select('id, first_name, email, auth_user_id, tenant_id')
    .eq('auth_user_id', multi.auth_user_id)
    .eq('tenant_id', tenantB.id)
    .single();
  if (bProfilErr) abbruch(bProfilErr.message);

  function pruefe(name, res) {
    ok(name + ' ohne Personen oder details', koerperSauber(res.body, verboten));
  }

  console.log('ohne Token');
  const ohne = await funktion(url, anon, SLUG, null, plain.id);
  pruefe('ohne Token', ohne);
  ok('401', ohne.status === 401 && ohne.body?.success === false, `status=${ohne.status} code=${ohne.body?.code}`);

  console.log('Lehrende');
  const lehr = await funktion(url, anon, SLUG, tokenTeacher, plain.id);
  pruefe('Lehrende', lehr);
  ok(
    '403',
    lehr.status === 403
      && lehr.body?.code === 'FORBIDDEN'
      && lehr.body?.message === 'Nur die Studioleitung kann Personen entfernen.',
    `status=${lehr.status} code=${lehr.body?.code}`
  );
  ok('Pia bleibt', (await profilLesen(admin, plain.id))?.id === plain.id);

  console.log('fremdes Studio');
  const fremd = await funktion(url, anon, SLUG_B, tokenOwner, plain.id);
  pruefe('fremdes Studio', fremd);
  ok(
    'fremdes Studio 403',
    fremd.status === 403 && fremd.body?.code === 'FORBIDDEN' && fremd.body?.success === false,
    `status=${fremd.status} code=${fremd.body?.code}`
  );
  ok('Pia nach fremdem Header unverändert', (await profilLesen(admin, plain.id))?.role === 'user');

  console.log('Owner und kommender Kurs');
  const ownerWeg = await funktion(url, anon, SLUG, tokenOwner, owner2.id);
  pruefe('Owner', ownerWeg);
  ok(
    'Owner 409',
    ownerWeg.status === 409
      && ownerWeg.body?.code === 'OWNER_NOT_REMOVABLE'
      && ownerWeg.body?.message === 'Inhaberinnen kannst du nicht entfernen. Ändere zuerst die Rolle.',
    `status=${ownerWeg.status} code=${ownerWeg.body?.code}`
  );
  ok('Owner-Zeile bleibt', (await profilLesen(admin, owner2.id))?.role === 'owner');

  const kursWeg = await funktion(url, anon, SLUG, tokenOwner, teacherNext.id);
  pruefe('kommender Kurs', kursWeg);
  ok(
    'kommender Kurs 409',
    kursWeg.status === 409
      && kursWeg.body?.code === 'HAS_UPCOMING_COURSES'
      && kursWeg.body?.upcoming_courses === 1
      && kursWeg.body?.message === 'Diese Person leitet noch 1 kommenden Kurs. Übergib oder sage ihn zuerst ab.',
    `status=${kursWeg.status} count=${kursWeg.body?.upcoming_courses}`
  );
  ok('Lehrende bleibt', (await profilLesen(admin, teacherNext.id))?.role === 'teacher');
  const { data: kursBleibt, error: kErr } = await admin.from('courses').select('teacher_id').eq('id', courseNext).single();
  if (kErr) abbruch(kErr.message);
  ok('kommender Kurs bleibt', kursBleibt.teacher_id === teacherNext.id);

  console.log('ohne Geldbezug');
  const weg = await funktion(url, anon, SLUG, tokenOwner, plain.id);
  pruefe('Pia', weg);
  ok(
    'Pia deleted und Login weg',
    weg.status === 200 && weg.body?.success === true && weg.body?.mode === 'deleted' && weg.body?.login_deleted === true,
    `status=${weg.status} mode=${weg.body?.mode} login_deleted=${weg.body?.login_deleted}`
  );
  ok('Pia Zeile weg', (await profilLesen(admin, plain.id)) === null);
  ok('Pia Login weg', (await loginExistiert(admin, plain.auth_user_id)) === false);

  console.log('mit Barzahlung');
  const barWeg = await funktion(url, anon, SLUG, tokenOwner, paid.id);
  pruefe('Klara', barWeg);
  ok(
    'Klara anonymized und Login weg',
    barWeg.status === 200 && barWeg.body?.success === true && barWeg.body?.mode === 'anonymized' && barWeg.body?.login_deleted === true,
    `status=${barWeg.status} mode=${barWeg.body?.mode} login_deleted=${barWeg.body?.login_deleted}`
  );
  const klara = await profilLesen(admin, paid.id);
  ok('Klara Zeile da', klara?.id === paid.id && klara?.anonymized_at != null);
  const { count: zahlungen, error: zErr } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('registration_id', reg.id);
  if (zErr) abbruch(zErr.message);
  ok('Zahlung da', zahlungen === 1);
  ok('Klara Login weg', (await loginExistiert(admin, paid.auth_user_id)) === false);

  console.log('Mehrfachmitgliedschaft');
  const multiWeg = await funktion(url, anon, SLUG, tokenOwner, multi.id);
  pruefe('Mia', multiWeg);
  ok(
    'Mia Login bleibt',
    multiWeg.status === 200 && multiWeg.body?.success === true && multiWeg.body?.login_deleted === false,
    `status=${multiWeg.status} login_deleted=${multiWeg.body?.login_deleted}`
  );
  ok('Mia Login existiert', await loginExistiert(admin, multi.auth_user_id));
  const profilBNachher = await profilLesen(admin, profilB.id);
  ok(
    'Profil in Studio B unverändert',
    profilBNachher?.first_name === 'Mia'
      && profilBNachher?.email === multi.email
      && profilBNachher?.auth_user_id === multi.auth_user_id
      && profilBNachher?.tenant_id === tenantB.id
  );

  console.log('grün');
}

let devOk = false;

main()
  .catch((e) => {
    console.error(e.abbruch ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!devOk) return;
    try {
      const env = ladeEnv();
      await resteEntfernen(clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG));
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
    }
  });
