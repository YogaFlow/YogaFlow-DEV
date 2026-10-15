/**
 * Allowlist + Rollout-Modus für Online-Zahlung (Release 2026-10).
 * Nur DEV. Stellt Plattform/Modus/Allowlist im finally wieder her.
 */
import { createClient } from '@supabase/supabase-js';
import {
  abbruch,
  assertDevEnv,
  ladeEnv,
  ok,
  seedPasswort,
} from './_helpers.mjs';

const stamp = Date.now().toString(36).slice(-6);
const SLUG_A = ('ala' + stamp).slice(0, 30);
const SLUG_B = ('alb' + stamp).slice(0, 30);
const PASS = seedPasswort();

function klient(url, anon, { email, password, tenant }) {
  const c = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-omlify-tenant': tenant } },
  });
  return {
    async login() {
      const { error } = await c.auth.signInWithPassword({ email, password });
      if (error) abbruch('login ' + email + ': ' + error.message);
      return c;
    },
  };
}

async function studioAnlegen(admin, slug, name) {
  const { data, error } = await admin.rpc('begin_tenant_onboarding', {
    p_name: name,
    p_slug: slug,
    p_legal_accepted: true,
  });
  if (error || !data?.success || !data.tenant_id) {
    abbruch('begin ' + slug + ': ' + (error?.message || JSON.stringify(data)));
  }
  return data.tenant_id;
}

async function ownerAnlegen(admin, { email, tenantId, vorname, nachname }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: {
      tenant_id: tenantId,
      role: 'owner',
      first_name: vorname,
      last_name: nachname,
    },
  });
  if (error) abbruch('owner ' + email + ': ' + error.message);
  return data.user.id;
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let modeWas = 'allowlist';
  let platformWas = false;
  let tenantA = null;
  let tenantB = null;
  const authIds = [];

  try {
    const { data: flagRow } = await admin
      .from('platform_flags')
      .select('enabled')
      .eq('key', 'online_payments')
      .single();
    platformWas = Boolean(flagRow?.enabled);

    const { data: rollout } = await admin
      .from('online_payments_rollout')
      .select('mode')
      .eq('id', true)
      .maybeSingle();
    modeWas = rollout?.mode === 'all' ? 'all' : 'allowlist';

    await admin.rpc('set_platform_flag', { p_key: 'online_payments', p_enabled: true });
    await admin.rpc('set_online_payments_rollout', { p_mode: 'allowlist' });

    tenantA = await studioAnlegen(admin, SLUG_A, 'Allowlist A');
    tenantB = await studioAnlegen(admin, SLUG_B, 'Allowlist B');
    const emailA = `owner-a-${stamp}@example.com`;
    const emailB = `owner-b-${stamp}@example.com`;
    authIds.push(await ownerAnlegen(admin, { email: emailA, tenantId: tenantA, vorname: 'A', nachname: 'Owner' }));
    authIds.push(await ownerAnlegen(admin, { email: emailB, tenantId: tenantB, vorname: 'B', nachname: 'Owner' }));

    // Nur A auf Allowlist
    await admin.rpc('set_online_payments_studio_allowed', { p_slug: SLUG_A, p_allowed: true });
    await admin.rpc('set_online_payments_studio_allowed', { p_slug: SLUG_B, p_allowed: false });

    const asA = await klient(url, anon, { email: emailA, password: PASS, tenant: SLUG_A }).login();
    const asB = await klient(url, anon, { email: emailB, password: PASS, tenant: SLUG_B }).login();

    const stA = await asA.rpc('get_payment_setup_status');
    const stB = await asB.rpc('get_payment_setup_status');
    ok('allowlist: A platform_enabled', stA.data?.platform_enabled === true, JSON.stringify(stA.data));
    ok('allowlist: B platform_enabled aus', stB.data?.platform_enabled === false, JSON.stringify(stB.data));

    const onB = await asB.rpc('set_online_payments_enabled', { p_enabled: true });
    ok(
      'allowlist: B set_online → PLATFORM_DISABLED',
      onB.data?.success === false && onB.data?.error === 'PLATFORM_DISABLED',
      JSON.stringify(onB.data),
    );

    // Owner darf Allowlist/Modus nicht schreiben
    const steal = await asA.rpc('set_online_payments_studio_allowed', {
      p_slug: SLUG_B,
      p_allowed: true,
    });
    ok(
      'Owner set_online_payments_studio_allowed → Fehler',
      Boolean(steal.error) || steal.data?.success === false,
      JSON.stringify(steal),
    );
    const modeSteal = await asA.rpc('set_online_payments_rollout', { p_mode: 'all' });
    ok(
      'Owner set_online_payments_rollout → Fehler',
      Boolean(modeSteal.error) || modeSteal.data?.success === false,
      JSON.stringify(modeSteal),
    );

    // Modus all → beide sichtbar; neues Studio auch
    await admin.rpc('set_online_payments_rollout', { p_mode: 'all' });
    const stB2 = await asB.rpc('get_payment_setup_status');
    ok('mode all: B platform_enabled', stB2.data?.platform_enabled === true, JSON.stringify(stB2.data));

    const slugC = ('alc' + stamp).slice(0, 30);
    const tenantC = await studioAnlegen(admin, slugC, 'Allowlist C');
    const emailC = `owner-c-${stamp}@example.com`;
    authIds.push(await ownerAnlegen(admin, { email: emailC, tenantId: tenantC, vorname: 'C', nachname: 'Owner' }));
    const asC = await klient(url, anon, { email: emailC, password: PASS, tenant: slugC }).login();
    const stC = await asC.rpc('get_payment_setup_status');
    ok('mode all: neues Studio sichtbar', stC.data?.platform_enabled === true, JSON.stringify(stC.data));

    // Plattform aus → niemand
    await admin.rpc('set_platform_flag', { p_key: 'online_payments', p_enabled: false });
    const stAOff = await asA.rpc('get_payment_setup_status');
    const stCOff = await asC.rpc('get_payment_setup_status');
    ok('plattform aus: A aus', stAOff.data?.platform_enabled === false, JSON.stringify(stAOff.data));
    ok('plattform aus: C aus (trotz all)', stCOff.data?.platform_enabled === false, JSON.stringify(stCOff.data));

    const list = await admin.rpc('list_online_payments_effective');
    ok('list_online_payments_effective ok', list.data?.success === true, JSON.stringify(list.data));

    console.log('\nOK online_payments_allowlist\n');
  } finally {
    try {
      await admin.rpc('set_online_payments_rollout', { p_mode: modeWas });
    } catch (e) {
      console.warn('restore mode:', e?.message || e);
    }
    try {
      await admin.rpc('set_platform_flag', {
        p_key: 'online_payments',
        p_enabled: platformWas,
      });
    } catch (e) {
      console.warn('restore platform:', e?.message || e);
    }
    for (const id of [tenantA, tenantB]) {
      if (!id) continue;
      try {
        await admin.rpc('delete_tenant_complete', { p_tenant_id: id });
      } catch (e) {
        console.warn('delete tenant:', e?.message || e);
      }
    }
    // tenant C falls angelegt
    try {
      const { data: rows } = await admin.from('tenants').select('id').eq('slug', ('alc' + stamp).slice(0, 30));
      for (const t of rows ?? []) {
        await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      }
    } catch (e) {
      console.warn('delete C:', e?.message || e);
    }
    for (const id of authIds) {
      try {
        await admin.auth.admin.deleteUser(id);
      } catch (e) {
        console.warn('delete auth:', e?.message || e);
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.abbruch ? err.message : err);
  process.exit(1);
});
