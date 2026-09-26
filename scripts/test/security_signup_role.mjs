#!/usr/bin/env node
/**
 * Hotfix handle_new_user — Rollen aus signUp (nur DEV, nur nach
 * 20260926160500_security_handle_new_user_role_from_trusted_source.sql).
 *
 * Gegen PROD nie.
 *
 * Fälle:
 *  1) anon signUp role=owner auf demoalpha → Profil user, Audit-Zeile
 *  2) role=teacher und role=admin → user
 *  3) wie RegisterForm (ohne role) → user im richtigen Studio
 *  4) begin_tenant_onboarding + signUp role=owner → owner des neuen Studios
 *  5) zweiter signUp role=owner auf dasselbe Studio → user
 *  6) Admin-API createUser mit app_metadata.role=teacher → teacher
 *
 * Audit-Zeilen in demoalpha bleiben: audit_log ist append-only, und
 * actor_member_id ist NULL, damit das Löschen des Profils nicht an
 * ON DELETE RESTRICT scheitert. Das Onboarding-Studio wird per
 * delete_tenant_complete entfernt (löscht dessen Audit mit).
 *
 * Verwendung: node scripts/test/security_signup_role.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const PASSWORT = 'SecuritySignupTest123!';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stamp = Date.now().toString(36);

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function abbruch(text) {
  throw new Error(text);
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

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
  if (refAusKey(anonKey) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');

  const admin = client(url, service);
  const anon = client(url, anonKey);
  const authIds = [];
  let onboardingTenantId = null;

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', SLUG)
    .single();
  if (tErr || !tenant) abbruch('Tenant demoalpha nicht gefunden — npm run seed:dev');

  async function anmelden(label, data) {
    const email = `security.signup.${label}.${stamp}@example.com`;
    const { data: res, error } = await anon.auth.signUp({
      email,
      password: PASSWORT,
      options: { data },
    });
    if (error || !res.user?.id) abbruch(`signUp ${label}: ${error?.message || 'kein User'}`);
    authIds.push(res.user.id);
    await anon.auth.signOut();
    return res.user.id;
  }

  async function profilVon(authId) {
    const { data, error } = await admin
      .from('users')
      .select('id, role, tenant_id')
      .eq('auth_user_id', authId)
      .maybeSingle();
    if (error || !data) abbruch('Profil fehlt für ' + authId.slice(0, 8) + ': ' + (error?.message || 'keine Zeile'));
    return data;
  }

  try {
    const ownerTry = await anmelden('owner', { role: 'owner', tenant_id: tenant.id, first_name: 'Sec', last_name: 'Owner' });
    const ownerProfil = await profilVon(ownerTry);
    ok('owner auf bestehendem Studio wird user', ownerProfil.role === 'user' && ownerProfil.tenant_id === tenant.id, ownerProfil.role);
    const { data: audit, error: aErr } = await admin
      .from('audit_log')
      .select('action, actor_member_id')
      .eq('row_id', ownerProfil.id)
      .eq('action', 'security.role_downgraded_on_signup');
    if (aErr) abbruch('audit_log: ' + aErr.message);
    ok('Herabstufung steht im Audit, ohne Akteur', Array.isArray(audit) && audit.length === 1 && audit[0].actor_member_id === null);

    for (const rolle of ['teacher', 'admin']) {
      const id = await anmelden(rolle, { role: rolle, tenant_id: tenant.id, first_name: 'Sec', last_name: rolle });
      const profil = await profilVon(id);
      ok(`${rolle} auf bestehendem Studio wird user`, profil.role === 'user' && profil.tenant_id === tenant.id, profil.role);
    }

    const normal = await anmelden('user', { first_name: 'Sec', last_name: 'User', tenant_id: tenant.id });
    const normalProfil = await profilVon(normal);
    ok('RegisterForm bleibt user im Studio', normalProfil.role === 'user' && normalProfil.tenant_id === tenant.id, normalProfil.role);

    const slug = ('sec' + stamp).slice(0, 30);
    const { data: begun, error: bErr } = await admin.rpc('begin_tenant_onboarding', {
      p_name: 'Security Signup',
      p_slug: slug,
    });
    if (bErr || !begun?.success || !begun.tenant_id) {
      abbruch('begin_tenant_onboarding: ' + (bErr?.message || begun?.message || 'kein tenant_id'));
    }
    onboardingTenantId = begun.tenant_id;

    const ersterOwner = await anmelden('onboard', {
      role: 'owner',
      tenant_id: onboardingTenantId,
      first_name: 'Sec',
      last_name: 'Onboard',
    });
    const ersterProfil = await profilVon(ersterOwner);
    ok(
      'Onboarding-signUp wird owner des neuen Studios',
      ersterProfil.role === 'owner' && ersterProfil.tenant_id === onboardingTenantId,
      ersterProfil.role
    );

    const zweiter = await anmelden('onboard2', {
      role: 'owner',
      tenant_id: onboardingTenantId,
      first_name: 'Sec',
      last_name: 'Second',
    });
    const zweiterProfil = await profilVon(zweiter);
    ok('Zweiter owner-signUp wird user', zweiterProfil.role === 'user' && zweiterProfil.tenant_id === onboardingTenantId, zweiterProfil.role);

    const trustedEmail = `security.signup.trusted.${stamp}@example.com`;
    const { data: trusted, error: cErr } = await admin.auth.admin.createUser({
      email: trustedEmail,
      password: PASSWORT,
      email_confirm: true,
      user_metadata: { tenant_id: tenant.id, first_name: 'Sec', last_name: 'Trusted' },
      app_metadata: { role: 'teacher' },
    });
    if (cErr || !trusted.user) abbruch('createUser: ' + (cErr?.message || 'kein User'));
    authIds.push(trusted.user.id);
    const trustedProfil = await profilVon(trusted.user.id);
    ok('app_metadata teacher bleibt teacher', trustedProfil.role === 'teacher' && trustedProfil.tenant_id === tenant.id, trustedProfil.role);

    console.log('\n  Signup-Rollen: alle Fälle ok\n');
  } finally {
    if (onboardingTenantId) {
      const { error } = await admin.rpc('delete_tenant_complete', { p_tenant_id: onboardingTenantId });
      if (error) console.error('  Aufräumen Studio: ' + error.message);
    }
    for (const id of authIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.error('  Aufräumen Login ' + id.slice(0, 8) + ': ' + error.message);
    }
  }
}

main().catch((e) => {
  console.error('\n  FEHLER: ' + (e?.message || e) + '\n');
  process.exit(1);
});
