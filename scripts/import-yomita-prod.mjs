/**
 * One-off PROD import: legacy Yoga app → tenant "Yomita" (slug yomita).
 * Uses auth trigger for public.users (no DISABLE TRIGGER — requires owner on auth.users).
 */
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const DOWNLOADS = 'C:/Users/49178/Downloads';
const TENANT_NAME = 'Yomita';
const TENANT_SLUG = 'yomita';
const OWNER_EMAIL = 'tanja@die-thallers.de';
const TENANT_ID = randomUUID();

const SKIP_EMAILS = new Set([
  'andre.thaller@outlook.de',
  'yogaflowapp@outlook.de',
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => x.length > 0)) rows.push(row);
  }
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const o = {};
    headers.forEach((h, i) => {
      o[h] = cells[i] ?? '';
    });
    return o;
  });
}

function sqlStr(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlTs(v) {
  if (!v || !String(v).trim()) return 'NULL';
  return `${sqlStr(v)}::timestamptz`;
}

function sqlBool(v) {
  if (v === true || v === 'true' || v === 't') return 'true';
  if (v === false || v === 'false' || v === 'f') return 'false';
  return v ? 'true' : 'false';
}

function sqlNum(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return String(v);
}

function mergeUserMeta(a, p, role) {
  let base = {};
  try {
    base = JSON.parse(a.raw_user_meta_data || '{}');
  } catch {
    base = {};
  }
  const merged = {
    ...base,
    tenant_id: TENANT_ID,
    role,
    first_name: p.first_name || base.first_name || '',
    last_name: p.last_name || base.last_name || '',
    street: p.street || base.street || null,
    house_number: p.house_number || base.house_number || null,
    postal_code: p.postal_code || base.postal_code || null,
    city: p.city || base.city || null,
    phone: p.phone || base.phone || null,
    email_verified: true,
  };
  return JSON.stringify(merged);
}

const authRows = parseCsv(readFileSync(`${DOWNLOADS}/users_rows.csv`, 'utf8'));
const profileRows = parseCsv(readFileSync(`${DOWNLOADS}/users_rows (1).csv`, 'utf8'));
const courseRows = parseCsv(readFileSync(`${DOWNLOADS}/courses_rows.csv`, 'utf8'));
const regRows = parseCsv(readFileSync(`${DOWNLOADS}/registrations_rows.csv`, 'utf8'));

const profileById = new Map(profileRows.map((p) => [p.id, p]));
const importedUserIds = new Set();
const skippedUsers = [];

for (const a of authRows) {
  if (SKIP_EMAILS.has(a.email?.toLowerCase())) {
    skippedUsers.push(a.email);
    continue;
  }
  importedUserIds.add(a.id);
}

const lines = [];
lines.push('-- Yomita legacy import');
lines.push(`-- tenant_id: ${TENANT_ID}`);
lines.push('');
lines.push(
  `INSERT INTO public.tenants (id, name, slug) VALUES ('${TENANT_ID}'::uuid, ${sqlStr(TENANT_NAME)}, ${sqlStr(TENANT_SLUG)});`,
);
lines.push('');

for (const a of authRows) {
  if (SKIP_EMAILS.has(a.email?.toLowerCase())) continue;
  const p = profileById.get(a.id);
  if (!p) throw new Error(`Missing profile for ${a.id}`);

  const role = a.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() ? 'owner' : 'user';
  const confirmed = a.email_confirmed_at || a.confirmed_at || p.created_at;
  const appMeta = a.raw_app_meta_data || '{"provider":"email","providers":["email"]}';
  const userMeta = mergeUserMeta(a, p, role);

  lines.push(`-- auth: ${a.email}`);
  lines.push(`INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '${a.id}'::uuid,
  'authenticated',
  'authenticated',
  ${sqlStr(a.email)},
  ${sqlStr(a.encrypted_password)},
  ${sqlTs(confirmed)},
  ${sqlStr(appMeta)}::jsonb,
  ${sqlStr(userMeta)}::jsonb,
  ${sqlTs(a.created_at)},
  ${sqlTs(a.updated_at)},
  false,
  false
) ON CONFLICT (id) DO NOTHING;`);

  lines.push(`INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '${a.id}'::uuid,
  '${a.id}'::uuid,
  '${a.id}'::text,
  'email',
  jsonb_build_object('sub', '${a.id}', 'email', ${sqlStr(a.email)}, 'email_verified', true, 'phone_verified', false),
  ${sqlTs(a.created_at)},
  ${sqlTs(a.updated_at)},
  ${sqlTs(a.last_sign_in_at || confirmed)}
) ON CONFLICT (id) DO NOTHING;`);
  lines.push('');
}

lines.push(`-- Mark all Yomita users verified (app gate)`);
lines.push(`UPDATE public.users SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, created_at),
  gdpr_consent = true,
  gdpr_consent_date = COALESCE(gdpr_consent_date, created_at)
WHERE tenant_id = '${TENANT_ID}'::uuid;`);
lines.push('');

lines.push('-- courses');
for (const c of courseRows) {
  lines.push(`INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '${c.id}'::uuid,
  '${TENANT_ID}'::uuid,
  ${sqlStr(c.title)},
  ${sqlStr(c.description)},
  ${sqlStr(c.date)}::date,
  ${sqlStr(c.time)}::time,
  ${c.end_time ? `${sqlStr(c.end_time)}::time` : 'NULL'},
  ${sqlStr(c.location)},
  ${sqlStr(c.room || null)},
  ${sqlNum(c.max_participants)},
  ${sqlNum(c.price)},
  '${c.teacher_id}'::uuid,
  ${sqlStr(c.status || 'active')},
  ${sqlNum(c.duration || 60)},
  ${sqlStr(c.prerequisites || null)},
  ${sqlStr(c.frequency || 'one_time')},
  ${c.series_id ? `'${c.series_id}'::uuid` : 'NULL'},
  ${sqlTs(c.created_at)},
  ${sqlTs(c.updated_at)}
);`);
}

lines.push('');
lines.push('-- registrations (past-course trigger disabled during import)');
lines.push('ALTER TABLE public.registrations DISABLE TRIGGER prevent_past_course_registration;');
let skippedRegs = 0;
for (const r of regRows) {
  if (!importedUserIds.has(r.user_id)) {
    skippedRegs++;
    continue;
  }
  let status = r.status;
  if (status === 'cancelled') {
    status = r.is_waitlist === 'true' ? 'waitlist' : 'registered';
  }
  if (status !== 'registered' && status !== 'waitlist') {
    status = r.is_waitlist === 'true' ? 'waitlist' : 'registered';
  }
  lines.push(`INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '${r.id}'::uuid,
  '${TENANT_ID}'::uuid,
  '${r.course_id}'::uuid,
  '${r.user_id}'::uuid,
  ${sqlStr(status)}::public.registration_status,
  ${sqlTs(r.registered_at)},
  ${sqlTs(r.signup_timestamp || r.registered_at)},
  ${sqlTs(r.cancellation_timestamp || null)},
  ${sqlBool(r.is_waitlist)},
  ${r.waitlist_position ? sqlNum(r.waitlist_position) : 'NULL'}
);`);
}
lines.push('ALTER TABLE public.registrations ENABLE TRIGGER prevent_past_course_registration;');

const sql = lines.join('\n');
writeFileSync('scripts/import-yomita-prod.sql', sql, 'utf8');
console.error(`tenant_id=${TENANT_ID}`);
console.error(`users=${importedUserIds.size} skipped=${skippedUsers.join(',')}`);
console.error(`courses=${courseRows.length} registrations=${regRows.length - skippedRegs}`);
console.log(sql);
