/**
 * NU-1 — send_studio_update Integration (nur DEV).
 * Eigenes Studio; Aufräumen über delete_tenant_complete.
 *
 *   node scripts/test/nu1_send_studio_update.mjs
 */
import { createClient } from '@supabase/supabase-js';
import {
  abbruch,
  assertDevEnv,
  ladeEnv,
  login,
  nutzerAnlegen,
  ok,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const stamp = Date.now().toString(36).slice(-6);
const SLUG = ('nu1upd' + stamp).slice(0, 30);
const SLUG_B = ('nu1b' + stamp).slice(0, 30);
const PASS = seedPasswort();
const PREFIX = 'nu1upd' + stamp;

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

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let tenantId = null;
  let tenantB = null;

  try {
    tenantId = await studioAnlegen(admin, SLUG, 'NU1 Updates');
    tenantB = await studioAnlegen(admin, SLUG_B, 'NU1 Fremd');

    const owner = await nutzerAnlegen(admin, {
      email: `${PREFIX}.owner@example.com`,
      vorname: 'Owner',
      nachname: 'Nu',
      rolle: 'owner',
      tenantId,
      password: PASS,
    });
    const adminUser = await nutzerAnlegen(admin, {
      email: `${PREFIX}.admin@example.com`,
      vorname: 'Admin',
      nachname: 'Nu',
      rolle: 'admin',
      tenantId,
      password: PASS,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: `${PREFIX}.teacher@example.com`,
      vorname: 'Teacher',
      nachname: 'Nu',
      rolle: 'teacher',
      tenantId,
      password: PASS,
    });
    const p1 = await nutzerAnlegen(admin, {
      email: `${PREFIX}.p1@example.com`,
      vorname: 'Teil',
      nachname: 'Eins',
      rolle: 'user',
      tenantId,
      password: PASS,
    });
    const p2 = await nutzerAnlegen(admin, {
      email: `${PREFIX}.p2@example.com`,
      vorname: 'Teil',
      nachname: 'Zwei',
      rolle: 'user',
      tenantId,
      password: PASS,
    });
    const p3 = await nutzerAnlegen(admin, {
      email: `${PREFIX}.p3@example.com`,
      vorname: 'Teil',
      nachname: 'Drei',
      rolle: 'user',
      tenantId,
      password: PASS,
    });
    const foreign = await nutzerAnlegen(admin, {
      email: `${PREFIX}.fremd@example.com`,
      vorname: 'Fremd',
      nachname: 'Studio',
      rolle: 'user',
      tenantId: tenantB,
      password: PASS,
    });

    // Rechte-Audit: anon ohne Session
    const anonClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-omlify-tenant': SLUG } },
    });
    const anonTry = await anonClient.rpc('send_studio_update', {
      p_recipient_ids: [],
      p_title: 'x',
      p_body: 'y',
      p_update_id: 'anon-probe',
    });
    ok(
      'anon → Fehler oder FORBIDDEN',
      Boolean(anonTry.error) ||
        (anonTry.data?.success === false && anonTry.data?.error === 'FORBIDDEN'),
      JSON.stringify(anonTry),
    );

    const asOwner = await login(url, anon, `${PREFIX}.owner@example.com`, PASS, SLUG);
    const asAdmin = await login(url, anon, `${PREFIX}.admin@example.com`, PASS, SLUG);
    const asTeacher = await login(url, anon, `${PREFIX}.teacher@example.com`, PASS, SLUG);

    const emailsBefore = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    const emailCountBefore = emailsBefore.count ?? 0;

    // Teacher → FORBIDDEN
    const teacherTry = await asTeacher.rpc('send_studio_update', {
      p_recipient_ids: [p1.id],
      p_title: 'Titel',
      p_body: 'Body vom Lehrer',
      p_update_id: '2026-10-test-teacher',
    });
    ok(
      'Teacher → FORBIDDEN',
      teacherTry.data?.success === false && teacherTry.data?.error === 'FORBIDDEN',
      JSON.stringify(teacherTry),
    );

    // Owner an 2 Ausgewählte + 1 Fremd-ID
    const ownerSend = await asOwner.rpc('send_studio_update', {
      p_recipient_ids: [p1.id, p2.id, foreign.id],
      p_title: 'Neu bei Test',
      p_body: 'Hallo von NU-1 Owner',
      p_update_id: '2026-10-test-owner',
    });
    ok(
      'Owner sent=2 skipped>=1',
      ownerSend.data?.success === true &&
        ownerSend.data?.sent === 2 &&
        ownerSend.data?.skipped >= 1,
      JSON.stringify(ownerSend.data),
    );

    const { count: n1 } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', p1.id)
      .eq('type', 'studio_update');
    const { count: n2 } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', p2.id)
      .eq('type', 'studio_update');
    const { count: n3 } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', p3.id)
      .eq('type', 'studio_update');
    const { count: nForeign } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', foreign.id)
      .eq('type', 'studio_update');

    ok('p1 hat Nachricht', (n1 ?? 0) === 1);
    ok('p2 hat Nachricht', (n2 ?? 0) === 1);
    ok('p3 keine Nachricht', (n3 ?? 0) === 0);
    ok('Fremd-Tenant keine studio_update', (nForeign ?? 0) === 0);

    // Admin an alle
    const adminSend = await asAdmin.rpc('send_studio_update', {
      p_recipient_ids: null,
      p_title: 'An alle',
      p_body: 'Hallo alle vom Admin',
      p_update_id: '2026-10-test-admin-all',
    });
    ok(
      'Admin an alle sent=3',
      adminSend.data?.success === true && adminSend.data?.sent === 3,
      JSON.stringify(adminSend.data),
    );

    const emailsAfter = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    ok(
      '0 neue email_deliveries',
      (emailsAfter.count ?? 0) === emailCountBefore,
      `before=${emailCountBefore} after=${emailsAfter.count}`,
    );

    // action_path leer
    const { data: sample } = await admin
      .from('user_notifications')
      .select('action_path, title, body, metadata')
      .eq('tenant_id', tenantId)
      .eq('type', 'studio_update')
      .eq('user_id', p1.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    ok('action_path leer', sample?.action_path === '');
    ok('metadata.update_id', sample?.metadata?.update_id === '2026-10-test-owner' || sample?.metadata?.update_id === '2026-10-test-admin-all');

    // Leere Nachricht
    const empty = await asOwner.rpc('send_studio_update', {
      p_recipient_ids: [p1.id],
      p_title: 'x',
      p_body: '   ',
      p_update_id: 'empty-try',
    });
    ok(
      'leere Nachricht → EMPTY_MESSAGE',
      empty.data?.success === false && empty.data?.error === 'EMPTY_MESSAGE',
      JSON.stringify(empty.data),
    );

    void owner;
    void adminUser;
    void teacher;

    console.log('\nNU-1 send_studio_update grün.');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG, SLUG_B], PREFIX);
    } catch (e) {
      console.warn('Aufräumen warn:', e?.message ?? e);
    }
  }
}

main().catch((e) => {
  if (e?.abbruch) {
    console.error(e.message);
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
