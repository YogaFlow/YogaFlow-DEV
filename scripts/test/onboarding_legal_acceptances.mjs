/**
 * RT-2 — Registrierung speichert terms+privacy+avv; kein Banner-Zustand.
 * Nur DEV. Räumt Studio per delete_tenant_complete auf.
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
const SLUG = ('leg' + stamp).slice(0, 30);
const PASS = seedPasswort();
const EMAIL = `legal-onboard-${stamp}@example.com`;

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let tenantId = null;
  let authId = null;

  try {
    // Ohne Zustimmung → begin scheitert
    const noLegal = await admin.rpc('begin_tenant_onboarding', {
      p_name: 'Legal Fail',
      p_slug: ('nof' + stamp).slice(0, 30),
      p_legal_accepted: false,
    });
    ok(
      'begin ohne legal → LEGAL_REQUIRED',
      noLegal.data?.success === false && noLegal.data?.error === 'LEGAL_REQUIRED',
      JSON.stringify(noLegal.data),
    );

    const { data: begun, error: bErr } = await admin.rpc('begin_tenant_onboarding', {
      p_name: 'Legal Onboard',
      p_slug: SLUG,
      p_legal_accepted: true,
    });
    if (bErr || !begun?.success || !begun.tenant_id) {
      abbruch('begin: ' + (bErr?.message || JSON.stringify(begun)));
    }
    tenantId = begun.tenant_id;

    const { data: tenantRow } = await admin
      .from('tenants')
      .select('onboarding_legal_accepted_at')
      .eq('id', tenantId)
      .single();
    ok(
      'onboarding_legal_accepted_at gesetzt',
      Boolean(tenantRow?.onboarding_legal_accepted_at),
      JSON.stringify(tenantRow),
    );
    const acceptedAt = tenantRow.onboarding_legal_accepted_at;

    // Owner via signUp-Pfad (user_metadata role=owner, frisches Studio)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASS,
      email_confirm: true,
      user_metadata: {
        tenant_id: tenantId,
        role: 'owner',
        first_name: 'Legal',
        last_name: 'Owner',
      },
    });
    if (cErr) abbruch('createUser: ' + cErr.message);
    authId = created.user.id;

    const { data: profil } = await admin
      .from('users')
      .select('id, role')
      .eq('auth_user_id', authId)
      .single();
    ok('Profil ist owner', profil?.role === 'owner', JSON.stringify(profil));

    const { data: accs, error: aErr } = await admin
      .from('legal_acceptances')
      .select('document, version, content_hash, accepted_at')
      .eq('tenant_id', tenantId)
      .order('document');
    if (aErr) abbruch('legal_acceptances: ' + aErr.message);

    const docs = (accs ?? []).map((r) => r.document).sort();
    ok('genau 3 Zeilen terms/privacy/avv', docs.join(',') === 'avv,privacy,terms', docs.join(','));

    const { data: versions } = await admin
      .from('legal_document_versions')
      .select('document, version, content_hash')
      .in('document', ['terms', 'privacy', 'avv']);
    const byDoc = Object.fromEntries((versions ?? []).map((v) => [v.document, v]));

    for (const row of accs ?? []) {
      const cur = byDoc[row.document];
      ok(
        `${row.document} Version/Hash aktuell`,
        cur && row.version === cur.version && row.content_hash === cur.content_hash,
        JSON.stringify({ row, cur }),
      );
      ok(
        `${row.document} accepted_at = Häkchen-Zeit`,
        row.accepted_at === acceptedAt,
        `${row.accepted_at} vs ${acceptedAt}`,
      );
    }

    // Status-RPCs wie Banner: alle accepted
    const client = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-omlify-tenant': SLUG } },
    });
    const { error: loginErr } = await client.auth.signInWithPassword({
      email: EMAIL,
      password: PASS,
    });
    if (loginErr) abbruch('login: ' + loginErr.message);

    for (const doc of ['terms', 'privacy', 'avv']) {
      const { data: st } = await client.rpc('get_legal_acceptance_status', {
        p_document: doc,
      });
      ok(`${doc} accepted=true`, st?.success === true && st?.accepted === true, JSON.stringify(st));
    }

    console.log('\nOK onboarding_legal_acceptances\n');
  } finally {
    if (tenantId) {
      try {
        await admin.rpc('delete_tenant_complete', { p_tenant_id: tenantId });
      } catch (e) {
        console.warn('delete tenant:', e?.message || e);
      }
    }
    if (authId) {
      try {
        await admin.auth.admin.deleteUser(authId);
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
