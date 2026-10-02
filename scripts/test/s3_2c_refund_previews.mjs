#!/usr/bin/env node
/**
 * 3.2c — Lese-RPCs der Erstattungs-Oberfläche:
 * get_registration_refund_states, preview_course_cancel_refunds,
 * preview_member_removal_refunds, get_payment_refunds (Rest, Rückbuchung).
 *
 * Voraussetzung: Migration 20261002210000 auf DEV.
 * Verwendung: node scripts/test/s3_2c_refund_previews.mjs
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const SLUG = 's32cprev';
const SLUG2 = 's32cprevb';
const EMAIL_PREFIX = 's32cprev';
const TITLE = 'S32C_PREV';

async function setupOnline(admin, asOwner, tenantId) {
  const up = await admin.rpc('upsert_provider_account', {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: 'acct_test_s32c_' + randomUUID().slice(0, 8),
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  });
  if (up.error || !up.data?.success) abbruch('upsert: ' + (up.error?.message || JSON.stringify(up.data)));
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: 'regular',
    p_vat_rate_bp: 1900,
    p_valid_from: berlinDate(-30),
  });
  if (tax.error || !tax.data?.success) abbruch('tax: ' + JSON.stringify(tax.data ?? tax.error));
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) abbruch('online on: ' + JSON.stringify(on.data ?? on.error));
  const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
  if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite.data ?? onsite.error));
}

async function payOnline(admin, userId, registrationId, amountCents) {
  const prep = await admin.rpc('prepare_online_payment', {
    p_registration_id: registrationId,
    p_user_id: userId,
  });
  if (prep.error || !prep.data?.success) abbruch('prepare: ' + JSON.stringify(prep.data ?? prep.error));
  const pi = 'pi_test_c_' + randomUUID().replace(/-/g, '').slice(0, 16);
  await admin.rpc('attach_payment_ref', { p_attempt_id: prep.data.attempt_id, p_provider_ref: pi });
  const done = await admin.rpc('complete_online_payment', {
    p_provider_ref: pi,
    p_amount_cents: amountCents,
    p_currency: 'EUR',
    p_received_at: new Date().toISOString(),
    p_livemode: false,
  });
  if (done.error || !done.data?.success) abbruch('complete: ' + JSON.stringify(done.data ?? done.error));
  return done.data.payment_id;
}

function itemFor(res, registrationId) {
  return (res.data?.items ?? []).find((i) => i.registration_id === registrationId) ?? null;
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('3.2c refund previews');
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S32c Vorschau', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'S32c Fremd', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio 2: ' + te2.message);

    const mk = (key, rolle, tenantId, vorname) =>
      nutzerAnlegen(admin, {
        email: `${EMAIL_PREFIX}.${key}@example.com`,
        vorname,
        nachname: 'Vorschau',
        rolle,
        tenantId,
        password,
      });
    const owner = await mk('owner', 'owner', tenant.id, 'Olga');
    const teacher = await mk('teacher', 'teacher', tenant.id, 'Tina');
    const a = await mk('a', 'user', tenant.id, 'Anna');
    const b = await mk('b', 'user', tenant.id, 'Ben');
    const owner2 = await mk('owner2', 'owner', tenant2.id, 'Fremd');

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asA = await login(url, anon, a.email, password, SLUG);
    const asB = await login(url, anon, b.email, password, SLUG);
    const asOwner2 = await login(url, anon, owner2.email, password, SLUG2);

    await setupOnline(admin, asOwner, tenant.id);

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Absage',
      date: berlinDate(6),
      price: 24,
      max_participants: 10,
    });
    const rA = await asA.rpc('register_for_course', { p_course_id: kurs.id });
    ok('A pending', rA.data?.status === 'pending_payment', JSON.stringify(rA.data));
    const payA = await payOnline(admin, a.id, rA.data.registration_id, 2400);
    const rB = await asB.rpc('register_for_course', { p_course_id: kurs.id });
    const payB = await payOnline(admin, b.id, rB.data.registration_id, 2400);
    void payB;

    console.log('\n1) get_registration_refund_states');
    const sA = await asA.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id, rB.data.registration_id],
    });
    ok('A success', sA.data?.success === true, JSON.stringify(sA.data ?? sA.error));
    ok('A sieht nur eigene', (sA.data?.items ?? []).length === 1, JSON.stringify(sA.data));
    const iA = itemFor(sA, rA.data.registration_id);
    ok('payment_cents 2400', iA?.payment_cents === 2400, JSON.stringify(iA));
    ok('refundable 2400', iA?.refundable_cents === 2400);
    ok('payment_id', iA?.payment_id === payA);
    ok('failed false', iA?.failed === false);

    const sOwner = await asOwner.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id, rB.data.registration_id],
    });
    ok('Owner sieht beide', (sOwner.data?.items ?? []).length === 2, JSON.stringify(sOwner.data));
    const sTeacher = await asTeacher.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    ok('Lehrende sehen nichts', (sTeacher.data?.items ?? []).length === 0, JSON.stringify(sTeacher.data));
    const sFremd = await asOwner2.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    ok('Fremd-Studio leer', (sFremd.data?.items ?? []).length === 0, JSON.stringify(sFremd.data));
    const { error: anonErr } = await clientMitTenant(url, anon, SLUG).rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    ok('anon kein EXECUTE', anonErr != null, String(anonErr?.code));

    console.log('\n2) preview_course_cancel_refunds');
    const pv = await asOwner.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    const pvRow = (pv.data?.courses ?? [])[0];
    ok('2 online, 4800', pvRow?.paid_count === 2 && pvRow?.refund_cents === 4800, JSON.stringify(pv.data));
    const pvT = await asTeacher.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    ok('Lehrende FORBIDDEN', pvT.data?.error === 'FORBIDDEN', JSON.stringify(pvT.data));
    const pvU = await asA.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    ok('Teilnehmende FORBIDDEN', pvU.data?.error === 'FORBIDDEN');
    const pvF = await asOwner2.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    ok('Fremd-Studio leer', (pvF.data?.courses ?? []).length === 0, JSON.stringify(pvF.data));

    console.log('\n3) Teilerstattung → Stand und Vorschau');
    const m1 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: payA,
      p_amount_cents: 1000,
      p_note: 'Kulanz',
    });
    ok('manual 10 REQUESTED', m1.data?.code === 'REQUESTED', JSON.stringify(m1.data));
    const sA2 = await asA.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    const iA2 = itemFor(sA2, rA.data.registration_id);
    ok('pending 1000, Rest 1400', iA2?.pending_cents === 1000 && iA2?.refundable_cents === 1400, JSON.stringify(iA2));
    const pv2 = await asOwner.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    ok('Vorschau 3800', (pv2.data?.courses ?? [])[0]?.refund_cents === 3800, JSON.stringify(pv2.data));

    const re = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const rec = await admin.rpc('record_online_refund', {
      p_payment_id: payA,
      p_refund_ref: re,
      p_amount_cents: 1000,
      p_received_at: new Date().toISOString(),
      p_refund_id: m1.data.refund_id,
    });
    ok('REFUNDED', rec.data?.code === 'REFUNDED', JSON.stringify(rec.data));
    const sA3 = await asA.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    const iA3 = itemFor(sA3, rA.data.registration_id);
    ok('refunded 1000', iA3?.refunded_cents === 1000 && iA3?.pending_cents === 0, JSON.stringify(iA3));

    console.log('\n4) get_payment_refunds');
    const gp = await asOwner.rpc('get_payment_refunds', { p_payment_id: payA });
    ok('amount 2400', gp.data?.amount_cents === 2400, JSON.stringify(gp.data));
    ok('refundable 1400', gp.data?.refundable_cents === 1400);
    ok('state partially_refunded', gp.data?.state === 'partially_refunded');
    ok('dispute_open false', gp.data?.dispute_open === false);
    ok('Liste 1 Eintrag', (gp.data?.refunds ?? []).length === 1);
    const gpF = await asOwner2.rpc('get_payment_refunds', { p_payment_id: payA });
    ok('Fremd-Studio NOT_FOUND/FORBIDDEN', gpF.data?.success === false, JSON.stringify(gpF.data));

    console.log('\n5) fehlgeschlagen');
    const m2 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: payA,
      p_amount_cents: 400,
      p_note: 'scheitert',
    });
    await admin.rpc('mark_refund_failed', {
      p_refund_id: m2.data.refund_id,
      p_failure_code: 'REFUND_FAILED',
    });
    const sA4 = await asA.rpc('get_registration_refund_states', {
      p_registration_ids: [rA.data.registration_id],
    });
    const iA4 = itemFor(sA4, rA.data.registration_id);
    ok('failed true, Rest 1400', iA4?.failed === true && iA4?.refundable_cents === 1400, JSON.stringify(iA4));

    console.log('\n6) preview_member_removal_refunds');
    const pm = await asOwner.rpc('preview_member_removal_refunds', { p_member_id: b.id });
    ok('B 1 / 2400', pm.data?.paid_count === 1 && pm.data?.refund_cents === 2400, JSON.stringify(pm.data));
    const pmT = await asTeacher.rpc('preview_member_removal_refunds', { p_member_id: b.id });
    ok('Lehrende FORBIDDEN', pmT.data?.error === 'FORBIDDEN');
    const pmF = await asOwner.rpc('preview_member_removal_refunds', { p_member_id: owner2.id });
    ok('Fremde Person NOT_FOUND', pmF.data?.error === 'NOT_FOUND', JSON.stringify(pmF.data));

    console.log('\n7) Dispute');
    await admin.rpc('record_payment_dispute', {
      p_payment_id: payA,
      p_provider_ref: 'du_test_' + randomUUID().replace(/-/g, '').slice(0, 12),
      p_amount_cents: 1400,
      p_status: 'needs_response',
    });
    const gp2 = await asOwner.rpc('get_payment_refunds', { p_payment_id: payA });
    ok('dispute_open true', gp2.data?.dispute_open === true, JSON.stringify(gp2.data));

    console.log('\n8) Vorschau = Auslöser');
    const pv3 = await asOwner.rpc('preview_course_cancel_refunds', { p_course_ids: [kurs.id] });
    const expected = (pv3.data?.courses ?? [])[0]?.refund_cents;
    const cancel = await asOwner.rpc('cancel_course', { p_course_id: kurs.id, p_scope: 'single' });
    ok('cancel ok', cancel.data?.success === true, JSON.stringify(cancel.data));
    ok(
      `refund_cents = Vorschau (${expected})`,
      cancel.data?.refund_cents === expected,
      JSON.stringify(cancel.data),
    );

    console.log('\n3.2c Vorschau OK');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform wiederherstellen:', e.message);
    }
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
