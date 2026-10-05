#!/usr/bin/env node
/**
 * RT-1 — Smoke: Impressum-Felder, Freigabe, öffentliche RPC (nur DEV).
 * Studio e2ert1leg — nicht demoalpha.
 */
import {
  abbruch,
  assertDevEnv,
  clientMitTenant,
  kursAnlegen,
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
    ok('AGB aktuell', statusOk.data?.terms?.status === 'current', JSON.stringify(statusOk.data?.terms));

    // Weitere Regeln → change_release; Stornofrist allein bleibt current
    await legalProfileSetzen(asOwner, {
      p_legal_name: 'Rita Recht Yoga',
      p_legal_form: 'sole_trader',
      p_extra_rules: 'Matte mitbringen.',
    });
    const statusExtra = await asOwner.rpc('get_studio_legal_status');
    ok(
      'Weitere Regeln → Änderung freigeben',
      statusExtra.data?.terms?.status === 'change_release',
      JSON.stringify(statusExtra.data?.terms),
    );

    await legalProfileSetzen(asOwner, {
      p_legal_name: 'Rita Recht Yoga',
      p_legal_form: 'sole_trader',
      p_extra_rules: null,
    });
    await studioLegalFreigeben(asOwner);
    const { createHash } = await import('node:crypto');
    const normalize = (t) =>
      String(t)
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n+$/g, '')
        .concat('\n');
    const hash = (t) => createHash('sha256').update(normalize(t), 'utf8').digest('hex');
    const bodySettings = '# AGB Test\n\nStand: Einstellungen.\n';
    const pubSettings = await asOwner.rpc('publish_studio_legal_document', {
      p_kind: 'terms',
      p_template_version: '2026-10-05',
      p_body_md: bodySettings,
      p_values: { extra_rules: '', cancellation_hours: '12 Stunden' },
      p_content_hash: hash(bodySettings),
      p_trigger: 'settings_change',
    });
    ok('settings publish', pubSettings.data?.success === true, JSON.stringify(pubSettings.data));
    const statusSettings = await asOwner.rpc('get_studio_legal_status');
    ok(
      'nur Einstellung → keine neue Freigabe',
      statusSettings.data?.terms?.status === 'current',
      JSON.stringify(statusSettings.data?.terms),
    );

    const pubTerms = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      'Öffentlich AGB lesbar',
      typeof pubTerms.data?.body_md === 'string' && pubTerms.data.body_md.includes('AGB'),
      JSON.stringify(pubTerms.data)?.slice(0, 200),
    );

    const pubImp = await asAnon.rpc('get_public_studio_legal', { p_kind: 'imprint' });
    ok('Öffentlich Impressum Antwort', pubImp.data?.success === true, JSON.stringify(pubImp.data));

    // terms_document_id: INSERT-Trigger (wie register_for_course / create_pending)
    const teacher = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'teacher@example.com',
      vorname: 'Tina',
      nachname: 'Teach',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const course = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'RT1 Free',
      date: '2099-06-01',
      price: 0,
    });
    const user = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'user@example.com',
      vorname: 'Una',
      nachname: 'User',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const { data: regRow, error: re } = await admin
      .from('registrations')
      .insert({
        user_id: user.id,
        course_id: course.id,
        tenant_id: tenant.id,
        status: 'registered',
        is_waitlist: false,
      })
      .select('id, terms_document_id')
      .single();
    if (re) abbruch('Registration insert: ' + re.message);
    ok(
      'terms_document_id gesetzt',
      typeof regRow?.terms_document_id === 'string' && regRow.terms_document_id.length > 10,
      JSON.stringify(regRow),
    );

    const { data: pdfJobs } = await admin
      .from('studio_legal_pdf_jobs')
      .select('id, status')
      .eq('tenant_id', tenant.id);
    ok(
      'PDF-Jobs enqueued',
      Array.isArray(pdfJobs) && pdfJobs.length >= 1,
      String(pdfJobs?.length ?? 0),
    );

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
