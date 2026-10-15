#!/usr/bin/env node
/**
 * UX-10 — DEV: Template-Hashes AGB/Datenschutz auf Kurskarte-Fassung setzen,
 * Demo-Studios erneut freigeben (keine neue Vorlagen-Version).
 *
 *   node scripts/dev/ux10_legal_tpl_hash.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { createHash } from 'node:crypto';
import { login, seedPasswort, studioLegalFreigeben } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const termsHash = hash(readFileSync(join(root, 'docs/legal/studio/agb.v1.md'), 'utf8'));
const privacyHash = hash(readFileSync(join(root, 'docs/legal/studio/datenschutz.v1.md'), 'utf8'));
const version = '2026-10-05';

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

assertDevGuard();
const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (!url || !service || !anon) fail('DEV-Env unvollständig');
if (!url.includes(ERLAUBTE_DEV_REF) && !String(url).includes('127.0.0.1')) {
  fail('Nicht DEV');
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

console.log('UX-10 Legal-Template-Hashes (DEV)…');
console.log(`  terms:   ${termsHash}`);
console.log(`  privacy: ${privacyHash}`);

for (const row of [
  { document: 'studio_terms_tpl', content_hash: termsHash },
  { document: 'studio_privacy_tpl', content_hash: privacyHash },
]) {
  const { error } = await admin
    .from('legal_document_versions')
    .update({ content_hash: row.content_hash, version, updated_at: new Date().toISOString() })
    .eq('document', row.document);
  if (error) fail(`Update ${row.document}: ${error.message}`);
}

async function tenantBySlug(slug) {
  const { data, error } = await admin.from('tenants').select('id, name, slug').eq('slug', slug).maybeSingle();
  if (error || !data) fail(`Tenant ${slug}: ${error?.message || 'fehlt'}`);
  return data;
}

{
  // Append-only: Freigaben nicht löschen — neuer Hash macht Status „erneut freigeben“.
  const alpha = await tenantBySlug('demoalpha');
  console.log(`  demoalpha (${alpha.slug}): Hash neu — Owner muss AGB/Datenschutz erneut freigeben`);
}

{
  const beta = await tenantBySlug('demobeta');
  const pwd = seedPasswort();
  const asOwner = await login(url, anon, 'demobeta.owner@example.com', pwd, 'demobeta');
  await studioLegalFreigeben(asOwner);
  console.log(`  demobeta (${beta.slug}): AGB/Datenschutz erneut freigegeben`);
}

console.log('\nUX-10 Legal-Hashes fertig.\n');
