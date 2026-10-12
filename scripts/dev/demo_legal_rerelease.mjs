#!/usr/bin/env node
/**
 * DEV: AGB/Datenschutz mit aktueller Vorlage neu freigeben (Append-only).
 * Ersetzt Test-Minimaltext aus studioLegalFreigeben — kein DELETE.
 *
 *   node --experimental-strip-types scripts/dev/demo_legal_rerelease.mjs [slug]
 *   Default-Slug: demoalpha
 */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { login, seedPasswort } from '../test/_helpers.mjs';
import {
  findStudioLegalTemplateRelease,
  STUDIO_LEGAL_ACCEPTANCE_DOCS,
  STUDIO_LEGAL_SUBPROCESSORS,
} from '../../src/generated/studioLegalTemplates.ts';
import { renderStudioLegalTemplate } from '../../src/lib/studioLegalRender.ts';

const SLUG = process.argv[2] || 'demoalpha';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!/^[a-z0-9]{3,30}$/.test(SLUG)) {
  console.error('Slug ungültig');
  process.exit(1);
}

function ladeEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function fail(msg) {
  console.error('\n  FEHLER: ' + msg + '\n');
  process.exit(1);
}

function normalize(t) {
  return String(t)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
}

function hash(t) {
  return createHash('sha256').update(normalize(t), 'utf8').digest('hex');
}

function standDateBerlin() {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function legalFormLabel(form) {
  if (form === 'sole_trader') return 'Einzelunternehmen';
  if (form === 'gmbh') return 'GmbH';
  if (form === 'ug') return 'UG (haftungsbeschränkt)';
  if (form === 'gbr') return 'GbR';
  return '';
}

function subprocessorsList() {
  return STUDIO_LEGAL_SUBPROCESSORS.items
    .map((i) => `- ${i.name}: ${i.purpose} (${i.location})`)
    .join('\n');
}

assertDevGuard();
const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes(ERLAUBTE_DEV_REF) || !anon || !service) fail('DEV-Env unvollständig');

const password = env.DEMO_PASSWORT || seedPasswort();
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: tenant, error: te } = await admin
  .from('tenants')
  .select('id, name, cancellation_window_hours')
  .eq('slug', SLUG)
  .single();
if (te || !tenant) fail(`${SLUG} fehlt`);

const { data: ownerRow } = await admin
  .from('users')
  .select('email')
  .eq('tenant_id', tenant.id)
  .eq('role', 'owner')
  .is('archived_at', null)
  .limit(1)
  .single();
if (!ownerRow?.email) fail('Owner fehlt');

const asOwner = await login(url, anon, ownerRow.email, password, SLUG);
const profile = await asOwner.rpc('get_studio_legal_profile');
if (profile.error || !profile.data?.success) {
  fail('get_studio_legal_profile: ' + (profile.error?.message || JSON.stringify(profile.data)));
}
const p = profile.data;

const hours = tenant.cancellation_window_hours ?? 24;
const values = {
  studio_name: tenant.name,
  legal_name: p.legal_name,
  legal_form_label: legalFormLabel(p.legal_form),
  representatives: p.representatives ?? '',
  street: p.street,
  house_number: p.house_number,
  postal_code: p.postal_code,
  city: p.city,
  country: p.country === 'DE' ? 'Deutschland' : p.country,
  contact_email: p.contact_email,
  phone: p.phone ?? '',
  register_court: p.register_court ?? '',
  register_number: p.register_number ?? '',
  vat_id: p.vat_id ?? '',
  economic_id: p.economic_id ?? '',
  studio_url: `https://${SLUG}.omlify-dev.de`,
  cancellation_hours: `${hours} Stunden`,
  tax_small_business: true,
  pay_online: true,
  pay_onsite: true,
  passes_any: true,
  passes_online: true,
  extra_rules: p.extra_rules ?? '',
  stand_date: standDateBerlin(),
  subprocessors_list: subprocessorsList(),
};

console.log(`${SLUG}: AGB/Datenschutz mit aktueller Vorlage freigeben…`);
console.log(
  `  Vorlagen: terms ${STUDIO_LEGAL_ACCEPTANCE_DOCS.terms.version}, privacy ${STUDIO_LEGAL_ACCEPTANCE_DOCS.privacy.version}`,
);

for (const kind of ['terms', 'privacy']) {
  const rel = findStudioLegalTemplateRelease(kind);
  const body = renderStudioLegalTemplate(rel.body, values);
  if (body.length < 500) fail(`${kind}: gerenderter Body zu kurz (${body.length})`);
  if (body.includes('Stand: Test')) fail(`${kind}: Test-Body erkannt`);
  const { data, error } = await asOwner.rpc('release_studio_legal', {
    p_kind: kind,
    p_template_version: rel.version,
    p_body_md: body,
    p_values: values,
    p_content_hash: hash(body),
  });
  if (error || !data?.success) {
    fail(`release_studio_legal(${kind}): ` + (error?.message || JSON.stringify(data)));
  }
  console.log(`  ${kind}: ok len=${body.length} changed=${data.changed} id=${data.document_id}`);
}

const pubTerms = await asOwner.rpc('get_public_studio_legal', { p_kind: 'terms' });
const pubPriv = await asOwner.rpc('get_public_studio_legal', { p_kind: 'privacy' });
const tBody = String(pubTerms.data?.body_md ?? '');
const pBody = String(pubPriv.data?.body_md ?? '');
if (tBody.includes('AGB Test') || tBody.includes('Stand: Test')) fail('öffentlich: AGB noch Test');
if (pBody.includes('Datenschutz Test') || pBody.includes('Stand: Test')) {
  fail('öffentlich: Datenschutz noch Test');
}
if (!tBody.includes('Kurskarten') && !tBody.includes('Allgemeine Geschäftsbedingungen')) {
  fail('öffentlich: AGB ohne erwarteten Inhalt');
}
console.log(`  öffentlich AGB len=${tBody.length}, Datenschutz len=${pBody.length}`);
console.log(`\n${SLUG} Legal-Rerelease fertig.\n`);
