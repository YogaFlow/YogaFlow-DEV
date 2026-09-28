#!/usr/bin/env node
/**
 * S1 1.3a — Rauchtest payments-onboarding gegen DEV (echte Stripe-Test-API).
 *
 * Nicht ausführen, bevor Migration 20260928231500 und Function payments-onboarding
 * auf DEV liegen und secrets:dev gesetzt sind. Gegen PROD nie.
 *
 * Ruft Stripe im Testmodus auf (createConnectedAccount + Account Session).
 * Das Sandbox-Konto bleibt bei Stripe (unkritisch); Anzahl wird am Ende genannt.
 *
 * Verwendung: node scripts/test/s1_3a_onboarding_smoke.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's13asmoke';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let stripeAccountsCreated = 0;

function ladeEnv(datei) {
  const out = {};
  for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
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

async function resteEntfernen(admin) {
  const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', SLUG);
  if (error) abbruch('Studio lesen: ' + error.message);
  for (const t of tenants || []) {
    const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
    if (e) abbruch('Studio löschen: ' + e.message);
  }
  for (let seite = 1; ; seite++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (listErr) abbruch('Auth-Nutzer: ' + listErr.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(SLUG + '.')) {
        const { error: del } = await admin.auth.admin.deleteUser(u.id);
        if (del && !/not found/i.test(del.message)) abbruch('Auth löschen: ' + del.message);
      }
    }
    if (data.users.length < 200) break;
  }
}

async function plattform(admin, enabled) {
  const { data, error } = await admin.rpc('set_platform_flag', {
    p_key: 'online_payments',
    p_enabled: enabled,
  });
  if (error || !data?.success) abbruch('set_platform_flag: ' + (error?.message || JSON.stringify(data)));
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
    .select('id, email, role')
    .eq('auth_user_id', data.user.id)
    .single();
  if (eProfil || !profil) abbruch('Profil: ' + (eProfil?.message ?? 'fehlt'));
  await admin.from('users').update({ email_verified: true, email_verified_at: new Date().toISOString() }).eq('id', profil.id);
  return profil;
}

async function funktion(url, anon, slug, accessToken, action) {
  const headers = {
    apikey: anon,
    'Content-Type': 'application/json',
    'x-omlify-tenant': slug,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${url}/functions/v1/payments-onboarding`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function kontoAnzahl(admin, tenantId) {
  const { count, error } = await admin
    .from('provider_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) abbruch('Konten zählen: ' + error.message);
  return count ?? 0;
}

function ohneAcct(body) {
  return !/\bacct_[A-Za-z0-9_]+\b/.test(JSON.stringify(body ?? {}));
}

async function main() {
  const env = ladeEnv('.env');
  const fnEnv = ladeEnv('supabase/.env.dev');
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
  if (refAusKey(anon) !== ERLAUBTE_REF || refAusKey(service) !== ERLAUBTE_REF) abbruch('Keys gehören nicht zu DEV');
  if (fnEnv.PAYMENTS_MODE !== 'test') abbruch('PAYMENTS_MODE in supabase/.env.dev ist nicht test');
  if (!fnEnv.STRIPE_SECRET_KEY || !/^sk_test_|^rk_test_/.test(fnEnv.STRIPE_SECRET_KEY)) {
    abbruch('STRIPE_SECRET_KEY in supabase/.env.dev fehlt oder ist kein Test-Key');
  }

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  await resteEntfernen(admin);
  await plattform(admin, true);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'S1 3a Smoke', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olga',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenant.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Thea',
    nachname: 'Lehrer',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });

  const ownerClient = await login(url, anon, owner.email, password, SLUG);
  const teacherClient = await login(url, anon, teacher.email, password, SLUG);
  const tokenOwner = await zugang(ownerClient);
  const tokenTeacher = await zugang(teacherClient);

  console.log('ohne Authorization');
  const ohneAuth = await funktion(url, anon, SLUG, null, 'start');
  ok(
    '401 missing_authorization',
    ohneAuth.status === 401 && ohneAuth.body?.code === 'missing_authorization',
    `status=${ohneAuth.status} code=${ohneAuth.body?.code}`,
  );
  ok('keine Kontozeile', (await kontoAnzahl(admin, tenant.id)) === 0);

  console.log('ungültiger Token');
  const ungueltig = await funktion(url, anon, SLUG, 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJmYWtlIn0.invalid', 'start');
  ok(
    '401 invalid_token',
    ungueltig.status === 401 && ungueltig.body?.code === 'invalid_token',
    `status=${ungueltig.status} code=${ungueltig.body?.code}`,
  );
  ok('keine Kontozeile', (await kontoAnzahl(admin, tenant.id)) === 0);

  console.log('Lehrende start');
  const lehr = await funktion(url, anon, SLUG, tokenTeacher, 'start');
  ok('403 FORBIDDEN', lehr.status === 403 && lehr.body?.code === 'FORBIDDEN', `status=${lehr.status} code=${lehr.body?.code}`);
  ok('keine Kontozeile nach Lehrende', (await kontoAnzahl(admin, tenant.id)) === 0);

  console.log('Owner start');
  const start1 = await funktion(url, anon, SLUG, tokenOwner, 'start');
  {
    const keys = start1.body && typeof start1.body === 'object' ? Object.keys(start1.body).sort() : [];
    const anzahl = await kontoAnzahl(admin, tenant.id);
    console.log(
      'Debug Owner start:',
      JSON.stringify({
        http_status: start1.status,
        antwort_schluessel: keys,
        onboarding_status: start1.body?.onboarding_status ?? null,
        provider_accounts_anzahl: anzahl,
      }),
    );
  }
  ok('200', start1.status === 200, `status=${start1.status} code=${start1.body?.code}`);
  ok(
    'client_secret und Status',
    typeof start1.body?.client_secret === 'string'
      && typeof start1.body?.expires_at === 'number'
      && start1.body?.onboarding_status === 'in_progress',
  );
  ok('Antwort ohne acct_', ohneAcct(start1.body));
  stripeAccountsCreated = 1;

  const { data: konten, error: kErr } = await admin
    .from('provider_accounts')
    .select('id, provider_ref, onboarding_status')
    .eq('tenant_id', tenant.id);
  if (kErr) abbruch('Konten lesen: ' + kErr.message);
  ok('genau ein Konto in_progress', konten?.length === 1 && konten[0].onboarding_status === 'in_progress');

  console.log('Owner start erneut');
  const start2 = await funktion(url, anon, SLUG, tokenOwner, 'start');
  ok('200 erneut', start2.status === 200);
  ok('Antwort ohne acct_', ohneAcct(start2.body));
  const { count, error: cErr } = await admin
    .from('provider_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);
  if (cErr) abbruch('zählen: ' + cErr.message);
  ok('weiter genau ein Konto', count === 1, `count=${count}`);

  console.log('refresh');
  const refresh = await funktion(url, anon, SLUG, tokenOwner, 'refresh');
  ok('200 refresh', refresh.status === 200 && refresh.body?.success === true, `status=${refresh.status}`);
  ok('Status in_progress', refresh.body?.onboarding_status === 'in_progress');
  ok('Antwort ohne acct_', ohneAcct(refresh.body));
  console.log('Konto-Status nach refresh:', JSON.stringify({
    onboarding_status: refresh.body?.onboarding_status,
    charges_enabled: refresh.body?.charges_enabled,
    payouts_enabled: refresh.body?.payouts_enabled,
    details_submitted: refresh.body?.details_submitted,
    requirements_pending: refresh.body?.requirements_pending,
    requirements_due_at: refresh.body?.requirements_due_at,
    online_enabled: refresh.body?.online_enabled,
  }));

  console.log('Plattform aus');
  await plattform(admin, false);
  const aus = await funktion(url, anon, SLUG, tokenOwner, 'start');
  ok(
    '409 PLATFORM_DISABLED',
    aus.status === 409 && aus.body?.code === 'PLATFORM_DISABLED',
    `status=${aus.status} code=${aus.body?.code}`,
  );

  console.log('grün');
}

main()
  .catch((e) => {
    console.error(e.abbruch ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const env = ladeEnv('.env');
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
      await plattform(admin, false);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
    }
    console.log(`\nStripe-Testkonten in der Sandbox angelegt (bleiben dort): ${stripeAccountsCreated}`);
  });
