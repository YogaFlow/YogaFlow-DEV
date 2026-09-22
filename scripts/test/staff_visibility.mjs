#!/usr/bin/env node
/**
 * Prüft Staff-Sichtbarkeit für die Seed-Teilnehmerin demoalpha (E4).
 *
 * Erwartung NACH Expand+Contract und Frontend:
 * - users?select=* → nur eigene Zeile (+ ggf. nichts von Staff)
 * - staff_names(Staff-IDs) → nur id, first_name, last_name, role
 * - staff_names mit Header demobeta und demoalpha-IDs → 0 Zeilen
 *
 * Nicht ausführen, bevor Expand auf DEV liegt. Gegen PROD nie.
 *
 * Verwendung: node scripts/test/staff_visibility.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const OTHER_SLUG = 'demobeta';
const EMAIL = 'demoalpha.teilnehmer1@example.com';

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
  console.error('\n  FEHLER: ' + text + '\n');
  process.exit(1);
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function byRole(rows) {
  const out = {};
  for (const r of rows) out[r.role] = (out[r.role] ?? 0) + 1;
  return out;
}

const env = ladeEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) abbruch('VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt in .env');
if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
if (refAusKey(key) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');

const password = seedPasswort();

const authRes = await fetch(url + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password }),
});
const auth = await authRes.json();
if (!auth.access_token) {
  abbruch('Login fehlgeschlagen: ' + (auth.error_description || auth.msg || auth.error || authRes.status));
}

async function api(path, tenant, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', 'Bearer ' + auth.access_token);
  headers.set('Accept', 'application/json');
  if (tenant) headers.set('x-omlify-tenant', tenant);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url + path, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parse: 'fail', text: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

const users = await api('/rest/v1/users?select=*', SLUG);
if (!Array.isArray(users.body)) {
  abbruch('users?select=* fehlgeschlagen: ' + JSON.stringify(users.body));
}

const roles = byRole(users.body);
console.log('users?select=*');
console.log('  status:', users.status);
console.log('  rowCount:', users.body.length);
console.log('  byRole:', JSON.stringify(roles));
console.log('  columns:', users.body[0] ? Object.keys(users.body[0]).sort().join(', ') : '(keine)');

const staffIds = users.body
  .filter((r) => r.role === 'teacher' || r.role === 'admin' || r.role === 'owner')
  .map((r) => r.id);

// Wenn Contract schon live ist, liefert users keine Staff-IDs mehr.
// Dann IDs über Kurse holen (teacher_id liegt auf courses, kein users-Embed).
let idsForRpc = staffIds;
if (idsForRpc.length === 0) {
  const courses = await api('/rest/v1/courses?select=teacher_id&limit=20', SLUG);
  if (Array.isArray(courses.body)) {
    idsForRpc = [...new Set(courses.body.map((c) => c.teacher_id).filter(Boolean))];
  }
}

const staffNames = await api('/rest/v1/rpc/staff_names', SLUG, {
  method: 'POST',
  body: JSON.stringify({ p_ids: idsForRpc }),
});

console.log('\nrpc/staff_names (Header ' + SLUG + ', ' + idsForRpc.length + ' IDs)');
console.log('  status:', staffNames.status);
if (!Array.isArray(staffNames.body)) {
  console.log('  error:', JSON.stringify(staffNames.body));
} else {
  const cols = staffNames.body[0] ? Object.keys(staffNames.body[0]).sort() : [];
  console.log('  rowCount:', staffNames.body.length);
  console.log('  columns:', cols.length ? cols.join(', ') : '(keine)');
  const unexpected = cols.filter((c) => !['id', 'first_name', 'last_name', 'role'].includes(c));
  if (unexpected.length) console.log('  unexpectedColumns:', unexpected.join(', '));
}

const cross = await api('/rest/v1/rpc/staff_names', OTHER_SLUG, {
  method: 'POST',
  body: JSON.stringify({ p_ids: idsForRpc }),
});

console.log('\nrpc/staff_names (Header ' + OTHER_SLUG + ', dieselben IDs)');
console.log('  status:', cross.status);
if (!Array.isArray(cross.body)) {
  console.log('  error:', JSON.stringify(cross.body));
} else {
  console.log('  rowCount:', cross.body.length);
}

console.log('\nFertig. Keine Personendaten ausgegeben.');
