#!/usr/bin/env node
/**
 * B1 Teil A — Anbieterangaben, K2/K3 (nur DEV).
 * Studios b1legal / b1legalx. Plattform-Schalter sichern.
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  avvAkzeptieren,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const SLUG = 'b1legal';
const SLUG2 = 'b1legalx';
const EMAIL_PREFIX = 'b1legal';

function upsertArgs(tenantId, ref) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_status: 'active',
    p_ref: ref,
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  };
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('B1 Anbieterangaben / booking_payment_options');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'B1 Legal', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'B1 LegalX', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio2: ' + te2.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Legal',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const adminUser = await nutzerAnlegen(admin, {
      email: SLUG + '.admin@example.com',
      vorname: 'Admin',
      nachname: 'Legal',
      rolle: 'admin',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Legal',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const member = await nutzerAnlegen(admin, {
      email: SLUG + '.user@example.com',
      vorname: 'User',
      nachname: 'Legal',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const foreign = await nutzerAnlegen(admin, {
      email: SLUG2 + '.user@example.com',
      vorname: 'Fremd',
      nachname: 'User',
      rolle: 'user',
      tenantId: tenant2.id,
      password,
    });
    await nutzerAnlegen(admin, {
      email: SLUG2 + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Fremd',
      rolle: 'owner',
      tenantId: tenant2.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asAdmin = await login(url, anon, adminUser.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asMember = await login(url, anon, member.email, password, SLUG);
    const asForeign = await login(url, anon, foreign.email, password, SLUG);

    const badPlz = await asOwner.rpc('upsert_studio_legal_profile', {
      p_legal_name: 'Studio',
      p_street: 'Weg',
      p_house_number: '1',
      p_postal_code: '123',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: 'a@b.de',
    });
    ok('PLZ DE ungültig', badPlz.data?.error === 'VALIDATION' && badPlz.data?.field === 'postal_code');

    const badMail = await asOwner.rpc('upsert_studio_legal_profile', {
      p_legal_name: 'Studio',
      p_street: 'Weg',
      p_house_number: '1',
      p_postal_code: '10115',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: 'keine-mail',
    });
    ok('E-Mail ungültig', badMail.data?.error === 'VALIDATION' && badMail.data?.field === 'contact_email');

    const empty = await asOwner.rpc('upsert_studio_legal_profile', {
      p_legal_name: '  ',
      p_street: 'Weg',
      p_house_number: '1',
      p_postal_code: '10115',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: 'a@b.de',
    });
    ok('Name leer', empty.data?.error === 'VALIDATION' && empty.data?.field === 'legal_name');

    for (const [who, client] of [
      ['Admin', asAdmin],
      ['Lehrende', asTeacher],
      ['Teilnehmende', asMember],
    ]) {
      const res = await client.rpc('upsert_studio_legal_profile', {
        p_legal_name: 'X',
        p_street: 'Y',
        p_house_number: '1',
        p_postal_code: '10115',
        p_city: 'Berlin',
        p_country: 'DE',
        p_contact_email: 'a@b.de',
      });
      ok(`${who} schreibt nicht`, res.data?.error === 'FORBIDDEN', JSON.stringify(res.data));
    }

    const fremdWrite = await asForeign.rpc('upsert_studio_legal_profile', {
      p_legal_name: 'Hack',
      p_street: 'Weg',
      p_house_number: '1',
      p_postal_code: '10115',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: 'a@b.de',
    });
    ok(
      'fremdes Studio nicht',
      fremdWrite.data?.error === 'FORBIDDEN' || Boolean(fremdWrite.error),
      JSON.stringify(fremdWrite.data || fremdWrite.error),
    );

    const acctRef = 'acct_b1_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const up = await admin.rpc('upsert_provider_account', upsertArgs(tenant.id, acctRef));
    if (up.error || !up.data?.success) abbruch('upsert: ' + JSON.stringify(up));
    const tax = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (tax.error || !tax.data?.success) abbruch('tax: ' + JSON.stringify(tax));

    const noLegal = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok(
      'Einschalten ohne Angaben → LEGAL_PROFILE_MISSING',
      noLegal.data?.error === 'LEGAL_PROFILE_MISSING',
      JSON.stringify(noLegal.data),
    );

    const missing = await asMember.rpc('booking_payment_options');
    if (missing.error) abbruch('options: ' + missing.error.message);
    ok('ohne Angaben online_required false', missing.data?.online_required === false);
    ok(
      'ohne Online-Schalter reason ONLINE_DISABLED',
      missing.data?.reason === 'ONLINE_DISABLED',
      JSON.stringify(missing.data),
    );

    await legalProfileSetzen(asOwner);
    await avvAkzeptieren(asOwner);
    const saved = await asOwner.rpc('get_studio_legal_profile');
    ok('Owner liest Profil', saved.data?.present === true && saved.data?.legal_name === 'Yoga Test · Inhaberin');

    const adminRead = await asAdmin.rpc('get_studio_legal_profile');
    ok(
      'Admin liest Formular (RT-1 Manager)',
      adminRead.data?.present === true && adminRead.data?.legal_name === 'Yoga Test · Inhaberin',
      JSON.stringify(adminRead.data),
    );

    const info = await asMember.rpc('get_studio_provider_info');
    ok(
      'Teilnehmende sehen Anbieter ohne tax_id',
      info.data?.present === true && info.data?.legal_name && info.data?.tax_id === undefined,
      JSON.stringify(info.data),
    );

    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    ok('Einschalten mit Angaben', on.data?.success === true, JSON.stringify(on.data));
    const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite));

    const ok250 = await asMember.rpc('booking_payment_options', { p_amount_cents: 25000 });
    ok(
      '250,00 € online möglich',
      ok250.data?.online_required === true && ok250.data?.reason == null,
      JSON.stringify(ok250.data),
    );

    const over = await asMember.rpc('booking_payment_options', { p_amount_cents: 25001 });
    ok(
      '250,01 € AMOUNT_ABOVE_RECEIPT_LIMIT',
      over.data?.online_required === false && over.data?.reason === 'AMOUNT_ABOVE_RECEIPT_LIMIT',
      JSON.stringify(over.data),
    );

    const kursOk = await kursAnlegen(admin, tenant.id, teacher.id, { price: 24, title: 'B1 24' });
    const kursHigh = await kursAnlegen(admin, tenant.id, teacher.id, {
      price: 250.01,
      title: 'B1 250plus',
    });

    const bookOk = await asMember.rpc('register_for_course', {
      p_course_id: kursOk.id,
      p_use_pass: false,
    });
    ok(
      '24 € → pending_payment',
      bookOk.data?.status === 'pending_payment',
      JSON.stringify(bookOk.data),
    );

    const bookHigh = await asMember.rpc('register_for_course', {
      p_course_id: kursHigh.id,
      p_use_pass: false,
    });
    ok(
      '250,01 € → registered vor Ort',
      bookHigh.data?.status === 'registered',
      JSON.stringify(bookHigh.data),
    );

    const setup = await asOwner.rpc('get_payment_setup_status');
    ok('legal_profile_present', setup.data?.legal_profile_present === true);

    console.log('\nFertig.');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform wiederherstellen:', e);
    }
    try {
      await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    } catch (e) {
      console.error('Reste:', e);
    }
  }
}

main().catch((e) => {
  console.error(e.abbruch ? e.message : e);
  process.exit(1);
});
