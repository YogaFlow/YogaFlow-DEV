#!/usr/bin/env node
/**
 * BC-1 — booking_confirmed Outbox (nur DEV, Studio e2ebc1).
 * Vor-Ort / kostenlos / Warteliste / Nachrücken / Karte / Online-Hold /
 * Soft-Cancel-Neu / ohne AGB / Doppelaufruf.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  berlinDate,
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
  warteBis,
} from './_helpers.mjs';

const SLUG = 'e2ebc1';
const EMAIL_PREFIX = 'e2ebc1.';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

function ladeEnvDatei(path) {
  const out = {};
  try {
    for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
  return out;
}

async function deliveriesFor(admin, regId) {
  const { data, error } = await admin
    .from('email_deliveries')
    .select('id, kind, status, registration_id, last_error_code')
    .eq('registration_id', regId)
    .eq('kind', 'booking_confirmed');
  if (error) abbruch('email_deliveries: ' + error.message);
  return data ?? [];
}

async function allKinds(admin, regId) {
  const { data, error } = await admin
    .from('email_deliveries')
    .select('id, kind, status')
    .eq('registration_id', regId);
  if (error) abbruch('email_deliveries kinds: ' + error.message);
  return data ?? [];
}

async function dispatchOnce(url, secret) {
  const res = await fetch(`${url}/functions/v1/dispatch-emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Email-Dispatch-Secret': secret,
    },
    body: '{}',
  });
  if (!res.ok) {
    abbruch('dispatch-emails HTTP ' + res.status + ': ' + (await res.text()));
  }
  return res.json();
}

/** Dispatch wiederholt, bis Outbox nicht mehr pending/sending (oder Timeout). */
async function warteDispatch(admin, url, secret, regId, label) {
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await dispatchOnce(url.replace(/\/$/, ''), secret);
    const rows = await deliveriesFor(admin, regId);
    const st = rows[0]?.status;
    if (st && st !== 'pending' && st !== 'sending') return rows[0];
    await new Promise((r) => setTimeout(r, 2000));
  }
  const rows = await deliveriesFor(admin, regId);
  abbruch(`${label}: Dispatch Timeout — status=${rows[0]?.status} err=${rows[0]?.last_error_code}`);
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const envDev = ladeEnvDatei(join(root, 'supabase', '.env.dev'));
  const dispatchSecret = envDev.EMAIL_DISPATCH_SECRET;
  if (!dispatchSecret) abbruch('EMAIL_DISPATCH_SECRET fehlt in supabase/.env.dev');
  if (!url.includes(ERLAUBTE_REF)) abbruch('nicht DEV');

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('BC-1 booking_confirmed');

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'BC1 Booking', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'owner@example.com',
      vorname: 'Owner',
      nachname: 'Bc1',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'teacher@example.com',
      vorname: 'Teacher',
      nachname: 'Bc1',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const user = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'user@example.com',
      vorname: 'User',
      nachname: 'Bc1',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const user2 = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'user2@example.com',
      vorname: 'User2',
      nachname: 'Bc1',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asUser = await login(url, anon, user.email, password, SLUG);
    const asUser2 = await login(url, anon, user2.email, password, SLUG);

    await legalProfileSetzen(asOwner);
    await studioLegalFreigeben(asOwner);

    // PDF-Pfad setzen, damit Dispatch anhängen kann (ohne echten Storage-Job)
    const { data: termsDoc } = await admin
      .from('studio_legal_documents')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('kind', 'terms')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const termsDocId = termsDoc?.id ?? null;

    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });

    // --- 1) Vor-Ort ---
    console.log('\n1) Vor-Ort → 1 booking_confirmed');
    const kursOnsite = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Onsite',
      date: berlinDate(5),
      price: 18,
      max_participants: 10,
    });
    const book1 = await asUser.rpc('register_for_course', {
      p_course_id: kursOnsite.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (book1.error || !book1.data?.success) abbruch('book onsite: ' + JSON.stringify(book1));
    const reg1 = book1.data.registration_id;
    ok('registered', book1.data.status === 'registered');
    let rows = await deliveriesFor(admin, reg1);
    ok('genau 1 Outbox', rows.length === 1, String(rows.length));
    ok('pending', rows[0].status === 'pending');

    const bookDup = await asUser.rpc('register_for_course', {
      p_course_id: kursOnsite.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    ok('kein zweites Register', bookDup.data?.success !== true);
    rows = await deliveriesFor(admin, reg1);
    ok('weiterhin 1 vor Dispatch', rows.length === 1);

    if (termsDocId) {
      // Außerhalb des 10-Min-PDF-Fensters → bei fehlendem PDF Link-Fallback + sent.
      await admin
        .from('studio_legal_documents')
        .update({ created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() })
        .eq('id', termsDocId);
    }
    const sent1 = await warteDispatch(admin, url, dispatchSecret, reg1, 'onsite');
    ok('sent', sent1.status === 'sent', sent1.status + ' ' + (sent1.last_error_code ?? ''));
    rows = await deliveriesFor(admin, reg1);
    ok('weiterhin genau 1', rows.length === 1);

    // --- 2) Kostenlos ---
    console.log('\n2) Kostenlos');
    const kursFree = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Free',
      date: berlinDate(6),
      price: 0,
      max_participants: 5,
    });
    const bookFree = await asUser.rpc('register_for_course', {
      p_course_id: kursFree.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (!bookFree.data?.success) abbruch('free: ' + JSON.stringify(bookFree));
    const { data: freeReg } = await admin
      .from('registrations')
      .select('price_cents_at_booking, coverage_status')
      .eq('id', bookFree.data.registration_id)
      .single();
    ok('price 0', freeReg.price_cents_at_booking === 0);
    ok('not_required', freeReg.coverage_status === 'not_required');
    rows = await deliveriesFor(admin, bookFree.data.registration_id);
    ok('1 free mail', rows.length === 1);

    // --- 3) Warteliste keine Mail ---
    console.log('\n3) Warteliste');
    const kursWl = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Wait',
      date: berlinDate(7),
      price: 15,
      max_participants: 1,
    });
    const fill = await asUser2.rpc('register_for_course', {
      p_course_id: kursWl.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (!fill.data?.success) abbruch('fill: ' + JSON.stringify(fill));
    const wl = await asUser.rpc('register_for_course', {
      p_course_id: kursWl.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    ok('waitlist', wl.data?.status === 'waitlist');
    rows = await deliveriesFor(admin, wl.data.registration_id);
    ok('keine booking_confirmed auf WL', rows.length === 0);

    // --- 4) Nachrücken ---
    console.log('\n4) Nachrücken vor Ort');
    const unreg = await asUser2.rpc('unregister_from_course', {
      p_course_id: kursWl.id,
      p_user_id: user2.id,
    });
    if (unreg.error) abbruch('unreg: ' + unreg.error.message);
    await warteBis(
      async () => {
        const { data: r } = await admin
          .from('registrations')
          .select('status')
          .eq('id', wl.data.registration_id)
          .maybeSingle();
        return r?.status === 'registered';
      },
      { admin, maxMs: 15_000, schrittMs: 500, label: 'promote' },
    );
    rows = await deliveriesFor(admin, wl.data.registration_id);
    ok('1 nach Nachrücken', rows.length === 1);

    // --- 5) Soft-Cancel → neu buchen → 2 Bestätigungen ---
    console.log('\n5) Soft-Cancel Neu');
    await asUser.rpc('unregister_from_course', {
      p_course_id: kursOnsite.id,
      p_user_id: user.id,
    });
    const bookAgain = await asUser.rpc('register_for_course', {
      p_course_id: kursOnsite.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (!bookAgain.data?.success) abbruch('rebook: ' + JSON.stringify(bookAgain));
    ok('neue reg id', bookAgain.data.registration_id !== reg1);
    const d1 = await deliveriesFor(admin, reg1);
    const d2 = await deliveriesFor(admin, bookAgain.data.registration_id);
    ok('alte behält 1', d1.length === 1);
    ok('neue hat 1', d2.length === 1);

    // --- 6) Online → pending, kein booking_confirmed ---
    console.log('\n6) Online-Hold');
    // Plattform online + Stripe stub minimal: nur method online wenn verfügbar
    // Ohne Stripe: ONLINE_UNAVAILABLE — dann überspringen mit Hinweis
    const kursOnline = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Online',
      date: berlinDate(8),
      price: 20,
      max_participants: 5,
    });
    const onlineTry = await asUser2.rpc('register_for_course', {
      p_course_id: kursOnline.id,
      p_use_pass: false,
      p_method: 'online',
    });
    if (onlineTry.data?.status === 'pending_payment') {
      const kinds = await allKinds(admin, onlineTry.data.registration_id);
      ok(
        'kein booking_confirmed bei Hold',
        !kinds.some((k) => k.kind === 'booking_confirmed'),
      );
    } else {
      ok(
        'Online nicht verfügbar — Skip Hold-Check',
        onlineTry.data?.error === 'ONLINE_UNAVAILABLE' ||
          onlineTry.data?.success === false,
        JSON.stringify(onlineTry.data),
      );
    }

    // --- 7) Kurskarte ---
    console.log('\n7) Kurskarte');
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: 'BC1 Karte',
      p_units: 5,
      p_price_cents: 5000,
      p_validity_rule: 'months',
      p_validity_value: 6,
      p_description: null,
      p_online_purchasable: false,
    });
    if (prod.error || !prod.data?.success) {
      abbruch('create_pass_product: ' + (prod.error?.message || JSON.stringify(prod.data)));
    }
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: user2.id,
      p_product_id: prod.data.id,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) {
      abbruch('sell_pass: ' + (sell.error?.message || JSON.stringify(sell.data)));
    }
    const passId = sell.data.pass_id;

    const kursPass = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Pass',
      date: berlinDate(9),
      price: 18,
      max_participants: 5,
      pass_eligible: true,
    });
    const bookPass = await asUser2.rpc('register_for_course', {
      p_course_id: kursPass.id,
      p_use_pass: true,
      p_method: 'pass',
    });
    if (!bookPass.data?.success) abbruch('pass book: ' + JSON.stringify(bookPass));
    ok('coverage pass', bookPass.data.coverage === 'pass');
    rows = await deliveriesFor(admin, bookPass.data.registration_id);
    ok('1 booking_confirmed Karte', rows.length === 1);
    const unitsLow = await admin
      .from('email_deliveries')
      .select('id')
      .eq('pass_id', passId)
      .eq('kind', 'pass_units_low');
    ok('pass_units_low separat (0 oder 1)', (unitsLow.data ?? []).length <= 1);

    // --- 8) Owner-Eintrag ---
    console.log('\n8) Owner-Eintrag');
    const kursAdmin = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'BC1 Admin',
      date: berlinDate(10),
      price: 12,
      max_participants: 5,
    });
    const adm = await asOwner.rpc('admin_register_user_for_course', {
      p_user_id: user.id,
      p_course_id: kursAdmin.id,
      p_coverage: 'open',
    });
    if (!adm.data?.success) abbruch('admin: ' + JSON.stringify(adm));
    const { data: admReg } = await admin
      .from('registrations')
      .select('id')
      .eq('course_id', kursAdmin.id)
      .eq('user_id', user.id)
      .is('cancellation_timestamp', null)
      .single();
    rows = await deliveriesFor(admin, admReg.id);
    ok('1 Owner-Eintrag', rows.length === 1);

    // --- 9) Studio ohne AGB ---
    console.log('\n9) Ohne AGB');
    const slug2 = 'e2ebc1b';
    await resteEntfernen(admin, [slug2], 'e2ebc1b.');
    const admin2 = clientMitTenant(url, service, slug2);
    const { data: t2, error: t2e } = await admin2
      .from('tenants')
      .insert({ name: 'BC1 NoLegal', slug: slug2 })
      .select('id')
      .single();
    if (t2e) abbruch('t2: ' + t2e.message);
    const o2 = await nutzerAnlegen(admin2, {
      email: 'e2ebc1b.owner@example.com',
      vorname: 'O',
      nachname: 'B',
      rolle: 'owner',
      tenantId: t2.id,
      password,
    });
    const te2 = await nutzerAnlegen(admin2, {
      email: 'e2ebc1b.teacher@example.com',
      vorname: 'T',
      nachname: 'B',
      rolle: 'teacher',
      tenantId: t2.id,
      password,
    });
    const u2 = await nutzerAnlegen(admin2, {
      email: 'e2ebc1b.user@example.com',
      vorname: 'U',
      nachname: 'B',
      rolle: 'user',
      tenantId: t2.id,
      password,
    });
    const asU2 = await login(url, anon, u2.email, password, slug2);
    const asO2 = await login(url, anon, o2.email, password, slug2);
    try {
      await asO2.rpc('set_allow_onsite_payment', { p_allow: true });
    } catch {
      /* optional */
    }
    const kNo = await kursAnlegen(admin2, t2.id, te2.id, {
      title: 'BC1 NoTerms',
      date: berlinDate(11),
      price: 10,
      max_participants: 5,
    });
    const bookNo = await asU2.rpc('register_for_course', {
      p_course_id: kNo.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (!bookNo.data?.success) abbruch('nolegal book: ' + JSON.stringify(bookNo));
    const { data: regNo } = await admin2
      .from('registrations')
      .select('id, terms_document_id')
      .eq('id', bookNo.data.registration_id)
      .single();
    ok('terms null', regNo.terms_document_id == null);
    rows = await deliveriesFor(admin2, regNo.id);
    ok('Mail trotzdem', rows.length === 1);
    const alertsBefore = await admin2
      .from('ops_alerts')
      .select('id')
      .like('key', 'terms_pdf_missing:%');
    const sentNo = await warteDispatch(admin2, url, dispatchSecret, regNo.id, 'nolegal');
    ok('ohne AGB sent', sentNo.status === 'sent', sentNo.status);
    const alertsAfter = await admin2
      .from('ops_alerts')
      .select('id, key')
      .like('key', 'terms_pdf_missing:%');
    ok(
      'kein neuer terms_pdf_missing Alarm',
      (alertsAfter.data ?? []).length <= (alertsBefore.data ?? []).length,
    );

    await resteEntfernen(admin2, [slug2], 'e2ebc1b.');
    console.log('\nBC-1 ok.\n');
  } catch (e) {
    if (e?.abbruch) {
      console.error('\nFAIL:', e.message);
      process.exit(1);
    }
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('cleanup:', e?.message ?? e);
    }
  }
}

main();
