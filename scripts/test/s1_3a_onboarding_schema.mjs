#!/usr/bin/env node
/**
 * S1 1.3a — Schema: requirements, disconnected, Owner-Kontext (nur DEV).
 *
 * Nicht ausführen, bevor 20260928231500_s1_3a_onboarding.sql auf DEV liegt.
 * Gegen PROD nie. Studio s13atest, am Ende delete_tenant_complete und
 * Plattform-Schalter online_payments auf den Ausgangswert zurück.
 *
 * Verwendung: node scripts/test/s1_3a_onboarding_schema.mjs
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's13atest';

/** @type {boolean | null} */
let platformWas = null;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
        if (del) abbruch('Auth löschen: ' + del.message);
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

async function plattformStand(admin) {
  const { data, error } = await admin
    .from('platform_flags')
    .select('enabled')
    .eq('key', 'online_payments')
    .single();
  if (error) abbruch('platform_flags lesen: ' + error.message);
  return Boolean(data.enabled);
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
  if (eProfil || !profil) abbruch('Profil: ' + (eProfil?.message ?? 'fehlt'));
  await admin.from('users').update({ email_verified: true, email_verified_at: new Date().toISOString() }).eq('id', profil.id);
  return profil;
}

function upsertArgs(tenantId, ref, extra = {}) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: ref,
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
    ...extra,
  };
}

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
  if (refAusKey(anon) !== ERLAUBTE_REF || refAusKey(service) !== ERLAUBTE_REF) abbruch('Keys gehören nicht zu DEV');

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  platformWas = await plattformStand(admin);
  await resteEntfernen(admin);
  await plattform(admin, false);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'S1 3a Schema', slug: SLUG })
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

  const ownerClient = await login(url, anon, owner.email, password, SLUG);

  // Steuerstatus, damit Einschalten nur an PROVIDER_NOT_READY scheitert
  const tax = await ownerClient.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: '2020-01-01',
  });
  if (tax.error || !tax.data?.success) abbruch('Steuerstatus: ' + (tax.error?.message || JSON.stringify(tax.data)));

  const ref = 'acct_s13a_' + randomUUID().replace(/-/g, '').slice(0, 16);
  const dueAt = '2026-10-20T10:00:00.000Z';

  console.log('upsert mit Anforderungen');
  const { data: up, error: upErr } = await admin.rpc(
    'upsert_provider_account',
    upsertArgs(tenant.id, ref, {
      p_requirements_pending: true,
      p_requirements_due_at: dueAt,
    }),
  );
  if (upErr || !up?.success) abbruch('upsert: ' + (upErr?.message || JSON.stringify(up)));
  ok('Konto angelegt', up.created === true);

  const { data: setup, error: sErr } = await ownerClient.rpc('get_payment_setup_status');
  if (sErr || !setup?.success) abbruch('get_payment_setup_status: ' + (sErr?.message || JSON.stringify(setup)));
  ok(
    'setup zeigt Anforderungen',
    setup.requirements_pending === true
      && typeof setup.requirements_due_at === 'string'
      && setup.requirements_due_at.startsWith('2026-10-20T10:00:00')
      && setup.disconnected === false
      && setup.onboarding_status === 'active',
    `pending=${setup.requirements_pending} due=${setup.requirements_due_at}`,
  );

  console.log('Online einschalten (ready)');
  await plattform(admin, true);
  const legal = await ownerClient.rpc('upsert_studio_legal_profile', {
    p_legal_name: 'Yoga Test · Inhaberin',
    p_street: 'Testweg',
    p_house_number: '1',
    p_postal_code: '10115',
    p_city: 'Berlin',
    p_country: 'DE',
    p_contact_email: 'studio@example.com',
  });
  if (legal.error || !legal.data?.success) {
    abbruch('legal: ' + (legal.error?.message || JSON.stringify(legal.data)));
  }
  const { data: on, error: onErr } = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
  if (onErr || !on?.success) abbruch('einschalten: ' + (onErr?.message || JSON.stringify(on)));
  ok('online an', on.online_payments_enabled === true);

  console.log('mark_provider_account_disconnected');
  const { data: disc, error: dErr } = await admin.rpc('mark_provider_account_disconnected', {
    p_provider: 'stripe',
    p_ref: ref,
  });
  if (dErr || !disc?.success) abbruch('disconnect: ' + (dErr?.message || JSON.stringify(disc)));
  ok('getrennt und online aus', disc.changed === true && disc.online_payments_disabled === true);

  const { data: setup2 } = await ownerClient.rpc('get_payment_setup_status');
  ok(
    'Status disconnected',
    setup2?.onboarding_status === 'disconnected'
      && setup2?.disconnected === true
      && setup2?.online_payments_enabled === false
      && setup2?.requirements_pending === false,
  );

  const { data: events, error: eErr } = await admin
    .from('events')
    .select('type, payload')
    .eq('tenant_id', tenant.id)
    .eq('type', 'payments.online_disabled')
    .order('occurred_at', { ascending: false })
    .limit(5);
  if (eErr) abbruch('events: ' + eErr.message);
  const mitGrund = (events || []).find((e) => e.payload?.reason === 'PROVIDER_DISCONNECTED');
  ok('Event PROVIDER_DISCONNECTED', !!mitGrund);

  console.log('Einschalten nach Trennung');
  const { data: on2 } = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
  ok('PROVIDER_NOT_READY', on2?.success === false && on2?.error === 'PROVIDER_NOT_READY', JSON.stringify(on2));

  console.log('erneutes upsert → ACCOUNT_DISCONNECTED');
  const { data: up2 } = await admin.rpc('upsert_provider_account', upsertArgs(tenant.id, ref));
  ok('ACCOUNT_DISCONNECTED', up2?.success === false && up2?.error === 'ACCOUNT_DISCONNECTED');

  console.log('Client-JWT auf Service-RPCs');
  const { data: ctxJwt } = await ownerClient.rpc('get_owner_payment_context', {
    p_tenant: tenant.id,
    p_member: owner.id,
  });
  ok('get_owner_payment_context FORBIDDEN', ctxJwt?.error === 'FORBIDDEN' || ctxJwt == null);

  const { data: discJwt } = await ownerClient.rpc('mark_provider_account_disconnected', {
    p_provider: 'stripe',
    p_ref: ref,
  });
  ok('mark_disconnected FORBIDDEN', discJwt?.error === 'FORBIDDEN' || discJwt == null);

  const { data: ctx } = await admin.rpc('get_owner_payment_context', {
    p_tenant: tenant.id,
    p_member: owner.id,
  });
  ok(
    'Owner-Kontext (service)',
    ctx?.success === true
      && ctx?.is_owner === true
      && ctx?.account_ref === ref
      && ctx?.onboarding_status === 'disconnected',
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
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
      if (platformWas !== null) await plattform(admin, platformWas);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
    }
  });
