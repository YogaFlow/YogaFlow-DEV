#!/usr/bin/env node
/**
 * A5 — Karte vor Ort verkaufen (nur DEV).
 *
 * Nicht ausführen, bevor 20260927213000_a5_passes.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio a5passtest, am Ende delete_tenant_complete
 * und die Test-Logins per auth.admin.deleteUser.
 *
 * Fälle:
 *  1) Owner verkauft 10er bar → Zahlung, Karte, Bewegung +10, Events mit
 *     gleicher causation_id, Audit, Event ohne Name.
 *  2) Produktpreis 16000 → Karte bleibt 15000.
 *  3) Lehrende verkauft 5er (6 Monate) PayPal, storniert in 15 Min → revoked.
 *  4) Fremde Karte / ältere Zahlung (service_role-INSERT mit altem created_at)
 *     → FORBIDDEN für Lehrende; Owner storniert → Erfolg.
 *  5) reverse_manual_payment auf Kartenzahlung → USE_REVOKE_PASS.
 *  6) Teilnehmerin sell_pass → FORBIDDEN; liest nur eigene; get ohne Preis.
 *  7) Lehrende SELECT passes → 0; get_member_passes → Rest ohne Preis.
 *     get_sellable_pass_products → Liste mit Preis; Teilnehmerin FORBIDDEN.
 *  8) Archiviertes Produkt → PRODUCT_ARCHIVED und fehlt in sellable-Liste;
 *     anonymisierte Person → MEMBER_REMOVED; falsche Zahlart → INVALID_METHOD.
 *  9) UPDATE/DELETE pass_movements service_role → Trigger; UPDATE units_total
 *     → Fehler.
 * 10) redeem-Bewegung (service_role) → ALREADY_USED.
 * 11) remove_member nur mit Karte → anonymized, Karte bleibt.
 * 12) delete_tenant_complete räumt Studio mit Karten ab.
 *
 * Verwendung: node scripts/test/a5_passes.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a5passtest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function seedPasswort() {
  const src = readFileSync(join(root, 'scripts', 'seed-dev.mjs'), 'utf8');
  const pass = src.match(/const DEMO_PASSWORT = '([^']+)'/);
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  return pass[1];
}

function abbruch(text) {
  const fehler = new Error(text);
  fehler.abbruch = true;
  throw fehler;
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

function berlinToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function yearEndPlus(n) {
  return `${Number(berlinToday().slice(0, 4)) + n}-12-31`;
}

function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  // PostgreSQL: monatsüberlauf kürzt auf letzten Tag; UTC-Konstruktion vermeidet TZ-Drift.
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function clientMitTenant(url, key, slug) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', slug);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function authNutzer(admin) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      const mail = u.email ?? '';
      if (mail.startsWith(SLUG + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', SLUG);
  if (error) abbruch('Studio lesen: ' + error.message);
  for (const t of tenants || []) {
    const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
    if (e) abbruch('Studio löschen: ' + e.message);
  }
  for (const u of await authNutzer(admin)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e && !/not found/i.test(e.message)) {
      abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
    }
  }
}

async function nutzerAnlegen(admin, { email, vorname, nachname, rolle, tenantId, password }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { tenant_id: tenantId, first_name: vorname, last_name: nachname },
    app_metadata: { role: rolle },
  });
  if (error) abbruch('Nutzer ' + email + ': ' + error.message);

  const { data: profil, error: eProfil } = await admin
    .from('users')
    .select('id, email, role, tenant_id, auth_user_id')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified ' + email + ': ' + e2.message);
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

function fehler(data, code, name) {
  ok(
    name,
    data?.success === false && data?.error === code,
    `success=${data?.success} error=${data?.error}`
  );
  return data;
}

function dmlVerweigert(error, name) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  ok(
    name,
    Boolean(error) && /42501|permission|denied|nicht erlaubt|append-only|unveränderlich/i.test(text),
    text
  );
}

async function verkaufen(client, memberId, productId, method) {
  const { data, error } = await client.rpc('sell_pass', {
    p_member_id: memberId,
    p_product_id: productId,
    p_method: method,
  });
  if (error) abbruch(`sell_pass: ${error.message}`);
  return data;
}

async function stornieren(client, passId, note = null) {
  const args = { p_pass_id: passId };
  if (note != null) args.p_note = note;
  const { data, error } = await client.rpc('revoke_pass', args);
  if (error) abbruch(`revoke_pass: ${error.message}`);
  return data;
}

let devOk = false;

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  devOk = true;

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  await resteEntfernen(admin);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A5 Kartenverkauf', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const teilnehmerin = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmerin@example.com', vorname: 'Anna', nachname: 'Andersen', rolle: 'user', tenantId: tenant.id, password,
  });
  const passOnly = await nutzerAnlegen(admin, {
    email: SLUG + '.passonly@example.com', vorname: 'Paula', nachname: 'Pass', rolle: 'user', tenantId: tenant.id, password,
  });

  const asOwner = await login(url, anon, owner.email, password, SLUG);
  const asTeacher = await login(url, anon, teacher.email, password, SLUG);
  const asUser = await login(url, anon, teilnehmerin.email, password, SLUG);

  const { data: zehnProd, error: zErr } = await asOwner.rpc('create_pass_product', {
    p_name: '10er-Karte',
    p_units: 10,
    p_price_cents: 15000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 3,
  });
  if (zErr || !zehnProd?.success) abbruch('10er anlegen: ' + (zErr?.message || JSON.stringify(zehnProd)));

  const { data: fuenfProd, error: fErr } = await asOwner.rpc('create_pass_product', {
    p_name: '5er-Karte',
    p_units: 5,
    p_price_cents: 8000,
    p_validity_rule: 'months',
    p_validity_value: 6,
  });
  if (fErr || !fuenfProd?.success) abbruch('5er anlegen: ' + (fErr?.message || JSON.stringify(fuenfProd)));

  console.log('\n1) Owner verkauft 10er bar');
  const erwartetUntil = yearEndPlus(3);
  const verkauf = await verkaufen(asOwner, teilnehmerin.id, zehnProd.id, 'cash');
  ok(
    'sell_pass Erfolg',
    verkauf?.success === true && verkauf.pass_id && verkauf.payment_id && verkauf.valid_until === erwartetUntil,
    JSON.stringify(verkauf)
  );

  const { data: pay, error: pErr } = await admin
    .from('payments')
    .select('id, subject_type, registration_id, amount_cents, method, recorded_by')
    .eq('id', verkauf.payment_id)
    .single();
  if (pErr) abbruch(pErr.message);
  ok(
    'Zahlung pass_purchase 15000',
    pay.subject_type === 'pass_purchase'
      && pay.registration_id === null
      && pay.amount_cents === 15000
      && pay.method === 'cash'
      && pay.recorded_by === owner.id
  );

  const { data: karte, error: kErr } = await admin
    .from('passes')
    .select('*')
    .eq('id', verkauf.pass_id)
    .single();
  if (kErr) abbruch(kErr.message);
  ok(
    'Karte mit Kopien',
    karte.name === '10er-Karte'
      && karte.units_total === 10
      && karte.price_cents === 15000
      && karte.validity_rule === 'years_to_year_end'
      && karte.validity_value === 3
      && karte.valid_until === erwartetUntil
      && karte.status === 'active'
      && karte.payment_id === verkauf.payment_id
  );

  const { data: moves, error: mErr } = await admin
    .from('pass_movements')
    .select('delta, kind')
    .eq('pass_id', verkauf.pass_id);
  if (mErr) abbruch(mErr.message);
  ok('Bewegung +10 purchase', moves?.length === 1 && moves[0].delta === 10 && moves[0].kind === 'purchase');

  const { data: events, error: eErr } = await admin
    .from('events')
    .select('type, subject_id, payload, causation_id')
    .in('type', ['payment.recorded', 'pass.purchased'])
    .or(`subject_id.eq.${verkauf.payment_id},subject_id.eq.${verkauf.pass_id}`);
  if (eErr) abbruch(eErr.message);
  const payEv = (events || []).find((e) => e.type === 'payment.recorded');
  const passEv = (events || []).find((e) => e.type === 'pass.purchased');
  ok('beide Events', Boolean(payEv && passEv));
  ok('gleiche causation_id', payEv.causation_id === passEv.causation_id);
  ok(
    'pass.purchased ohne Name',
    !JSON.stringify(passEv.payload).includes('10er')
      && !JSON.stringify(passEv.payload).includes('Andersen')
      && passEv.payload?.pass_id === verkauf.pass_id
      && passEv.payload?.units === 10
      && passEv.payload?.price_cents === 15000
  );

  const { data: audit2, error: a2Err } = await admin
    .from('audit_log')
    .select('action, row_id')
    .in('action', ['payment.recorded', 'pass.purchased'])
    .in('row_id', [verkauf.payment_id, verkauf.pass_id]);
  if (a2Err) abbruch(a2Err.message);
  ok('Audit vorhanden', (audit2 || []).length >= 2, JSON.stringify(audit2));

  console.log('\n2) Produktpreis ändern, Karte unverändert');
  const { data: upd, error: uErr } = await asOwner.rpc('update_pass_product', {
    p_id: zehnProd.id,
    p_name: '10er-Karte',
    p_units: 10,
    p_price_cents: 16000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 3,
  });
  if (uErr || !upd?.success) abbruch('Preisupdate: ' + (uErr?.message || JSON.stringify(upd)));
  const { data: karte2 } = await admin.from('passes').select('price_cents').eq('id', verkauf.pass_id).single();
  ok('Karte bleibt 15000', karte2?.price_cents === 15000);

  console.log('\n3) Lehrende verkauft 5er und storniert');
  const erwartetMonths = addMonths(berlinToday(), 6);
  const verkauf5 = await verkaufen(asTeacher, teilnehmerin.id, fuenfProd.id, 'paypal_manual');
  ok(
    'Lehrende Verkauf',
    verkauf5?.success === true && verkauf5.valid_until === erwartetMonths,
    `got ${verkauf5?.valid_until} expected ${erwartetMonths}`
  );
  const storno = await stornieren(asTeacher, verkauf5.pass_id, 'Tippfehler');
  ok('Storno in 15 Min', storno?.success === true, JSON.stringify(storno));

  const { data: revoked } = await admin.from('passes').select('status, revoked_at').eq('id', verkauf5.pass_id).single();
  ok('Status revoked', revoked?.status === 'revoked' && Boolean(revoked?.revoked_at));

  const { data: moves5 } = await admin.from('pass_movements').select('delta, kind, reason').eq('pass_id', verkauf5.pass_id).order('created_at');
  const revMove = (moves5 || []).find((m) => m.kind === 'revoke');
  ok('revoke −5 und reason', revMove?.delta === -5 && revMove?.reason === 'Tippfehler');
  const sum5 = (moves5 || []).reduce((s, m) => s + m.delta, 0);
  ok('Stand 0', sum5 === 0);

  const { data: gegen } = await admin
    .from('payments')
    .select('amount_cents, reverses_payment_id')
    .eq('reverses_payment_id', verkauf5.payment_id)
    .maybeSingle();
  ok('Gegenzeile −8000', gegen?.amount_cents === -8000);

  console.log('\n4) Fremde / ältere Karte');
  fehler(await stornieren(asTeacher, verkauf.pass_id), 'FORBIDDEN', 'fremde Karte (Owner-Verkauf)');

  const altPayId = crypto.randomUUID();
  const altPassId = crypto.randomUUID();
  const altReceived = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { error: insPayErr } = await admin.from('payments').insert({
    id: altPayId,
    tenant_id: tenant.id,
    subject_type: 'pass_purchase',
    subject_id: altPassId,
    registration_id: null,
    provider: 'manual',
    method: 'cash',
    status: 'succeeded',
    amount_cents: 8000,
    currency: 'EUR',
    received_at: altReceived,
    recorded_by: teacher.id,
    created_at: altReceived,
  });
  if (insPayErr) abbruch('alte Zahlung: ' + insPayErr.message);
  const { error: insPassErr } = await admin.from('passes').insert({
    id: altPassId,
    tenant_id: tenant.id,
    member_id: teilnehmerin.id,
    product_id: fuenfProd.id,
    name: '5er-Karte',
    units_total: 5,
    price_cents: 8000,
    validity_rule: 'months',
    validity_value: 6,
    valid_from: berlinToday(),
    valid_until: erwartetMonths,
    payment_id: altPayId,
    status: 'active',
  });
  if (insPassErr) abbruch('alte Karte: ' + insPassErr.message);
  const { error: insMvErr } = await admin.from('pass_movements').insert({
    tenant_id: tenant.id,
    pass_id: altPassId,
    delta: 5,
    kind: 'purchase',
    actor_member_id: teacher.id,
  });
  if (insMvErr) abbruch('alte Bewegung: ' + insMvErr.message);

  fehler(await stornieren(asTeacher, altPassId), 'FORBIDDEN', 'ältere eigene Zahlung');
  const ownerStorno = await stornieren(asOwner, altPassId);
  ok('Owner storniert ältere', ownerStorno?.success === true, JSON.stringify(ownerStorno));

  console.log('\n5) reverse_manual_payment auf Kartenzahlung');
  const { data: revTry, error: revErr } = await asOwner.rpc('reverse_manual_payment', {
    p_payment_id: verkauf.payment_id,
  });
  if (revErr) abbruch(revErr.message);
  fehler(revTry, 'USE_REVOKE_PASS', 'USE_REVOKE_PASS');

  console.log('\n6) Teilnehmerin Rechte');
  fehler(
    await verkaufen(asUser, teilnehmerin.id, fuenfProd.id, 'cash'),
    'FORBIDDEN',
    'Teilnehmerin sell_pass'
  );
  const { data: userPasses, error: upErr } = await asUser.from('passes').select('id, price_cents');
  if (upErr) abbruch(upErr.message);
  ok(
    'Teilnehmerin nur eigene',
    (userPasses || []).every((p) => p.id === verkauf.pass_id || p.id === verkauf5.pass_id || p.id === altPassId)
      && (userPasses || []).some((p) => p.id === verkauf.pass_id)
  );
  // revoked cards still selectable via RLS; active own card present
  const { data: eigene, error: egErr } = await asUser.rpc('get_member_passes', { p_member_id: teilnehmerin.id });
  if (egErr) abbruch(egErr.message);
  ok('get eigene success', eigene?.success === true);
  const payloadText = JSON.stringify(eigene);
  ok('get ohne Preis', !payloadText.includes('price') && !payloadText.includes('15000') && !payloadText.includes('8000'));
  ok(
    'get enthält aktive 10er',
    (eigene.passes || []).some((p) => p.pass_id === verkauf.pass_id && p.remaining === 10)
  );

  console.log('\n7) Lehrende Sichtbarkeit');
  const { data: teacherPasses, error: tpErr } = await asTeacher.from('passes').select('id');
  if (tpErr) abbruch(tpErr.message);
  ok('Lehrende SELECT 0', (teacherPasses || []).length === 0);
  const { data: teacherGet, error: tgErr } = await asTeacher.rpc('get_member_passes', {
    p_member_id: teilnehmerin.id,
  });
  if (tgErr) abbruch(tgErr.message);
  ok('Lehrende get success', teacherGet?.success === true);
  ok('Lehrende get ohne Preis', !JSON.stringify(teacherGet).includes('price_cents'));
  ok(
    'Lehrende sieht Rest',
    (teacherGet.passes || []).some((p) => p.pass_id === verkauf.pass_id && p.remaining === 10)
  );

  const { data: sellableT, error: sellTErr } = await asTeacher.rpc('get_sellable_pass_products');
  if (sellTErr) abbruch('get_sellable Lehrende: ' + sellTErr.message);
  ok('Lehrende sellable success', sellableT?.success === true);
  const sellableList = sellableT?.products || [];
  ok(
    'Lehrende sieht beide Produkte mit Preis',
    sellableList.length === 2
      && sellableList.some((p) => p.id === zehnProd.id && p.price_cents === 16000 && p.units === 10)
      && sellableList.some((p) => p.id === fuenfProd.id && p.price_cents === 8000 && p.units === 5),
    JSON.stringify(sellableList)
  );
  ok(
    'sellable sortiert nach units, name',
    sellableList[0]?.units === 5 && sellableList[1]?.units === 10,
    JSON.stringify(sellableList.map((p) => p.units))
  );
  const { data: sellableU, error: sellUErr } = await asUser.rpc('get_sellable_pass_products');
  if (sellUErr) abbruch('get_sellable Teilnehmerin: ' + sellUErr.message);
  fehler(sellableU, 'FORBIDDEN', 'Teilnehmerin get_sellable');

  console.log('\n8) Fehlerfälle');
  const { data: arch } = await asOwner.rpc('set_pass_product_archived', { p_id: fuenfProd.id, p_archived: true });
  if (!arch?.success) abbruch('archivieren fehlgeschlagen');
  fehler(
    await verkaufen(asOwner, teilnehmerin.id, fuenfProd.id, 'cash'),
    'PRODUCT_ARCHIVED',
    'archiviertes Produkt'
  );
  const { data: sellableArch, error: sellAErr } = await asTeacher.rpc('get_sellable_pass_products');
  if (sellAErr) abbruch('get_sellable nach Archiv: ' + sellAErr.message);
  ok(
    'archivierte fehlen in sellable',
    sellableArch?.success === true
      && (sellableArch.products || []).length === 1
      && sellableArch.products[0].id === zehnProd.id
      && !(sellableArch.products || []).some((p) => p.id === fuenfProd.id),
    JSON.stringify(sellableArch)
  );

  // anonymisierte Person: remove passOnly after selling to them first creates money;
  // for MEMBER_REMOVED we need an already-anonymized profile without going through sell.
  // Sell to passOnly, remove → anonymized, then try sell again.
  const verkaufPassOnly = await verkaufen(asOwner, passOnly.id, zehnProd.id, 'bank_transfer');
  ok('Verkauf an Paula', verkaufPassOnly?.success === true);
  const { data: wegPaula } = await asOwner.rpc('remove_member', { p_member_id: passOnly.id });
  ok('Paula anonymized', wegPaula?.success === true && wegPaula?.mode === 'anonymized', JSON.stringify(wegPaula));
  fehler(
    await verkaufen(asOwner, passOnly.id, zehnProd.id, 'cash'),
    'MEMBER_REMOVED',
    'anonymisierte Person'
  );
  fehler(
    await verkaufen(asOwner, teilnehmerin.id, zehnProd.id, 'crypto'),
    'INVALID_METHOD',
    'falsche Zahlart'
  );

  console.log('\n9) Guard Trigger');
  const { data: mvRow } = await admin.from('pass_movements').select('id').eq('pass_id', verkauf.pass_id).limit(1).single();
  const { error: mvUpd } = await admin.from('pass_movements').update({ delta: 99 }).eq('id', mvRow.id);
  dmlVerweigert(mvUpd, 'UPDATE pass_movements');
  const { error: mvDel } = await admin.from('pass_movements').delete().eq('id', mvRow.id);
  dmlVerweigert(mvDel, 'DELETE pass_movements');
  const { error: passUpd } = await admin.from('passes').update({ units_total: 1 }).eq('id', verkauf.pass_id);
  dmlVerweigert(passUpd, 'UPDATE units_total');

  console.log('\n10) ALREADY_USED');
  const { error: redeemErr } = await admin.from('pass_movements').insert({
    tenant_id: tenant.id,
    pass_id: verkauf.pass_id,
    delta: -1,
    kind: 'redeem',
    actor_member_id: owner.id,
  });
  if (redeemErr) abbruch('redeem simulieren: ' + redeemErr.message);
  fehler(await stornieren(asOwner, verkauf.pass_id), 'ALREADY_USED', 'nach redeem');

  console.log('\n11) remove_member nur Karte');
  // Paula already anonymized with card — covered above. Check card remains:
  const { data: paulaPass } = await admin.from('passes').select('id, member_id, status').eq('id', verkaufPassOnly.pass_id).single();
  ok('Karte bleibt nach remove_member', paulaPass?.member_id === passOnly.id && paulaPass?.status === 'active');

  console.log('\n12) delete_tenant_complete');
  const { error: delErr } = await admin.rpc('delete_tenant_complete', { p_tenant_id: tenant.id });
  if (delErr) abbruch('delete_tenant_complete: ' + delErr.message);
  ok('Studio weg', (await admin.from('tenants').select('id').eq('id', tenant.id)).data?.length === 0);
  ok('passes weg', (await admin.from('passes').select('id').eq('tenant_id', tenant.id)).data?.length === 0);
  ok('movements weg', (await admin.from('pass_movements').select('id').eq('tenant_id', tenant.id)).data?.length === 0);
  ok('payments weg', (await admin.from('payments').select('id').eq('tenant_id', tenant.id)).data?.length === 0);

  console.log('\ngrün');
}

main()
  .catch((e) => {
    console.error(e.abbruch ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!devOk) return;
    try {
      const env = ladeEnv();
      await resteEntfernen(clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG));
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen: ' + e.message);
      console.error('Reste: Studio a5passtest, Konten a5passtest.*');
      process.exitCode = 1;
    }
  });
