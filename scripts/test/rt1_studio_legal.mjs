#!/usr/bin/env node
/**
 * RT-1 — Smoke: Impressum-Felder, Freigabe, öffentliche RPC (nur DEV).
 * Studio e2ert1leg — nicht demoalpha.
 */
import {
  abbruch,
  assertDevEnv,
  clientMitTenant,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  resteEntfernen,
  seedPasswort,
  studioLegalFreigeben,
} from './_helpers.mjs';

const SLUG = 'e2ert1leg';
const EMAIL_PREFIX = 'e2ert1leg.';

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('RT-1 Studio-Rechtstexte');

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'RT1 Legal', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'owner@example.com',
      vorname: 'Rita',
      nachname: 'Recht',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asAnon = clientMitTenant(url, anon, SLUG);

    await legalProfileSetzen(asOwner, {
      p_legal_name: 'Rita Recht Yoga',
      p_legal_form: 'sole_trader',
    });

    const profile = await asOwner.rpc('get_studio_legal_profile');
    ok('Impressum vollständig', profile.data?.imprint_complete === true, JSON.stringify(profile.data));

    const statusMissing = await asOwner.rpc('get_studio_legal_status');
    ok(
      'AGB Status Freigeben',
      statusMissing.data?.terms?.status === 'release',
      JSON.stringify(statusMissing.data?.terms),
    );

    const pubBefore = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      'Öffentlich AGB ohne Freigabe ohne body',
      pubBefore.data?.success === true && !pubBefore.data?.body_md,
      JSON.stringify(pubBefore.data),
    );

    await studioLegalFreigeben(asOwner);

    const statusOk = await asOwner.rpc('get_studio_legal_status');
    ok('texts_ready', statusOk.data?.texts_ready === true, JSON.stringify(statusOk.data));

    const pubTerms = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      'Öffentlich AGB lesbar',
      typeof pubTerms.data?.body_md === 'string' && pubTerms.data.body_md.includes('AGB'),
      JSON.stringify(pubTerms.data)?.slice(0, 200),
    );

    const pubImp = await asAnon.rpc('get_public_studio_legal', { p_kind: 'imprint' });
    ok('Öffentlich Impressum Antwort', pubImp.data?.success === true, JSON.stringify(pubImp.data));

    console.log('rt1_studio_legal: ok');
  } finally {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch((e) =>
      console.warn('Aufräumen:', e?.message || e),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
