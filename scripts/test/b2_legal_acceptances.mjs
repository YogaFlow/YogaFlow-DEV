#!/usr/bin/env node
/**
 * B2 AVV — Rechte und AVV_MISSING (nur DEV). Studio b2avv.
 */
import {
  abbruch,
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const SLUG = 'b2avv';
const HASH = '081aa26d9251f364dd5594c4f3ddf5786c57bdb813ba1bcbf0f5c17208d639c5';
const VERSION = '2026-10-04';

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG], 'b2avv.');
    console.log('B2 AVV');
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'B2 AVV', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Avv',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Avv',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);

    await legalProfileSetzen(asOwner, { p_legal_name: 'AVV Studio', p_city: 'Berlin' });
    await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });

    const bad = await asOwner.rpc('accept_legal_document', {
      p_document: 'avv',
      p_version: '2099-01-01',
      p_content_hash: HASH,
    });
    ok('falsche Version', bad.data?.error === 'VERSION_MISMATCH', JSON.stringify(bad.data));

    const teacherTry = await asTeacher.rpc('accept_legal_document', {
      p_document: 'avv',
      p_version: VERSION,
      p_content_hash: HASH,
    });
    ok('Lehrende FORBIDDEN', teacherTry.data?.error === 'FORBIDDEN', JSON.stringify(teacherTry.data));

    const enableBefore = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok(
      'AVV_MISSING beim Einschalten',
      enableBefore.data?.error === 'AVV_MISSING' || enableBefore.data?.error === 'PROVIDER_NOT_READY',
      JSON.stringify(enableBefore.data),
    );

    const accept = await asOwner.rpc('accept_legal_document', {
      p_document: 'avv',
      p_version: VERSION,
      p_content_hash: HASH,
    });
    ok('AVV akzeptiert', accept.data?.success === true, JSON.stringify(accept.data));

    const status = await asOwner.rpc('get_legal_acceptance_status', { p_document: 'avv' });
    ok('Status accepted', status.data?.accepted === true && status.data?.current_version === VERSION);

    const again = await asOwner.rpc('accept_legal_document', {
      p_document: 'avv',
      p_version: VERSION,
      p_content_hash: HASH,
    });
    ok('idempotent', again.data?.success === true && again.data?.changed === false);

    console.log('\nFertig.');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform:', e);
    }
    try {
      await resteEntfernen(admin, [SLUG], 'b2avv.');
    } catch (e) {
      console.error('Reste:', e);
    }
  }
}

main().catch((e) => {
  console.error(e.abbruch ? e.message : e);
  process.exit(1);
});
