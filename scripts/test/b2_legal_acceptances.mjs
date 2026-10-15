#!/usr/bin/env node
/**
 * B2 AVV — Rechte und AVV_MISSING (nur DEV). Studio b2avv.
 * UX-4 N1: alte Zustimmung mit anderem content_hash zählt nicht.
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
/** Aktueller Markdown-Hash (legal_document_versions / AVV_CONTENT_HASH). */
const HASH = 'b90051caf84bc2deb99535bff2218eec4067d61209ba70d5294c04c20cd5e1d3';
const OLD_HASH = '081aa26d9251f364dd5594c4f3ddf5786c57bdb813ba1bcbf0f5c17208d639c5';
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

    // Alte Zustimmung (anderer Hash) → nicht aktuell, Online gesperrt
    const { error: staleIns } = await admin.from('legal_acceptances').insert({
      tenant_id: tenant.id,
      user_id: owner.id,
      document: 'avv',
      version: VERSION,
      content_hash: OLD_HASH,
    });
    if (staleIns) abbruch('Stale insert: ' + staleIns.message);

    const statusStale = await asOwner.rpc('get_legal_acceptance_status', {
      p_document: 'avv',
    });
    ok(
      'alte Hash-Zustimmung nicht accepted',
      statusStale.data?.accepted === false &&
        statusStale.data?.current_hash === HASH,
      JSON.stringify(statusStale.data),
    );

    const enableStale = await asOwner.rpc('set_online_payments_enabled', {
      p_enabled: true,
    });
    ok(
      'AVV_MISSING bei altem Hash',
      enableStale.data?.error === 'AVV_MISSING' ||
        enableStale.data?.error === 'PROVIDER_NOT_READY',
      JSON.stringify(enableStale.data),
    );

    const enableBefore = await asOwner.rpc('set_online_payments_enabled', {
      p_enabled: true,
    });
    ok(
      'AVV_MISSING beim Einschalten',
      enableBefore.data?.error === 'AVV_MISSING' ||
        enableBefore.data?.error === 'PROVIDER_NOT_READY',
      JSON.stringify(enableBefore.data),
    );

    const accept = await asOwner.rpc('accept_legal_document', {
      p_document: 'avv',
      p_version: VERSION,
      p_content_hash: HASH,
    });
    ok('AVV akzeptiert', accept.data?.success === true, JSON.stringify(accept.data));

    const status = await asOwner.rpc('get_legal_acceptance_status', { p_document: 'avv' });
    ok(
      'Status accepted',
      status.data?.accepted === true &&
        status.data?.current_version === VERSION &&
        status.data?.current_hash === HASH,
      JSON.stringify(status.data),
    );

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
