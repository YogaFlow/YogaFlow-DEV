#!/usr/bin/env node
/**
 * A4 — Kartenprodukte (nur DEV).
 *
 * Nicht ausführen, bevor 20260927183209_a4_pass_products.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio a4passtest und a4passb, am Ende
 * delete_tenant_complete und die Test-Logins per auth.admin.deleteUser.
 *
 * Fälle:
 *  1) Owner legt 10er-Karte an → Event/Audit ohne name im Event.
 *  2) Admin legt 5er mit months/6 an → Erfolg.
 *  3) Lehrende und Teilnehmerin: create → FORBIDDEN, SELECT 0 Zeilen.
 *  4) Ungültige Werte → INVALID_*.
 *  5) Doppelter aktiver Name (Schreibweise) → DUPLICATE_NAME.
 *  6) Archivieren, neu anlegen, Zurückholen → DUPLICATE_NAME.
 *  7) Doppelt archivieren → unchanged, kein zweites Event.
 *  8) Update archiviert → ARCHIVED; Update aktiv → Audit nur Spalten.
 *     Gleiche Werte nochmal → unchanged, kein zweites Event.
 *  9) Owner Studio B → Produkt Studio A → NOT_FOUND.
 * 10) Direktes INSERT/UPDATE/DELETE als authenticated → verweigert.
 *     service_role DELETE → Trigger-Fehler.
 * 11) Neuer Kurs pass_eligible true; Owner setzt false über Kurs-Update.
 * 12) delete_tenant_complete räumt Studio mit Produkten ab.
 *
 * Verwendung: node scripts/test/a4_pass_products.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a4passtest';
const SLUG_B = 'a4passb';

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

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
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
      if (mail.startsWith(SLUG + '.') || mail.startsWith(SLUG_B + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  for (const slug of [SLUG, SLUG_B]) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen: ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen: ' + e.message);
    }
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
    .select('id, email, role, tenant_id')
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
    Boolean(error) && /42501|permission|denied|nicht erlaubt|archivieren/i.test(text),
    text
  );
}

async function anlegen(client, felder) {
  const { data, error } = await client.rpc('create_pass_product', {
    p_name: felder.name,
    p_units: felder.units,
    p_price_cents: felder.price_cents,
    p_validity_rule: felder.validity_rule,
    p_validity_value: felder.validity_value,
  });
  if (error) abbruch(`create_pass_product: ${error.message}`);
  return data;
}

async function aktualisieren(client, id, felder) {
  const { data, error } = await client.rpc('update_pass_product', {
    p_id: id,
    p_name: felder.name,
    p_units: felder.units,
    p_price_cents: felder.price_cents,
    p_validity_rule: felder.validity_rule,
    p_validity_value: felder.validity_value,
  });
  if (error) abbruch(`update_pass_product: ${error.message}`);
  return data;
}

async function archivieren(client, id, archived) {
  const { data, error } = await client.rpc('set_pass_product_archived', {
    p_id: id,
    p_archived: archived,
  });
  if (error) abbruch(`set_pass_product_archived: ${error.message}`);
  return data;
}

async function protokoll(admin, productId, typ) {
  const { data: events, error: eErr } = await admin
    .from('events')
    .select('id, type, subject_type, subject_id, payload, causation_id')
    .eq('subject_id', productId)
    .eq('type', typ);
  if (eErr) abbruch('events lesen: ' + eErr.message);
  const event = (events || [])[0];
  const { data: audit, error: aErr } = await admin
    .from('audit_log')
    .select('id, action, table_name, row_id, changed_fields, event_id')
    .eq('event_id', event?.id ?? '00000000-0000-0000-0000-000000000000');
  if (aErr) abbruch('audit_log lesen: ' + aErr.message);
  return { events: events || [], audit: audit || [] };
}

async function eventAnzahl(admin, productId, typ) {
  const { count, error } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', productId)
    .eq('type', typ);
  if (error) abbruch('events zählen: ' + error.message);
  return count ?? 0;
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
    .insert({ name: 'A4 Kartenprodukte', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const { data: tenantB, error: tBErr } = await admin
    .from('tenants')
    .insert({ name: 'A4 Fremdstudio', slug: SLUG_B })
    .select('id')
    .single();
  if (tBErr) abbruch('Studio B anlegen: ' + tBErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const adminUser = await nutzerAnlegen(admin, {
    email: SLUG + '.admin@example.com', vorname: 'Ada', nachname: 'Admin', rolle: 'admin', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const teilnehmerin = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmerin@example.com', vorname: 'Anna', nachname: 'Andersen', rolle: 'user', tenantId: tenant.id, password,
  });
  const ownerB = await nutzerAnlegen(admin, {
    email: SLUG_B + '.owner@example.com', vorname: 'Ben', nachname: 'Boss', rolle: 'owner', tenantId: tenantB.id, password,
  });

  const asOwner = await login(url, anon, owner.email, password, SLUG);
  const asAdmin = await login(url, anon, adminUser.email, password, SLUG);
  const asTeacher = await login(url, anon, teacher.email, password, SLUG);
  const asUser = await login(url, anon, teilnehmerin.email, password, SLUG);
  const asOwnerB = await login(url, anon, ownerB.email, password, SLUG_B);

  console.log('\n1) Owner legt 10er-Karte an');
  const zehn = await anlegen(asOwner, {
    name: '10er-Karte',
    units: 10,
    price_cents: 15000,
    validity_rule: 'years_to_year_end',
    validity_value: 3,
  });
  ok('create 10er', zehn?.success === true && typeof zehn.id === 'string', JSON.stringify(zehn));
  const zehnProtokoll = await protokoll(admin, zehn.id, 'pass_product.created');
  ok('Event created vorhanden', zehnProtokoll.events.length === 1);
  ok('Event ohne name', !JSON.stringify(zehnProtokoll.events[0].payload).includes('10er'));
  ok(
    'Event Payload Felder',
    zehnProtokoll.events[0].payload?.product_id === zehn.id
      && zehnProtokoll.events[0].payload?.units === 10
      && zehnProtokoll.events[0].payload?.price_cents === 15000
      && zehnProtokoll.events[0].payload?.validity_rule === 'years_to_year_end'
      && zehnProtokoll.events[0].payload?.validity_value === 3
      && zehnProtokoll.events[0].subject_type === 'pass_product'
  );
  ok('Audit created vorhanden', zehnProtokoll.audit.length >= 1);
  ok(
    'Audit ohne Namenswert',
    !JSON.stringify(zehnProtokoll.audit).includes('10er-Karte')
  );

  console.log('\n2) Admin legt 5er-Karte mit months an');
  const fuenf = await anlegen(asAdmin, {
    name: '5er-Karte',
    units: 5,
    price_cents: 8000,
    validity_rule: 'months',
    validity_value: 6,
  });
  ok('create 5er', fuenf?.success === true && typeof fuenf.id === 'string', JSON.stringify(fuenf));

  console.log('\n3) Lehrende und Teilnehmerin forbidden / kein SELECT');
  fehler(
    await anlegen(asTeacher, {
      name: 'Lehrer-Karte', units: 3, price_cents: 3000, validity_rule: 'months', validity_value: 12,
    }),
    'FORBIDDEN',
    'Lehrer create'
  );
  fehler(
    await anlegen(asUser, {
      name: 'User-Karte', units: 3, price_cents: 3000, validity_rule: 'months', validity_value: 12,
    }),
    'FORBIDDEN',
    'Teilnehmerin create'
  );
  const { data: teacherRows, error: tSelErr } = await asTeacher.from('pass_products').select('id');
  if (tSelErr) abbruch('Lehrer SELECT: ' + tSelErr.message);
  ok('Lehrer SELECT 0', (teacherRows || []).length === 0);
  const { data: userRows, error: uSelErr } = await asUser.from('pass_products').select('id');
  if (uSelErr) abbruch('Teilnehmerin SELECT: ' + uSelErr.message);
  ok('Teilnehmerin SELECT 0', (userRows || []).length === 0);

  console.log('\n4) Ungültige Werte');
  fehler(
    await anlegen(asOwner, {
      name: 'X', units: 10, price_cents: 15000, validity_rule: 'years_to_year_end', validity_value: 3,
    }),
    'INVALID_NAME',
    'Name 1 Zeichen'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Nuller', units: 0, price_cents: 15000, validity_rule: 'years_to_year_end', validity_value: 3,
    }),
    'INVALID_UNITS',
    '0 Einheiten'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Hunderter', units: 101, price_cents: 15000, validity_rule: 'years_to_year_end', validity_value: 3,
    }),
    'INVALID_UNITS',
    '101 Einheiten'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Gratis', units: 5, price_cents: 0, validity_rule: 'years_to_year_end', validity_value: 3,
    }),
    'INVALID_PRICE',
    'Preis 0'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Monate0', units: 5, price_cents: 5000, validity_rule: 'months', validity_value: 0,
    }),
    'INVALID_VALIDITY',
    'months 0'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Monate61', units: 5, price_cents: 5000, validity_rule: 'months', validity_value: 61,
    }),
    'INVALID_VALIDITY',
    'months 61'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Jahre4', units: 5, price_cents: 5000, validity_rule: 'years_to_year_end', validity_value: 4,
    }),
    'INVALID_VALIDITY',
    'years_to_year_end 4'
  );
  fehler(
    await anlegen(asOwner, {
      name: 'Unbekannt', units: 5, price_cents: 5000, validity_rule: 'days', validity_value: 30,
    }),
    'INVALID_VALIDITY',
    'unbekannte Regel'
  );

  console.log('\n5) DUPLICATE_NAME bei anderer Schreibweise');
  fehler(
    await anlegen(asOwner, {
      name: '10er-karte ',
      units: 10,
      price_cents: 15000,
      validity_rule: 'years_to_year_end',
      validity_value: 3,
    }),
    'DUPLICATE_NAME',
    '10er-karte Leerzeichen'
  );

  console.log('\n6) Archivieren, neu anlegen, Zurückholen');
  const arch = await archivieren(asOwner, zehn.id, true);
  ok('archivieren 10er', arch?.success === true && !arch.unchanged, JSON.stringify(arch));
  const archProt = await protokoll(admin, zehn.id, 'pass_product.archived');
  ok('Event archived', archProt.events.length === 1);

  const zehnNeu = await anlegen(asOwner, {
    name: '10er-Karte',
    units: 10,
    price_cents: 15000,
    validity_rule: 'years_to_year_end',
    validity_value: 3,
  });
  ok('neue 10er nach Archiv', zehnNeu?.success === true, JSON.stringify(zehnNeu));

  fehler(await archivieren(asOwner, zehn.id, false), 'DUPLICATE_NAME', 'altes 10er zurückholen');

  console.log('\n7) Doppelt archivieren → unchanged');
  const arch2 = await archivieren(asOwner, zehn.id, true);
  ok(
    'doppelt archivieren',
    arch2?.success === true && arch2?.unchanged === true,
    JSON.stringify(arch2)
  );
  ok('kein zweites archived-Event', (await eventAnzahl(admin, zehn.id, 'pass_product.archived')) === 1);

  console.log('\n8) Update archiviert / aktiv');
  fehler(
    await aktualisieren(asOwner, zehn.id, {
      name: 'Alt-10er', units: 10, price_cents: 16000, validity_rule: 'years_to_year_end', validity_value: 2,
    }),
    'ARCHIVED',
    'Update archiviert'
  );

  const upd = await aktualisieren(asOwner, fuenf.id, {
    name: '5er-Karte',
    units: 5,
    price_cents: 8500,
    validity_rule: 'months',
    validity_value: 6,
  });
  ok('Update aktiv', upd?.success === true, JSON.stringify(upd));
  const updProt = await protokoll(admin, fuenf.id, 'pass_product.updated');
  ok('Event updated', updProt.events.length === 1);
  const fields = updProt.audit[0]?.changed_fields || [];
  ok(
    'Audit nur geänderte Spalten',
    fields.length === 1 && fields[0] === 'price_cents',
    JSON.stringify(fields)
  );

  const updSame = await aktualisieren(asOwner, fuenf.id, {
    name: '5er-Karte',
    units: 5,
    price_cents: 8500,
    validity_rule: 'months',
    validity_value: 6,
  });
  ok(
    'Update ohne Änderung',
    updSame?.success === true && updSame?.unchanged === true,
    JSON.stringify(updSame)
  );
  ok('kein zweites updated-Event', (await eventAnzahl(admin, fuenf.id, 'pass_product.updated')) === 1);

  console.log('\n9) Fremdstudio NOT_FOUND');
  fehler(
    await aktualisieren(asOwnerB, fuenf.id, {
      name: 'Hack', units: 5, price_cents: 1, validity_rule: 'months', validity_value: 1,
    }),
    'NOT_FOUND',
    'Owner B update Produkt A'
  );

  console.log('\n10) Direktes DML');
  const { error: insErr } = await asOwner.from('pass_products').insert({
    tenant_id: tenant.id,
    name: 'Direkt',
    units: 2,
    price_cents: 2000,
    validity_rule: 'months',
    validity_value: 12,
  });
  dmlVerweigert(insErr, 'Direkt INSERT');

  const { error: upErr } = await asOwner
    .from('pass_products')
    .update({ price_cents: 1 })
    .eq('id', fuenf.id);
  dmlVerweigert(upErr, 'Direkt UPDATE');

  const { error: delErr } = await asOwner.from('pass_products').delete().eq('id', fuenf.id);
  dmlVerweigert(delErr, 'Direkt DELETE authenticated');

  const { error: srvDelErr } = await admin.from('pass_products').delete().eq('id', fuenf.id);
  dmlVerweigert(srvDelErr, 'DELETE service_role ohne Schalter');

  console.log('\n11) courses.pass_eligible');
  const { data: kurs, error: kErr } = await admin
    .from('courses')
    .insert({
      tenant_id: tenant.id,
      title: 'A4 Testkurs pass eligible',
      description: 'Beschreibung für den A4-Testkurs mit genug Text.',
      date: tag(7),
      time: '10:00:00',
      end_time: '11:00:00',
      location: 'Studio',
      max_participants: 10,
      price: 18,
      teacher_id: teacher.id,
      status: 'active',
      frequency: 'one_time',
    })
    .select('id, pass_eligible')
    .single();
  if (kErr) abbruch('Kurs anlegen: ' + kErr.message);
  ok('Neuer Kurs pass_eligible true', kurs.pass_eligible === true);

  const { data: kursUpd, error: kuErr } = await asOwner
    .from('courses')
    .update({ pass_eligible: false })
    .eq('id', kurs.id)
    .select('id, pass_eligible')
    .single();
  if (kuErr) abbruch('Kurs Update pass_eligible: ' + kuErr.message);
  ok('Owner setzt pass_eligible false', kursUpd?.pass_eligible === false);

  console.log('\n12) delete_tenant_complete mit Produkten');
  const { error: delTenantErr } = await admin.rpc('delete_tenant_complete', {
    p_tenant_id: tenant.id,
  });
  if (delTenantErr) abbruch('delete_tenant_complete A: ' + delTenantErr.message);
  const { count: produktRest, error: prErr } = await admin
    .from('pass_products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);
  if (prErr) abbruch('pass_products Rest: ' + prErr.message);
  ok('keine Produkte nach delete_tenant', (produktRest ?? 0) === 0);

  const { data: tenantGone, error: tgErr } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenant.id)
    .maybeSingle();
  if (tgErr) abbruch('Tenant lesen: ' + tgErr.message);
  ok('Studio A weg', tenantGone == null);

  console.log('\nAufräumen Studio B');
  await resteEntfernen(admin);
  console.log('\nA4 grün\n');
}

main().catch(async (err) => {
  console.error('\n' + (err?.message || err));
  if (devOk) {
    try {
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
      console.error('Reste entfernt.');
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen:', e?.message || e);
    }
  }
  process.exit(1);
});
