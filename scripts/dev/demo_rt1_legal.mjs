#!/usr/bin/env node
/**
 * RT-1 G: Demodaten Rechtstexte (nur DEV).
 *
 *   node scripts/dev/demo_rt1_legal.mjs
 *
 * demoalpha: sole_trader, Impressum vollständig, AGB/Datenschutz NICHT freigegeben
 * demobeta: Impressum + AGB + Datenschutz freigegeben (gerenderte Fassungen)
 *
 * Passwort/E-Mails nur aus supabase/.env.dev — nie loggen.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { login, seedPasswort } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

async function ownerClient(slug) {
  const { data: tenant, error: te } = await admin
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single();
  if (te || !tenant) fail(`${slug} fehlt`);

  const { data: ownerRow } = await admin
    .from('users')
    .select('id, email')
    .eq('tenant_id', tenant.id)
    .eq('role', 'owner')
    .is('archived_at', null)
    .limit(1)
    .single();
  if (!ownerRow?.email) fail(`Owner für ${slug} fehlt`);

  const asOwner = await login(url, anon, ownerRow.email, password, slug);
  return { tenant, asOwner, ownerEmail: ownerRow.email };
}

async function upsertImprint(asOwner, overrides) {
  const { data, error } = await asOwner.rpc('upsert_studio_legal_profile', {
    p_legal_name: overrides.legal_name,
    p_street: overrides.street ?? 'Demostraße',
    p_house_number: overrides.house_number ?? '1',
    p_postal_code: overrides.postal_code ?? '10115',
    p_city: overrides.city ?? 'Berlin',
    p_country: 'DE',
    p_contact_email: overrides.contact_email,
    p_phone: overrides.phone ?? null,
    p_tax_id: null,
    p_legal_form: 'sole_trader',
    p_representatives: null,
    p_register_court: null,
    p_register_number: null,
    p_vat_id: null,
    p_economic_id: null,
    p_extra_rules: overrides.extra_rules ?? null,
  });
  if (error || !data?.success) {
    fail('upsert_studio_legal_profile: ' + (error?.message || JSON.stringify(data)));
  }
  return data;
}

async function publishImprint(asOwner, studioName, legalName, contactEmail) {
  const body =
    `# Impressum\n\n${legalName}\nEinzelunternehmen\nDemostraße 1\n10115 Berlin\nDeutschland\n\nE-Mail: ${contactEmail}\n\nStudio: ${studioName}\n`;
  const { data, error } = await asOwner.rpc('publish_studio_legal_document', {
    p_kind: 'imprint',
    p_template_version: '2026-10-05',
    p_body_md: body,
    p_values: { studio_name: studioName, legal_name: legalName },
    p_content_hash: hash(body),
    p_trigger: 'profile_change',
  });
  if (error || !data?.success) {
    fail('publish imprint: ' + (error?.message || JSON.stringify(data)));
  }
}

async function releaseTermsPrivacy(asOwner, studioName) {
  for (const kind of ['terms', 'privacy']) {
    const title = kind === 'terms' ? 'AGB' : 'Datenschutz';
    const body =
      `# ${title}\n\nStand: Demodaten demobeta.\n\nStudio: ${studioName}\n\nDiese Fassung dient dem Klicktest.\n`;
    const { data, error } = await asOwner.rpc('release_studio_legal', {
      p_kind: kind,
      p_template_version: '2026-10-05',
      p_body_md: body,
      p_values: { studio_name: studioName },
      p_content_hash: hash(body),
    });
    if (error || !data?.success) {
      fail(`release ${kind}: ` + (error?.message || JSON.stringify(data)));
    }
  }
}

async function clearStudioLegalAcceptances(tenantId) {
  // Nur Demo-Tenants: Freigaben entfernen (append-only docs bleiben, Status „Freigeben“ via Acceptance).
  await admin
    .from('legal_acceptances')
    .delete()
    .eq('tenant_id', tenantId)
    .in('document', ['studio_terms_tpl', 'studio_privacy_tpl']);
}

console.log('RT-1 Demodaten Rechtstexte…');

// --- demoalpha ---
{
  const { tenant, asOwner } = await ownerClient('demoalpha');
  await upsertImprint(asOwner, {
    legal_name: 'Demo Alpha Yoga',
    contact_email: 'demoalpha.owner@example.com',
    phone: '+49 30 111111',
  });
  await publishImprint(asOwner, tenant.name, 'Demo Alpha Yoga', 'demoalpha.owner@example.com');
  await clearStudioLegalAcceptances(tenant.id);
  const st = await asOwner.rpc('get_studio_legal_status');
  if (st.data?.terms?.status === 'current' || st.data?.privacy?.status === 'current') {
    fail('demoalpha: AGB/Datenschutz sollten nicht freigegeben sein');
  }
  if (st.data?.imprint_complete !== true) fail('demoalpha: Impressum nicht vollständig');
  console.log('  demoalpha: Impressum ok, AGB/Datenschutz nicht freigegeben');
}

// --- demobeta ---
{
  const { tenant, asOwner } = await ownerClient('demobeta');
  await upsertImprint(asOwner, {
    legal_name: 'Demo Beta Yoga',
    contact_email: 'demobeta.owner@example.com',
    phone: '+49 30 222222',
  });
  await publishImprint(asOwner, tenant.name, 'Demo Beta Yoga', 'demobeta.owner@example.com');
  await releaseTermsPrivacy(asOwner, tenant.name);
  const st = await asOwner.rpc('get_studio_legal_status');
  if (st.data?.texts_ready !== true) {
    fail('demobeta: texts_ready erwartet, got ' + JSON.stringify(st.data));
  }
  console.log('  demobeta: Impressum + AGB + Datenschutz freigegeben');
}

console.log('\nDemo RT-1 Legal fertig.\n');
