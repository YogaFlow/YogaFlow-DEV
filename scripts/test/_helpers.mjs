/**
 * Neue Testskripte nutzen diese Helfer.
 * Aus a6_1_foundation.mjs und s2_1b_a_pending.mjs ausgelagert (2.2a-1).
 * Bestehende Skripte bleiben unverändert.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {boolean} */
export let devOk = false;

/** true, wenn ausdrücklich freigegebene Probe-Ref (nicht DEV, nicht PROD). */
export let probeMode = false;

function ladeEnvDatei(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export function ladeEnv() {
  return ladeEnvDatei(join(root, '.env'));
}

/** Probe nur mit Env OMLIFY_PROBE_REF und Flag (--probe oder OMLIFY_ALLOW_PROBE=1). */
export function probeErlaubt() {
  return (
    process.argv.includes('--probe') ||
    process.env.OMLIFY_ALLOW_PROBE === '1'
  );
}

export function probeRef() {
  return (process.env.OMLIFY_PROBE_REF || '').trim();
}

export function seedPasswort() {
  const src = readFileSync(join(root, 'scripts', 'seed-dev.mjs'), 'utf8');
  const pass = src.match(/const DEMO_PASSWORT = '([^']+)'/);
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  return pass[1];
}

export function abbruch(text) {
  const fehler = new Error(text);
  fehler.abbruch = true;
  throw fehler;
}

export function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

/**
 * Prüft URL/Keys gegen DEV — oder gegen eine ausdrücklich freigegebene Probe-Ref.
 * Probe: `OMLIFY_PROBE_REF=<ref>` und `--probe` bzw. `OMLIFY_ALLOW_PROBE=1`.
 * Nie PROD (Vergleich mit PROD_REF aus .env.deploy, falls gesetzt).
 */
export function assertDevEnv(env) {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');

  const wantProbe = probeErlaubt();
  const pRef = probeRef();

  if (wantProbe) {
    if (!pRef) abbruch('Probe: OMLIFY_PROBE_REF fehlt');
    if (!/^[a-z0-9]{20}$/.test(pRef)) abbruch('Probe: OMLIFY_PROBE_REF ungültig');
    if (pRef === ERLAUBTE_REF) abbruch('Probe: OMLIFY_PROBE_REF darf nicht die DEV-Ref sein');
    const deploy = ladeEnvDatei(join(root, '.env.deploy'));
    const prodRef = (deploy.PROD_REF || '').trim();
    if (prodRef && pRef === prodRef) abbruch('Probe: OMLIFY_PROBE_REF darf nicht PROD sein');
    if (!url.includes(pRef)) abbruch('URL zeigt nicht auf die Probe (OMLIFY_PROBE_REF)');
    if (refAusKey(anon) !== pRef) abbruch('Anon-Key gehört nicht zur Probe');
    if (refAusKey(service) !== pRef) abbruch('Service-Role-Key gehört nicht zur Probe');
    probeMode = true;
    devOk = true;
    return { url, anon, service, mode: 'probe', ref: pRef };
  }

  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  probeMode = false;
  devOk = true;
  return { url, anon, service, mode: 'dev', ref: ERLAUBTE_REF };
}

export function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

export function berlinDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const utc = Date.UTC(y, m - 1, d + offsetDays);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function clientMitTenant(url, key, slug) {
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

export async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function authNutzerMitPrefix(admin, emailPrefix) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(emailPrefix)) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

/**
 * Löscht Test-Studios und alle Auth-Logins, deren E-Mail mit `emailPrefix` beginnt.
 * `emailPrefix` Pflicht, mindestens 6 Zeichen; `devOk` muss gesetzt sein (nur DEV).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string | string[]} slugs Studio-Slug(s)
 * @param {string} emailPrefix z. B. s22a1pay — trifft auch s22a1payx.…
 */
export async function resteEntfernen(admin, slugs, emailPrefix) {
  if (!devOk) abbruch('resteEntfernen: assertDevEnv/devOk fehlt');
  if (typeof emailPrefix !== 'string' || emailPrefix.length < 6) {
    abbruch('resteEntfernen: emailPrefix fehlt oder kürzer als 6 Zeichen');
  }

  const liste = Array.isArray(slugs) ? slugs : [slugs];
  for (const slug of liste) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen (' + slug + '): ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen (' + slug + '): ' + e.message);
    }
  }

  for (const u of await authNutzerMitPrefix(admin, emailPrefix)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e && !/not found/i.test(e.message)) {
      abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
    }
  }
}

export async function nutzerAnlegen(admin, { email, vorname, nachname, rolle, tenantId, password }) {
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
    .select('id, email, role, tenant_id, auth_user_id')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function kursAnlegen(admin, tenantId, teacherId, opts = {}) {
  const { data, error } = await admin
    .from('courses')
    .insert({
      tenant_id: tenantId,
      title: opts.title || 'Testkurs',
      description: opts.description || 'Testkurs Beschreibung lang genug',
      date: opts.date || berlinDate(3),
      time: opts.time || '18:00:00',
      end_time: opts.end_time || '19:00:00',
      location: opts.location || 'Studio',
      max_participants: opts.max_participants ?? 10,
      price: opts.price ?? 15,
      teacher_id: teacherId,
      status: 'active',
      frequency: 'one_time',
      pass_eligible: opts.pass_eligible ?? true,
    })
    .select('id, date, time, price, pass_eligible, max_participants, title')
    .single();
  if (error) abbruch('Kurs: ' + error.message);
  return data;
}

const LEGAL_DEFAULTS = {
  p_legal_name: 'Yoga Test · Inhaberin',
  p_street: 'Testweg',
  p_house_number: '1',
  p_postal_code: '10115',
  p_city: 'Berlin',
  p_country: 'DE',
  p_contact_email: 'studio@example.com',
  p_phone: null,
  p_tax_id: null,
};

/** B1: Anbieterangaben im Studio-Kontext des Clients (Owner). */
export async function legalProfileSetzen(client, overrides = {}) {
  const args = { ...LEGAL_DEFAULTS, ...overrides };
  const { data, error } = await client.rpc('upsert_studio_legal_profile', args);
  if (error || !data?.success) {
    abbruch('upsert_studio_legal_profile: ' + (error?.message || JSON.stringify(data)));
  }
  return data;
}

export async function plattform(admin, enabled) {
  const { data, error } = await admin.rpc('set_platform_flag', {
    p_key: 'online_payments',
    p_enabled: enabled,
  });
  if (error || !data?.success) {
    abbruch('set_platform_flag ' + enabled + ': ' + (error?.message || JSON.stringify(data)));
  }
  return data;
}

export async function plattformStand(admin) {
  const { data, error } = await admin
    .from('platform_flags')
    .select('enabled')
    .eq('key', 'online_payments')
    .single();
  if (error) abbruch('platform_flags lesen: ' + error.message);
  return Boolean(data.enabled);
}

/**
 * Wartet bis `pruefFn()` wahr liefert. Jeder Schritt: `expire_payment_holds`, dann Prüfung.
 * Kein festes Sleep bis zur Hold-Frist — PC-Uhr und DB-Uhr können abweichen.
 *
 * @param {() => Promise<boolean> | boolean} pruefFn
 * @param {{ admin: import('@supabase/supabase-js').SupabaseClient, maxMs?: number, schrittMs?: number, label?: string }} opts
 */
export async function warteBis(pruefFn, opts) {
  const admin = opts?.admin;
  const maxMs = opts?.maxMs ?? 70_000;
  const schrittMs = opts?.schrittMs ?? 2_000;
  const label = opts?.label ?? 'warteBis';
  if (!admin) abbruch('warteBis: admin fehlt');

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('expire_payment_holds: ' + error.message);
    if (await pruefFn()) return;
    await new Promise((r) => setTimeout(r, schrittMs));
  }
  abbruch(
    `${label}: Timeout nach ${maxMs} ms — Endzustand nicht erreicht (PC-/DB-Uhr können abweichen)`,
  );
}
