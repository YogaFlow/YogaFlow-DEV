#!/usr/bin/env node
/**
 * 2.2a-4a — provider_jobs Outbox (nur DEV, ohne Stripe-API).
 *
 * Nicht ausführen, bevor 20261001100000_stripe_2_2a_4a_provider_jobs.sql auf DEV liegt.
 * Gegen PROD nie. Studio s22a4ajobs, am Ende delete_tenant_complete.
 *
 * Verwendung: node scripts/test/s2_2a_4a_provider_jobs.mjs
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
  warteBis,
} from './_helpers.mjs';

const SLUG = 's22a4ajobs';
const EMAIL_PREFIX = 's22a4ajobs';
const TITLE = 'S22A4A_JOBS';

function upsertArgs(tenantId, ref) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: ref,
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  };
}

async function setupStudio(admin, asOwner, tenantId, acctRef) {
  const up = await admin.rpc('upsert_provider_account', upsertArgs(tenantId, acctRef));
  if (up.error || !up.data?.success) {
    abbruch('upsert: ' + (up.error?.message || JSON.stringify(up.data)));
  }
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: berlinDate(0),
  });
  if (tax.error || !tax.data?.success) {
    abbruch('tax: ' + (tax.error?.message || JSON.stringify(tax.data)));
  }
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) abbruch('online: ' + JSON.stringify(on.data));
  const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
  if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite.data));
}

async function jobsFor(admin, opts = {}) {
  let q = admin.from('provider_jobs').select('id, kind, attempt_id, payment_id, status, tries, next_run_at');
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.attempt_id) q = q.eq('attempt_id', opts.attempt_id);
  if (opts.payment_id) q = q.eq('payment_id', opts.payment_id);
  const { data, error } = await q;
  if (error) abbruch('provider_jobs: ' + error.message);
  return data || [];
}

function pi(tag) {
  return `pi_test_${tag}_` + randomUUID().replace(/-/g, '').slice(0, 12);
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('2.2a-4a provider_jobs');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S22a-4a Jobs', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const tenantId = tenant.id;
    const acctRef = 'acct_s22a4a_' + randomUUID().replace(/-/g, '').slice(0, 12);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Jobs',
      rolle: 'owner',
      tenantId,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Tea',
      nachname: 'Jobs',
      rolle: 'teacher',
      tenantId,
      password,
    });
    const a = await nutzerAnlegen(admin, {
      email: SLUG + '.a@example.com',
      vorname: 'Ann',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asA = await login(url, anon, a.email, password, SLUG);
    await setupStudio(admin, asOwner, tenantId, acctRef);

    // --- 1) Ablehnung mit pi_… → cancel_payment_intent ---
    console.log('\n1) mark_failed → cancel job');
    const kurs1 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Fail',
      date: berlinDate(10),
      price: 24,
      max_participants: 8,
    });
    const book1 = await asA.rpc('register_for_course', { p_course_id: kurs1.id });
    if (book1.error || !book1.data?.success) abbruch('book1: ' + JSON.stringify(book1));
    const prep1 = await admin.rpc('prepare_online_payment', {
      p_registration_id: book1.data.registration_id,
      p_user_id: a.id,
    });
    const piFail = pi('fail');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prep1.data.attempt_id,
      p_provider_ref: piFail,
    });
    const marked = await admin.rpc('mark_online_payment_failed', {
      p_provider_ref: piFail,
      p_failure_code: 'CARD_DECLINED',
    });
    ok('mark failed', marked.data?.success === true && marked.data.status === 'failed', JSON.stringify(marked.data));
    ok(
      'genau ein cancel job',
      (await jobsFor(admin, { kind: 'cancel_payment_intent', attempt_id: prep1.data.attempt_id })).length === 1,
    );

    // --- 2) Abbruch ohne provider_ref → kein Auftrag ---
    console.log('\n2) expire ohne pi_ → kein Job');
    const b = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Ben',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs2 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' NoRef',
      date: berlinDate(11),
      price: 24,
      max_participants: 8,
    });
    const { data: regNoPi, error: rnErr } = await admin.rpc('create_pending_registration', {
      p_course: kurs2.id,
      p_user: b.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: new Date(Date.now() + 2_000).toISOString(),
    });
    if (rnErr) abbruch('pending nopi: ' + rnErr.message);
    const prepNoPi = await admin.rpc('prepare_online_payment', {
      p_registration_id: regNoPi,
      p_user_id: b.id,
    });
    const jobsBefore = (await jobsFor(admin)).length;
    await warteBis(
      async () => {
        const { data } = await admin.from('registrations').select('status').eq('id', regNoPi).single();
        return data?.status === 'cancelled';
      },
      { admin, maxMs: 70_000, schrittMs: 2_000, label: 'expire ohne pi' },
    );
    const { data: attNoPi } = await admin
      .from('payment_attempts')
      .select('status, provider_ref')
      .eq('id', prepNoPi.data.attempt_id)
      .single();
    ok('Versuch canceled ohne ref', attNoPi?.status === 'canceled' && !attNoPi.provider_ref, JSON.stringify(attNoPi));
    ok('kein neuer Job ohne pi_', (await jobsFor(admin)).length === jobsBefore);

    // --- 3) Hold expire mit pi_ → cancel job ---
    console.log('\n3) expire mit pi_ → cancel');
    const c = await nutzerAnlegen(admin, {
      email: SLUG + '.c@example.com',
      vorname: 'Cy',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs3 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Expire',
      date: berlinDate(12),
      price: 24,
      max_participants: 8,
    });
    const { data: regExp } = await admin.rpc('create_pending_registration', {
      p_course: kurs3.id,
      p_user: c.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: new Date(Date.now() + 2_000).toISOString(),
    });
    const prepExp = await admin.rpc('prepare_online_payment', {
      p_registration_id: regExp,
      p_user_id: c.id,
    });
    const piExp = pi('exp');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepExp.data.attempt_id,
      p_provider_ref: piExp,
    });
    await warteBis(
      async () => {
        const { data } = await admin.from('registrations').select('status').eq('id', regExp).single();
        return data?.status === 'cancelled';
      },
      { admin, maxMs: 70_000, schrittMs: 2_000, label: 'expire mit pi' },
    );
    ok(
      'expire → cancel job',
      (await jobsFor(admin, { kind: 'cancel_payment_intent', attempt_id: prepExp.data.attempt_id })).length === 1,
    );

    // --- 4) SUPERSEDED (Muster s2_2a_1: failed+Geld COMPLETED supersedet anderen) ---
    console.log('\n4) SUPERSEDED');
    const d = await nutzerAnlegen(admin, {
      email: SLUG + '.d@example.com',
      vorname: 'Dee',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs4 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Super',
      date: berlinDate(13),
      price: 24,
      max_participants: 8,
    });
    const book4 = await (await login(url, anon, d.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs4.id,
    });
    const prepOld = await admin.rpc('prepare_online_payment', {
      p_registration_id: book4.data.registration_id,
      p_user_id: d.id,
    });
    const piOld = pi('old');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepOld.data.attempt_id,
      p_provider_ref: piOld,
    });
    await admin.rpc('mark_online_payment_failed', {
      p_provider_ref: piOld,
      p_failure_code: 'CARD_DECLINED',
    });
    const prepNew = await admin.rpc('prepare_online_payment', {
      p_registration_id: book4.data.registration_id,
      p_user_id: d.id,
    });
    const piNew = pi('new');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepNew.data.attempt_id,
      p_provider_ref: piNew,
    });
    const jobsNewBefore = await jobsFor(admin, { attempt_id: prepNew.data.attempt_id });
    // K4: complete auf failed-Versuch → COMPLETED, neuer Versuch SUPERSEDED
    const doneOld = await admin.rpc('complete_online_payment', {
      p_provider_ref: piOld,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('failed+Geld COMPLETED', doneOld.data?.code === 'COMPLETED', JSON.stringify(doneOld.data));
    const { data: attSup } = await admin
      .from('payment_attempts')
      .select('status, failure_code')
      .eq('id', prepNew.data.attempt_id)
      .single();
    ok(
      'anderer Versuch SUPERSEDED',
      attSup?.status === 'canceled' && attSup.failure_code === 'SUPERSEDED',
      JSON.stringify(attSup),
    );
    const jobsSup = await jobsFor(admin, {
      kind: 'cancel_payment_intent',
      attempt_id: prepNew.data.attempt_id,
    });
    ok('Cancel-Job nur für SUPERSEDED', jobsSup.length === 1, JSON.stringify({ jobsSup, jobsNewBefore }));
    ok(
      'COMPLETED-Versuch (failed→paid) ohne zusätzlichen Cancel',
      (await jobsFor(admin, { attempt_id: prepOld.data.attempt_id })).length === 1,
    );

    // --- 5) REFUND_REQUIRED → refund job (Muster s2_2a_1 Doppelzahlung) ---
    console.log('\n5) REFUND_REQUIRED');
    const f = await nutzerAnlegen(admin, {
      email: SLUG + '.f@example.com',
      vorname: 'Fay',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs5b = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Refund',
      date: berlinDate(15),
      price: 24,
      max_participants: 2,
    });
    const bookF = await (await login(url, anon, f.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs5b.id,
    });
    const pFa = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookF.data.registration_id,
      p_user_id: f.id,
    });
    const piFa = pi('fa');
    await admin.rpc('attach_payment_ref', { p_attempt_id: pFa.data.attempt_id, p_provider_ref: piFa });
    await admin.rpc('mark_online_payment_failed', {
      p_provider_ref: piFa,
      p_failure_code: 'CARD_DECLINED',
    });
    const pFb = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookF.data.registration_id,
      p_user_id: f.id,
    });
    const piFb = pi('fb');
    await admin.rpc('attach_payment_ref', { p_attempt_id: pFb.data.attempt_id, p_provider_ref: piFb });
    await admin.rpc('complete_online_payment', {
      p_provider_ref: piFb,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    const refund = await admin.rpc('complete_online_payment', {
      p_provider_ref: piFa,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'REFUND_REQUIRED ALREADY_BOOKED',
      refund.data?.code === 'REFUND_REQUIRED' && refund.data.reason === 'ALREADY_BOOKED',
      JSON.stringify(refund.data),
    );
    const refundJobs = await jobsFor(admin, {
      kind: 'refund_payment',
      payment_id: refund.data.payment_id,
    });
    ok('genau ein refund job', refundJobs.length === 1, JSON.stringify(refundJobs));
    const refundAgain = await admin.rpc('complete_online_payment', {
      p_provider_ref: piFa,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('ALREADY_COMPLETED', refundAgain.data?.code === 'ALREADY_COMPLETED');
    ok(
      'weiterhin ein refund job',
      (await jobsFor(admin, { kind: 'refund_payment', payment_id: refund.data.payment_id })).length === 1,
    );

    // --- 6) COMPLETED hält Holds ---
    console.log('\n6) COMPLETED hält Haltefelder');
    const g = await nutzerAnlegen(admin, {
      email: SLUG + '.g@example.com',
      vorname: 'Gus',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    // Kapazität 1: nach COMPLETED belegt der Platz trotz gesetzter Haltefelder (W6).
    const kurs6 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Holds',
      date: berlinDate(16),
      price: 24,
      max_participants: 1,
    });
    const book6 = await (await login(url, anon, g.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs6.id,
    });
    const { data: reg6before } = await admin
      .from('registrations')
      .select('hold_expires_at, hold_reason')
      .eq('id', book6.data.registration_id)
      .single();
    ok('Hold vor Abschluss gesetzt', !!reg6before?.hold_expires_at && !!reg6before.hold_reason);
    const prep6 = await admin.rpc('prepare_online_payment', {
      p_registration_id: book6.data.registration_id,
      p_user_id: g.id,
    });
    const pi6 = pi('hold');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prep6.data.attempt_id,
      p_provider_ref: pi6,
    });
    const done6 = await admin.rpc('complete_online_payment', {
      p_provider_ref: pi6,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('COMPLETED', done6.data?.code === 'COMPLETED');
    const { data: reg6 } = await admin
      .from('registrations')
      .select('status, coverage_status, hold_expires_at, hold_reason')
      .eq('id', book6.data.registration_id)
      .single();
    ok(
      'registered/paid mit Haltefeldern',
      reg6?.status === 'registered'
        && reg6.coverage_status === 'paid'
        && reg6.hold_expires_at === reg6before.hold_expires_at
        && reg6.hold_reason === reg6before.hold_reason,
      JSON.stringify(reg6),
    );
    // Wie s2_1b_a: get_course_participant_counts nur als authenticated (Tenant-Kontext).
    const { data: counts, error: countsErr } = await asOwner.rpc('get_course_participant_counts', {
      p_course_ids: [kurs6.id],
    });
    if (countsErr) abbruch('counts: ' + countsErr.message);
    const cnt = (counts || []).find((r) => r.course_id === kurs6.id);
    ok('Platzzählung registered_count = 1', Number(cnt?.registered_count) === 1, JSON.stringify(counts));
    const g2 = await nutzerAnlegen(admin, {
      email: SLUG + '.g2@example.com',
      vorname: 'Gia',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const bookG2 = await (await login(url, anon, g2.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs6.id,
    });
    ok(
      'zweite Person Warteliste (Platz belegt trotz Hold)',
      bookG2.data?.success === true && bookG2.data?.is_waitlist === true,
      JSON.stringify(bookG2.data ?? bookG2.error),
    );

    // --- 7) remove_member mit pi_… → anonymized ---
    console.log('\n7) remove_member mit pi_');
    const h = await nutzerAnlegen(admin, {
      email: SLUG + '.h@example.com',
      vorname: 'Hal',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs7 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Remove',
      date: berlinDate(17),
      price: 24,
      max_participants: 8,
    });
    const book7 = await (await login(url, anon, h.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs7.id,
    });
    const prep7 = await admin.rpc('prepare_online_payment', {
      p_registration_id: book7.data.registration_id,
      p_user_id: h.id,
    });
    const pi7 = pi('rm');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prep7.data.attempt_id,
      p_provider_ref: pi7,
    });
    const rm = await asOwner.rpc('remove_member', { p_member_id: h.id });
    ok('anonymized', rm.data?.success === true && rm.data.mode === 'anonymized', JSON.stringify(rm.data));
    const { data: att7 } = await admin
      .from('payment_attempts')
      .select('id, status, failure_code, provider_ref')
      .eq('id', prep7.data.attempt_id)
      .maybeSingle();
    ok('Versuch bleibt', !!att7 && att7.provider_ref === pi7, JSON.stringify(att7));
    ok(
      'MEMBER_REMOVED',
      att7?.status === 'canceled' && att7.failure_code === 'MEMBER_REMOVED',
      JSON.stringify(att7),
    );
    ok(
      'Cancel-Job nach remove',
      (await jobsFor(admin, { attempt_id: prep7.data.attempt_id })).length === 1,
    );

    // --- 7b) cancel_course + pi_… → remove_member anonymized ohne FK-Fehler (K7) ---
    console.log('\n7b) cancel_course dann remove_member (K7)');
    const i = await nutzerAnlegen(admin, {
      email: SLUG + '.i@example.com',
      vorname: 'Ivy',
      nachname: 'Jobs',
      rolle: 'user',
      tenantId,
      password,
    });
    const kurs7b = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' CancelRm',
      date: berlinDate(18),
      price: 24,
      max_participants: 8,
    });
    const book7b = await (await login(url, anon, i.email, password, SLUG)).rpc('register_for_course', {
      p_course_id: kurs7b.id,
    });
    if (book7b.error || !book7b.data?.success) abbruch('book7b: ' + JSON.stringify(book7b));
    const prep7b = await admin.rpc('prepare_online_payment', {
      p_registration_id: book7b.data.registration_id,
      p_user_id: i.id,
    });
    const pi7b = pi('crm');
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prep7b.data.attempt_id,
      p_provider_ref: pi7b,
    });
    const cancel7b = await asOwner.rpc('cancel_course', {
      p_course_id: kurs7b.id,
      p_scope: 'single',
      p_note: 'K7 Test Absage',
    });
    ok('cancel_course ok', cancel7b.data?.success === true, JSON.stringify(cancel7b.data ?? cancel7b.error));
    const { data: reg7bAfterCancel } = await admin
      .from('registrations')
      .select('id, status, cancel_reason')
      .eq('id', book7b.data.registration_id)
      .single();
    ok(
      'Buchung abgesagt (nicht member_removed)',
      reg7bAfterCancel?.status === 'cancelled'
        && reg7bAfterCancel.cancel_reason !== 'member_removed',
      JSON.stringify(reg7bAfterCancel),
    );
    const rm7b = await asOwner.rpc('remove_member', { p_member_id: i.id });
    ok(
      'remove nach Absage anonymized',
      rm7b.data?.success === true && rm7b.data.mode === 'anonymized' && !rm7b.error,
      JSON.stringify(rm7b.data ?? rm7b.error),
    );
    const { data: reg7bKeep } = await admin
      .from('registrations')
      .select('id')
      .eq('id', book7b.data.registration_id)
      .maybeSingle();
    ok('Buchung bleibt', !!reg7bKeep, JSON.stringify(reg7bKeep));
    const { data: att7b } = await admin
      .from('payment_attempts')
      .select('id, provider_ref')
      .eq('id', prep7b.data.attempt_id)
      .maybeSingle();
    ok('Versuch bleibt', !!att7b && att7b.provider_ref === pi7b, JSON.stringify(att7b));

    // --- 8) claim / finish (nur eigenes Studio; Fremde sofort zurück) ---
    console.log('\n8) claim und finish');
    const claimed1 = await admin.rpc('claim_provider_jobs', { p_limit: 100 });
    if (claimed1.error) abbruch('claim1: ' + claimed1.error.message);
    const claimedAll = claimed1.data || [];
    const claimedOwn = claimedAll.filter((j) => j.tenant_id === tenantId);
    const claimedForeign = claimedAll.filter((j) => j.tenant_id !== tenantId);
    let foreignReturned = 0;
    for (const j of claimedForeign) {
      const putBack = await admin.rpc('finish_provider_job', {
        p_job_id: j.job_id,
        p_outcome: 'release',
        p_error_code: null,
      });
      if (putBack.error || !putBack.data?.success) {
        abbruch('Fremd-Job zurück: ' + (putBack.error?.message || JSON.stringify(putBack.data)));
      }
      foreignReturned += 1;
    }
    if (foreignReturned > 0) {
      console.log(`  Fremde Aufträge zurückgegeben (release, ohne Zählung): ${foreignReturned}`);
    }
    ok('claim holt eigene Aufträge', claimedOwn.length >= 1, String(claimedOwn.length));
    const claimed2 = await admin.rpc('claim_provider_jobs', { p_limit: 100 });
    if (claimed2.error) abbruch('claim2: ' + claimed2.error.message);
    const claimed2Own = (claimed2.data || []).filter((j) => j.tenant_id === tenantId);
    const claimed2Foreign = (claimed2.data || []).filter((j) => j.tenant_id !== tenantId);
    for (const j of claimed2Foreign) {
      await admin.rpc('finish_provider_job', {
        p_job_id: j.job_id,
        p_outcome: 'release',
        p_error_code: null,
      });
      foreignReturned += 1;
    }
    if (claimed2Foreign.length > 0) {
      console.log(`  Fremde Aufträge (2. claim) zurückgegeben: ${claimed2Foreign.length}`);
    }
    ok('zweiter claim keine eigenen', claimed2Own.length === 0, JSON.stringify(claimed2Own));
    const one = claimedOwn[0];
    const { data: beforeRel } = await admin.from('provider_jobs').select('tries').eq('id', one.job_id).single();
    const rel = await admin.rpc('finish_provider_job', { p_job_id: one.job_id, p_outcome: 'release' });
    const { data: afterRel } = await admin
      .from('provider_jobs')
      .select('status, tries')
      .eq('id', one.job_id)
      .single();
    ok(
      'release: pending, tries − 1 (Claim nicht gezählt)',
      rel.data?.released === true
        && afterRel?.status === 'pending'
        && afterRel?.tries === Math.max((beforeRel?.tries ?? 1) - 1, 0),
      JSON.stringify({ rel: rel.data, beforeRel, afterRel }),
    );
    const relTwice = await admin.rpc('finish_provider_job', { p_job_id: one.job_id, p_outcome: 'release' });
    ok('release nur aus running', relTwice.data?.error === 'NOT_RUNNING', JSON.stringify(relTwice.data));
    const finRetry = await admin.rpc('finish_provider_job', {
      p_job_id: one.job_id,
      p_outcome: 'retry',
      p_error_code: 'TMP',
    });
    ok('retry ok', finRetry.data?.success === true && finRetry.data.status === 'pending', JSON.stringify(finRetry.data));
    const { data: jobRow } = await admin
      .from('provider_jobs')
      .select('status, tries, next_run_at, tenant_id')
      .eq('id', one.job_id)
      .single();
    ok(
      'next_run_at in der Zukunft (eigen)',
      jobRow?.tenant_id === tenantId
        && jobRow?.status === 'pending'
        && new Date(jobRow.next_run_at).getTime() > Date.now(),
      JSON.stringify(jobRow),
    );
    await admin.from('provider_jobs').update({ tries: 10, status: 'running' }).eq('id', one.job_id);
    const finFail = await admin.rpc('finish_provider_job', {
      p_job_id: one.job_id,
      p_outcome: 'retry',
      p_error_code: 'MAX',
    });
    ok('nach 10 Versuchen failed', finFail.data?.status === 'failed', JSON.stringify(finFail.data));

    // --- 9) Rechte authenticated ---
    console.log('\n9) Rechte');
    const deniedOrEmpty = (label, { data, error }) => {
      const code = error?.code ?? '';
      const msg = String(error?.message ?? '');
      const perm =
        code === '42501'
        || /permission denied/i.test(msg)
        || /42501/.test(msg);
      if (perm) {
        ok(label, true, msg || code);
        return;
      }
      if (!error && (data == null || (Array.isArray(data) && data.length === 0))) {
        ok(label, true);
        return;
      }
      ok(label, false, error?.message || JSON.stringify(data));
    };
    deniedOrEmpty('authenticated liest nicht', await asA.from('provider_jobs').select('id'));
    deniedOrEmpty('claim verweigert', await asA.rpc('claim_provider_jobs', { p_limit: 1 }));
    deniedOrEmpty(
      'finish verweigert',
      await asA.rpc('finish_provider_job', {
        p_job_id: one.job_id,
        p_outcome: 'done',
      }),
    );

    // --- 10) record_online_refund + Ledger + Glocke/Outbox ---
    console.log('\n10) record_online_refund');
    const payId = refund.data.payment_id;
    const reRef = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const rec = await admin.rpc('record_online_refund', {
      p_payment_id: payId,
      p_refund_ref: reRef,
      p_amount_cents: 2400,
      p_received_at: new Date().toISOString(),
    });
    ok('REFUNDED', rec.data?.code === 'REFUNDED' && !!rec.data.payment_id, JSON.stringify(rec.data));
    const reverseId = rec.data.payment_id;
    const { data: revPay } = await admin
      .from('payments')
      .select('id, amount_cents, reverses_payment_id')
      .eq('id', reverseId)
      .single();
    ok('Gegenzeile', revPay?.reverses_payment_id === payId && revPay.amount_cents < 0, JSON.stringify(revPay));
    const { count: evRev } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment.reversed')
      .eq('subject_id', reverseId);
    ok('Event payment.reversed', (evRev ?? 0) >= 1);
    const led = await admin.rpc('process_ledger', { p_limit: 100 });
    ok('process_ledger failed 0', (led.data?.failed ?? 0) === 0, JSON.stringify(led.data));
    const { data: entries } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .eq('payment_id', reverseId)
      .eq('tenant_id', tenantId);
    ok(
      'psp_clearing Gegenzeile',
      (entries || []).some((e) => e.account === 'psp_clearing' && e.credit_cents === 2400),
      JSON.stringify(entries),
    );
    const { count: glockeRe } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment_refunded')
      .eq('user_id', f.id);
    ok('Glocke payment_refunded', (glockeRe ?? 0) >= 1);
    const { count: outRe } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'payment_refunded')
      .eq('registration_id', bookF.data.registration_id);
    ok('Outbox payment_refunded', (outRe ?? 0) >= 1);

    console.log('\n2.2a-4a provider_jobs: grün');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (err) {
      console.error('Aufräumen:', err.message);
    }
    try {
      await plattform(admin, platformWas);
    } catch (err) {
      console.error('Plattform:', err.message);
    }
  }
}

main().catch((err) => {
  console.error(err.abbruch ? err.message : err);
  process.exit(1);
});
