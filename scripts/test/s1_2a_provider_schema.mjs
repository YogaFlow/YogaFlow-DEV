#!/usr/bin/env node
/**
 * S1 1.2a — Provider-Tabellen, Plattform-Schalter, Zahlungseinstellungen (nur DEV).
 *
 * Nicht ausführen, bevor 20260928203500_s1_2a_provider_schema.sql auf DEV liegt.
 * Gegen PROD nie. Studios `s12atest` und `s12afremd`, am Ende
 * delete_tenant_complete und auth.admin.deleteUser für beide.
 * Setzt den Plattform-Schalter online_payments am Ende auf den Ausgangswert zurück.
 *
 * Verwendung: node scripts/test/s1_2a_provider_schema.mjs
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's12atest';
const SLUG_FREMD = 's12afremd';
const SLUGS = [SLUG, SLUG_FREMD];

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

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function berlinTag(versatzTage = 0) {
  const d = new Date(Date.now() + versatzTage * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
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

function authEmailGehoertTest(email) {
  return SLUGS.some((s) => (email ?? '').startsWith(s + '.'));
}

async function authNutzer(admin) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if (authEmailGehoertTest(u.email)) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  for (const slug of SLUGS) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen (' + slug + '): ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen (' + slug + '): ' + e.message);
    }
  }
  for (const u of await authNutzer(admin)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e) abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
  }
}

async function plattform(admin, enabled) {
  const { data, error } = await admin.rpc('set_platform_flag', {
    p_key: 'online_payments',
    p_enabled: enabled,
  });
  if (error || !data?.success) {
    abbruch('set_platform_flag ' + enabled + ': ' + (error?.message || JSON.stringify(data)));
  }
  return data;
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
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified ' + email + ': ' + e2.message);
  return profil;
}

function upsertArgs(tenantId, ref, status, charges, card, extra = {}) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: ref,
    p_status: status,
    p_charges: charges,
    p_payouts: charges,
    p_details: status !== 'not_started',
    p_livemode: false,
    p_capabilities: card ? { card } : null,
    ...extra,
  };
}

async function upsert(admin, args, wer) {
  const { data, error } = await admin.rpc('upsert_provider_account', args);
  if (error) abbruch(`upsert ${wer}: ${error.message}`);
  return data;
}

function rpcFehler(res, code) {
  return res.error == null && res.data?.success === false && res.data?.error === code;
}

/** Verweigert = Fehler (42501) oder 0 Zeilen. */
function nichtsGesehen(res) {
  return !!res.error || (Array.isArray(res.data) && res.data.length === 0);
}

async function events(admin, tenantId, type) {
  const { data, error } = await admin
    .from('events')
    .select('id, type, payload, subject_id')
    .eq('tenant_id', tenantId)
    .eq('type', type);
  if (error) abbruch('events ' + type + ': ' + error.message);
  return data || [];
}

async function audits(admin, tenantId, action) {
  const { data, error } = await admin
    .from('audit_log')
    .select('id, action, table_name, actor_member_id, event_id, changed_fields')
    .eq('tenant_id', tenantId)
    .eq('action', action);
  if (error) abbruch('audit_log ' + action + ': ' + error.message);
  return data || [];
}

async function einstellungen(admin, tenantId) {
  const { data, error } = await admin
    .from('tenant_payment_settings')
    .select('online_payments_enabled, allow_onsite_payment, changed_by')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) abbruch('tenant_payment_settings: ' + error.message);
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

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  await resteEntfernen(admin);
  await plattform(admin, false);

  const { data: tMain, error: tMainErr } = await admin
    .from('tenants')
    .insert({ name: 'S1 2a Haupt', slug: SLUG })
    .select('id')
    .single();
  if (tMainErr) abbruch('Hauptstudio: ' + tMainErr.message);

  const { data: tFremd, error: tFremdErr } = await admin
    .from('tenants')
    .insert({ name: 'S1 2a Fremd', slug: SLUG_FREMD })
    .select('id')
    .single();
  if (tFremdErr) abbruch('Fremdstudio: ' + tFremdErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olga',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tMain.id,
    password,
  });
  const adminUser = await nutzerAnlegen(admin, {
    email: SLUG + '.admin@example.com',
    vorname: 'Adam',
    nachname: 'Admin',
    rolle: 'admin',
    tenantId: tMain.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Tara',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tMain.id,
    password,
  });
  const member = await nutzerAnlegen(admin, {
    email: SLUG + '.t1@example.com',
    vorname: 'Tilda',
    nachname: 'Teilnehmerin',
    rolle: 'user',
    tenantId: tMain.id,
    password,
  });
  const ownerFremd = await nutzerAnlegen(admin, {
    email: SLUG_FREMD + '.owner@example.com',
    vorname: 'Frida',
    nachname: 'Fremd',
    rolle: 'owner',
    tenantId: tFremd.id,
    password,
  });

  const ref = 'acct_s12a_' + randomUUID().replace(/-/g, '').slice(0, 16);

  try {
    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asAdmin = await login(url, anon, adminUser.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asMember = await login(url, anon, member.email, password, SLUG);
    const asOwnerFremd = await login(url, anon, ownerFremd.email, password, SLUG_FREMD);
    const asAnon = clientMitTenant(url, anon, SLUG);

    // --- 1. Standard ---
    console.log('\n  1. Standard');
    const s0 = await asOwner.rpc('get_payment_setup_status');
    if (s0.error) abbruch('get_payment_setup_status: ' + s0.error.message);
    ok(
      'Standard: Plattform aus, kein Konto, online aus, vor Ort an',
      s0.data?.success === true
        && s0.data.platform_enabled === false
        && s0.data.has_account === false
        && s0.data.onboarding_status === 'not_started'
        && s0.data.charges_enabled === false
        && s0.data.card_active === false
        && s0.data.tax_setting_present === false
        && s0.data.online_payments_enabled === false
        && s0.data.allow_onsite_payment === true,
      JSON.stringify(s0.data)
    );
    ok('Standard: keine Einstellungszeile', (await einstellungen(admin, tMain.id)) === null);

    // --- 2. Rechte ---
    console.log('\n  2. Rechte');
    for (const [wer, c] of [
      ['Admin', asAdmin],
      ['Lehrende', asTeacher],
      ['Teilnehmende', asMember],
    ]) {
      ok(
        `${wer} set_online_payments_enabled → FORBIDDEN`,
        rpcFehler(await c.rpc('set_online_payments_enabled', { p_enabled: true }), 'FORBIDDEN')
      );
      ok(
        `${wer} set_allow_onsite_payment → FORBIDDEN`,
        rpcFehler(await c.rpc('set_allow_onsite_payment', { p_allow: false }), 'FORBIDDEN')
      );
    }
    for (const [wer, c] of [
      ['Lehrende', asTeacher],
      ['Teilnehmende', asMember],
    ]) {
      ok(
        `${wer} get_payment_setup_status → FORBIDDEN`,
        rpcFehler(await c.rpc('get_payment_setup_status'), 'FORBIDDEN')
      );
    }
    const sAdmin = await asAdmin.rpc('get_payment_setup_status');
    ok('Admin get_payment_setup_status erlaubt', sAdmin.data?.success === true, JSON.stringify(sAdmin.data));

    for (const [wer, c] of [
      ['Owner (authenticated)', asOwner],
      ['anon', asAnon],
    ]) {
      const pf = await c.rpc('set_platform_flag', { p_key: 'online_payments', p_enabled: true });
      ok(`${wer} set_platform_flag verweigert`, !!pf.error, pf.error?.message);
      const up = await c.rpc(
        'upsert_provider_account',
        upsertArgs(tMain.id, ref, 'active', true, 'active')
      );
      ok(`${wer} upsert_provider_account verweigert`, !!up.error, up.error?.message);
    }
    const flagNachVersuch = await admin
      .from('platform_flags')
      .select('enabled')
      .eq('key', 'online_payments')
      .single();
    ok('Plattform nach Fremdversuch weiter aus', flagNachVersuch.data?.enabled === false);

    const insAcc = await asOwner.from('provider_accounts').insert({
      tenant_id: tMain.id,
      provider: 'stripe',
      provider_ref: ref,
      livemode: false,
    });
    ok('Owner INSERT provider_accounts verweigert', !!insAcc.error, insAcc.error?.message);
    const insTps = await asOwner.from('tenant_payment_settings').insert({
      tenant_id: tMain.id,
      online_payments_enabled: true,
    });
    ok('Owner INSERT tenant_payment_settings verweigert', !!insTps.error, insTps.error?.message);
    const insFlag = await asOwner.from('platform_flags').update({ enabled: true }).eq('key', 'online_payments').select();
    ok('Owner UPDATE platform_flags verweigert', nichtsGesehen(insFlag), insFlag.error?.message);

    // --- 3. Reihenfolge der Prüfungen ---
    console.log('\n  3. Reihenfolge');
    ok(
      'Einschalten ohne Plattform → PLATFORM_DISABLED',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'PLATFORM_DISABLED')
    );

    const pfOn = await plattform(admin, true);
    ok('Plattform an', pfOn.changed === true && pfOn.enabled === true, JSON.stringify(pfOn));
    const pfOnAgain = await plattform(admin, true);
    ok('Plattform nochmal an → changed false', pfOnAgain.changed === false);
    const { data: flagLog, error: flagLogErr } = await admin
      .from('platform_flag_changes')
      .select('enabled, changed_at')
      .eq('key', 'online_payments')
      .order('changed_at', { ascending: false })
      .limit(1);
    if (flagLogErr) abbruch('platform_flag_changes: ' + flagLogErr.message);
    ok('Verlauf platform_flag_changes: letzte Zeile enabled', flagLog?.[0]?.enabled === true);

    ok(
      'Ohne Konto → PROVIDER_NOT_READY',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'PROVIDER_NOT_READY')
    );

    const upReview = await upsert(admin, upsertArgs(tMain.id, ref, 'in_review', false, 'pending'), 'in_review');
    ok('Konto in_review angelegt', upReview?.success === true && upReview.created === true, JSON.stringify(upReview));
    const evCreated = await events(admin, tMain.id, 'provider_account.updated');
    ok(
      'Event provider_account.updated ohne Referenz',
      evCreated.length === 1
        && evCreated[0].payload?.onboarding_status === 'in_review'
        && !JSON.stringify(evCreated[0].payload).includes(ref),
      JSON.stringify(evCreated[0]?.payload)
    );
    const upReviewAgain = await upsert(admin, upsertArgs(tMain.id, ref, 'in_review', false, 'pending'), 'in_review 2');
    ok('Gleicher Stand nochmal → changed false', upReviewAgain?.success === true && upReviewAgain.changed === false);
    ok('Gleicher Stand → kein zweites Event', (await events(admin, tMain.id, 'provider_account.updated')).length === 1);

    ok(
      'Konto in_review → PROVIDER_NOT_READY',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'PROVIDER_NOT_READY')
    );

    const upActive = await upsert(admin, upsertArgs(tMain.id, ref, 'active', true, 'active'), 'active');
    ok('Konto active, card active', upActive?.success === true && upActive.changed === true, JSON.stringify(upActive));

    ok(
      'Ohne Steuerstatus → TAX_SETTING_MISSING',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'TAX_SETTING_MISSING')
    );

    const taxMorgen = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinTag(1),
    });
    ok('Steuerstatus ab morgen gesetzt', taxMorgen.data?.success === true, JSON.stringify(taxMorgen.data));
    ok(
      'Steuerstatus erst ab morgen → TAX_SETTING_MISSING',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'TAX_SETTING_MISSING')
    );

    const taxHeute = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinTag(0),
    });
    ok('Steuerstatus ab heute gesetzt', taxHeute.data?.success === true, JSON.stringify(taxHeute.data));

    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok('Einschalten ok', on.data?.success === true && on.data.changed === true, JSON.stringify(on.data));
    const tpsOn = await einstellungen(admin, tMain.id);
    ok(
      'Einstellung online an, changed_by Owner, vor Ort weiter an',
      tpsOn?.online_payments_enabled === true
        && tpsOn.changed_by === owner.id
        && tpsOn.allow_onsite_payment === true,
      JSON.stringify(tpsOn)
    );
    const evOn = await events(admin, tMain.id, 'payments.online_enabled');
    ok('Event payments.online_enabled', evOn.length === 1 && evOn[0].subject_id === tMain.id);
    const auOn = await audits(admin, tMain.id, 'payments.online_enabled');
    ok(
      'Audit payments.online_enabled',
      auOn.length === 1
        && auOn[0].table_name === 'tenant_payment_settings'
        && auOn[0].actor_member_id === owner.id
        && auOn[0].event_id === evOn[0].id,
      JSON.stringify(auOn)
    );

    const onAgain = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok('Nochmal einschalten → changed false', onAgain.data?.success === true && onAgain.data.changed === false);
    ok('Nochmal einschalten → kein zweites Event', (await events(admin, tMain.id, 'payments.online_enabled')).length === 1);

    const sOn = await asOwner.rpc('get_payment_setup_status');
    ok(
      'Status nach Einschalten',
      sOn.data?.platform_enabled === true
        && sOn.data.has_account === true
        && sOn.data.onboarding_status === 'active'
        && sOn.data.charges_enabled === true
        && sOn.data.card_active === true
        && sOn.data.tax_setting_present === true
        && sOn.data.online_payments_enabled === true,
      JSON.stringify(sOn.data)
    );

    // --- 4. Automatisch aus ---
    console.log('\n  4. Automatisch aus');
    const upInactive = await upsert(admin, upsertArgs(tMain.id, ref, 'active', true, 'inactive'), 'card inactive');
    ok(
      'card inactive → online_payments_disabled',
      upInactive?.success === true && upInactive.online_payments_disabled === true,
      JSON.stringify(upInactive)
    );
    const tpsAuto = await einstellungen(admin, tMain.id);
    ok(
      'Einstellung online aus, changed_by NULL',
      tpsAuto?.online_payments_enabled === false && tpsAuto.changed_by === null,
      JSON.stringify(tpsAuto)
    );
    const evAuto = await events(admin, tMain.id, 'payments.online_disabled');
    ok(
      'Event payments.online_disabled mit PROVIDER_NOT_READY',
      evAuto.length === 1 && evAuto[0].payload?.reason === 'PROVIDER_NOT_READY',
      JSON.stringify(evAuto)
    );
    const auAuto = await audits(admin, tMain.id, 'payments.online_disabled');
    ok('Audit automatisch aus ohne Akteur', auAuto.length === 1 && auAuto[0].actor_member_id === null);

    // --- 5. Ausschalten immer erlaubt ---
    console.log('\n  5. Ausschalten bei Plattform aus');
    await upsert(admin, upsertArgs(tMain.id, ref, 'active', true, 'active'), 'card wieder active');
    const onAgain2 = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok('Wieder eingeschaltet', onAgain2.data?.success === true && onAgain2.data.changed === true);
    await plattform(admin, false);
    const off = await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    ok('Ausschalten bei Plattform aus ok', off.data?.success === true && off.data.changed === true, JSON.stringify(off.data));
    const evOff = await events(admin, tMain.id, 'payments.online_disabled');
    ok(
      'Event payments.online_disabled mit OWNER',
      evOff.some((e) => e.payload?.reason === 'OWNER'),
      JSON.stringify(evOff.map((e) => e.payload))
    );
    ok(
      'Einschalten bei Plattform aus → PLATFORM_DISABLED',
      rpcFehler(await asOwner.rpc('set_online_payments_enabled', { p_enabled: true }), 'PLATFORM_DISABLED')
    );
    const offAgain = await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    ok('Nochmal ausschalten → changed false', offAgain.data?.success === true && offAgain.data.changed === false);

    const onsiteOff = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    ok('Vor Ort aus', onsiteOff.data?.success === true && onsiteOff.data.changed === true);
    const evOnsite = await events(admin, tMain.id, 'payments.onsite_setting_changed');
    ok(
      'Event payments.onsite_setting_changed',
      evOnsite.length === 1 && evOnsite[0].payload?.allow_onsite_payment === false
    );
    ok('Audit payments.onsite_setting_changed', (await audits(admin, tMain.id, 'payments.onsite_setting_changed')).length === 1);
    const onsiteOn = await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    ok('Vor Ort wieder an', onsiteOn.data?.success === true && onsiteOn.data.changed === true);

    // --- 6. Zweites Studio, gleiche Referenz ---
    console.log('\n  6. Kein Umhängen');
    const mismatch = await upsert(admin, upsertArgs(tFremd.id, ref, 'active', true, 'active'), 'fremd');
    ok('Gleiche acct_… im zweiten Studio → ACCOUNT_TENANT_MISMATCH', mismatch?.error === 'ACCOUNT_TENANT_MISMATCH', JSON.stringify(mismatch));
    const refMismatch = await upsert(
      admin,
      upsertArgs(tMain.id, ref + 'x', 'active', true, 'active'),
      'andere ref'
    );
    ok('Zweites Konto im selben Studio → ACCOUNT_REF_MISMATCH', refMismatch?.error === 'ACCOUNT_REF_MISMATCH', JSON.stringify(refMismatch));
    const liveMismatch = await upsert(
      admin,
      upsertArgs(tMain.id, ref, 'active', true, 'active', { p_livemode: true }),
      'livemode'
    );
    ok('livemode wechselt → LIVEMODE_MISMATCH', liveMismatch?.error === 'LIVEMODE_MISMATCH', JSON.stringify(liveMismatch));
    const badCap = await upsert(
      admin,
      upsertArgs(tMain.id, ref, 'active', true, null, { p_capabilities: { sepa_debit: 'active' } }),
      'sepa'
    );
    ok('sepa_debit → INVALID_CAPABILITIES', badCap?.error === 'INVALID_CAPABILITIES', JSON.stringify(badCap));
    const { data: accs } = await admin
      .from('provider_accounts')
      .select('tenant_id, provider_ref')
      .eq('provider_ref', ref);
    ok('Konto hängt weiter am Hauptstudio', accs?.length === 1 && accs[0].tenant_id === tMain.id);

    // --- 7. Rohdaten ---
    console.log('\n  7. Rohdaten');
    const evtId = 'evt_s12a_' + randomUUID().replace(/-/g, '');
    const roh = {
      provider: 'stripe',
      event_id: evtId,
      event_type: 'account.updated',
      account_ref: ref,
      tenant_id: tMain.id,
      livemode: false,
      payload: { object: { id: ref, charges_enabled: true } },
    };
    const raw1 = await admin.from('provider_events_raw').insert(roh).select('id').single();
    ok('Rohzeile angelegt (service_role)', !raw1.error && !!raw1.data?.id, raw1.error?.message);
    const raw2 = await admin.from('provider_events_raw').insert(roh).select('id');
    ok('Gleiche event_id → Unique-Fehler', raw2.error?.code === '23505', raw2.error?.code + ' ' + raw2.error?.message);
    const rawManual = await admin
      .from('provider_events_raw')
      .insert({ ...roh, provider: 'manual', event_id: evtId + '_m' })
      .select('id');
    ok('provider manual → CHECK-Fehler', rawManual.error?.code === '23514', rawManual.error?.message);

    const upPayload = await admin
      .from('provider_events_raw')
      .update({ payload: { verändert: true } })
      .eq('id', raw1.data.id)
      .select('id');
    ok('UPDATE payload verweigert', !!upPayload.error, upPayload.error?.message);
    const upProcessed = await admin
      .from('provider_events_raw')
      .update({ processed_at: new Date().toISOString(), attempts: 1 })
      .eq('id', raw1.data.id)
      .select('id');
    ok('UPDATE processed_at ok', !upProcessed.error && upProcessed.data?.length === 1, upProcessed.error?.message);
    const upFreitext = await admin
      .from('provider_events_raw')
      .update({ processing_error: 'Freitext mit Name' })
      .eq('id', raw1.data.id)
      .select('id');
    ok('processing_error Freitext → CHECK-Fehler', upFreitext.error?.code === '23514', upFreitext.error?.message);
    const upCode = await admin
      .from('provider_events_raw')
      .update({ processing_error: 'TENANT_UNRESOLVED' })
      .eq('id', raw1.data.id)
      .select('id');
    ok('processing_error Code ok', !upCode.error && upCode.data?.length === 1, upCode.error?.message);
    const delRaw = await admin.from('provider_events_raw').delete().eq('id', raw1.data.id).select('id');
    ok('DELETE Rohzeile verweigert (service_role)', !!delRaw.error, delRaw.error?.message);

    // --- 8. Lesen ---
    console.log('\n  8. Lesen');
    for (const [wer, c] of [
      ['Owner', asOwner],
      ['Admin', asAdmin],
    ]) {
      const a = await c.from('provider_accounts').select('id, onboarding_status');
      ok(`${wer} sieht Konto`, !a.error && a.data?.length === 1, a.error?.message);
      const cap = await c.from('provider_capabilities').select('method, status');
      ok(`${wer} sieht Capability`, !cap.error && cap.data?.length === 1, cap.error?.message);
      const t = await c.from('tenant_payment_settings').select('tenant_id');
      ok(`${wer} sieht Einstellungen`, !t.error && t.data?.length === 1, t.error?.message);
    }
    for (const [wer, c] of [
      ['Lehrende', asTeacher],
      ['Teilnehmende', asMember],
      ['fremde Owner', asOwnerFremd],
    ]) {
      for (const tabelle of ['provider_accounts', 'provider_capabilities', 'tenant_payment_settings']) {
        const r = await c.from(tabelle).select('tenant_id').eq('tenant_id', tMain.id);
        ok(`${wer} sieht 0 Zeilen in ${tabelle}`, nichtsGesehen(r), r.error?.message ?? `n=${r.data?.length}`);
      }
    }
    for (const [wer, c] of [
      ['Owner', asOwner],
      ['Admin', asAdmin],
      ['Lehrende', asTeacher],
      ['Teilnehmende', asMember],
      ['fremde Owner', asOwnerFremd],
      ['anon', asAnon],
    ]) {
      const r = await c.from('provider_events_raw').select('id');
      ok(`${wer} sieht keine provider_events_raw`, nichtsGesehen(r), r.error?.message ?? `n=${r.data?.length}`);
      const f = await c.from('platform_flags').select('key');
      ok(`${wer} sieht keine platform_flags`, nichtsGesehen(f), f.error?.message ?? `n=${f.data?.length}`);
    }
    const rawService = await admin.from('provider_events_raw').select('id').eq('event_id', evtId);
    ok('service_role sieht provider_events_raw', !rawService.error && rawService.data?.length === 1);

    // --- 9. Unverändert: Buchen, Kassieren, Kartenverkauf ---
    console.log('\n  9. Bestehende Wege');
    const { data: kurs, error: kursErr } = await admin
      .from('courses')
      .insert({
        tenant_id: tMain.id,
        teacher_id: teacher.id,
        title: 'S12A_KURS',
        description: 'S1 1.2a Rundgang Kursbeschreibung lang genug',
        location: 'Test',
        status: 'active',
        frequency: 'one_time',
        max_participants: 10,
        price: 15,
        date: tag(7),
        time: '10:00:00',
        end_time: '11:00:00',
      })
      .select('id')
      .single();
    if (kursErr) abbruch('Kurs: ' + kursErr.message);

    const reg = await asMember.rpc('register_for_course', { p_course_id: kurs.id });
    ok('Anmelden wie vorher', !reg.error && reg.data?.success === true, reg.error?.message || JSON.stringify(reg.data));
    const { data: buchung, error: bErr } = await admin
      .from('registrations')
      .select('id, status, coverage_status, price_cents_at_booking')
      .eq('course_id', kurs.id)
      .eq('user_id', member.id)
      .single();
    if (bErr) abbruch('Buchung lesen: ' + bErr.message);
    ok(
      'Buchung registered/open/1500',
      buchung.status === 'registered' && buchung.coverage_status === 'open' && buchung.price_cents_at_booking === 1500,
      JSON.stringify(buchung)
    );

    const pay = await asTeacher.rpc('record_manual_payment', {
      p_registration_id: buchung.id,
      p_method: 'cash',
    });
    ok('Kassieren bar wie vorher', !pay.error && pay.data?.success === true, pay.error?.message || JSON.stringify(pay.data));
    const { data: nachZahlung } = await admin
      .from('registrations')
      .select('coverage_status')
      .eq('id', buchung.id)
      .single();
    ok('Deckung paid', nachZahlung?.coverage_status === 'paid');

    const prod = await asOwner.rpc('create_pass_product', {
      p_name: 'S12A 5er',
      p_units: 5,
      p_price_cents: 6000,
      p_validity_rule: 'years_to_year_end',
      p_validity_value: 3,
    });
    if (prod.error || !prod.data?.success) abbruch('create_pass_product: ' + (prod.error?.message || JSON.stringify(prod.data)));
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: member.id,
      p_product_id: prod.data.id,
      p_method: 'cash',
    });
    ok('Kartenverkauf wie vorher', !sell.error && sell.data?.success === true, sell.error?.message || JSON.stringify(sell.data));

    // --- 10. Aufräumen ---
    console.log('\n  10. Aufräumen');
    for (const t of [tMain.id, tFremd.id]) {
      const { error } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t });
      ok('delete_tenant_complete ' + t.slice(0, 8), !error, error?.message);
    }
    const { data: restAcc } = await admin.from('provider_accounts').select('id').eq('tenant_id', tMain.id);
    ok('Keine provider_accounts übrig', (restAcc || []).length === 0);
    const { data: restRaw } = await admin.from('provider_events_raw').select('id').eq('event_id', evtId);
    ok('Keine provider_events_raw übrig', (restRaw || []).length === 0);
    const { data: restTps } = await admin.from('tenant_payment_settings').select('tenant_id').eq('tenant_id', tMain.id);
    ok('Keine tenant_payment_settings übrig', (restTps || []).length === 0);

    console.log('\n  S1 1.2a Provider-Schema: alle Fälle grün.\n');
  } finally {
    await plattform(admin, platformWas);
    await resteEntfernen(admin);
  }
}

main().catch((e) => {
  console.error('\n  ' + (e.abbruch ? e.message : e.stack || e.message));
  process.exit(1);
});
