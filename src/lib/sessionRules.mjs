/**
 * Reine Regeln für Sitzungsfehler, Rücksprung und einmaligen Abmelde-Ablauf.
 * Kein Supabase-Client, damit Node-Tests ohne Browser laufen.
 */

export const SIGNED_OUT_MESSAGE = 'Du wurdest abgemeldet. Bitte melde dich neu an.';

/** sessionStorage — überlebt das Neuladen, falls die Query noch fehlt. */
export const FORCED_SIGN_OUT_STORAGE_KEY = 'omlify_forced_sign_out';

const SESSION_CODES = new Set([
  'session_not_found',
  'refresh_token_not_found',
  'invalid_token',
  'bad_jwt',
  'invalid_jwt',
  'PGRST301',
  'PGRST302',
]);

/**
 * @param {unknown[]} values
 * @returns {string | null}
 */
function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * @param {string} text
 * @returns {{ code: string | null, message: string | null }}
 */
export function fieldsFromErrorBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return { code: null, message: null };
  try {
    const body = JSON.parse(trimmed);
    if (!body || typeof body !== 'object') {
      return { code: null, message: trimmed.slice(0, 300) };
    }
    const record = /** @type {Record<string, unknown>} */ (body);
    const code = firstString([
      record.error_code,
      typeof record.code === 'string' ? record.code : null,
    ]);
    const message = firstString([
      record.message,
      record.msg,
      record.error_description,
      typeof record.error === 'string' ? record.error : null,
    ]);
    return { code, message };
  } catch {
    return { code: null, message: trimmed.slice(0, 300) };
  }
}

/**
 * FunctionsHttpError: Status in error.context.status, Text oft nur im Body.
 * @param {unknown} error
 * @param {string | null | undefined} [bodyText]
 */
export function sessionFailureFromInvokeError(error, bodyText) {
  const record = error && typeof error === 'object' ? /** @type {Record<string, unknown>} */ (error) : {};
  const context = record.context && typeof record.context === 'object'
    ? /** @type {Record<string, unknown>} */ (record.context)
    : null;
  const status =
    (context && typeof context.status === 'number' ? context.status : null)
    ?? (typeof record.status === 'number' ? record.status : null);
  const fromBody = fieldsFromErrorBody(typeof bodyText === 'string' ? bodyText : '');
  const message = fromBody.message
    ?? (typeof record.message === 'string' ? record.message : null);
  const code = fromBody.code
    ?? (typeof record.code === 'string' ? record.code : null);
  return {
    status,
    code,
    message,
    source: /** @type {const} */ ('function'),
  };
}

/**
 * @param {{ status?: number | null, code?: string | null, message?: string | null, source?: string | null }} input
 */
export function isSessionError(input) {
  if (input.source === 'network') return false;

  const code = (input.code ?? '').trim();
  const message = input.message ?? '';
  const source = input.source ?? 'unknown';
  const status = input.status ?? null;

  if (code === '42501' || /\b42501\b/.test(message)) return false;

  if (SESSION_CODES.has(code)) return true;
  if (/auth session missing/i.test(message)) return true;
  if (/jwt expired|invalid jwt|jwt is invalid/i.test(message)) return true;

  if (/permission denied|insufficient_privilege/i.test(message)) return false;
  if (source === 'postgrest' && status === 403) return false;
  if (source === 'function' && status === 403) return false;

  if (source === 'auth_user' && (status === 401 || status === 403)) return true;
  if (source === 'function' && status === 401) return true;

  return false;
}

/**
 * Nur app-interne Pfade. Fremde Hosts und Protokoll-Links fallen weg.
 * @param {string | null | undefined} input
 * @returns {string | null}
 */
export function safeReturnPath(input) {
  if (input == null) return null;
  const value = input.trim();
  if (!value || value.length > 2000) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.includes('\\') || value.includes('://') || value.includes('..')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    decoded.includes('://') ||
    decoded.includes('..')
  ) {
    return null;
  }

  const pathOnly = value.split('?')[0]?.split('#')[0] ?? '';
  if (pathOnly === '/auth' || pathOnly === '/login') return null;
  return value;
}

/**
 * Login-Pfad der App ist `/auth` (nicht `/login`).
 * @param {string} currentPath
 */
export function loginSearchForReturn(currentPath) {
  const params = new URLSearchParams();
  params.set('signed_out', '1');
  const next = safeReturnPath(currentPath);
  if (next) params.set('next', next);
  return params.toString();
}

/**
 * @param {string} currentPath
 */
export function forcedSignOutAuthPath(currentPath) {
  return `/auth?${loginSearchForReturn(currentPath)}`;
}

/**
 * @param {{ next?: string | null }} payload
 */
export function persistForcedSignOut(payload) {
  try {
    sessionStorage.setItem(
      FORCED_SIGN_OUT_STORAGE_KEY,
      JSON.stringify({
        next: payload.next ?? null,
        at: Date.now(),
      }),
    );
  } catch {
    // sessionStorage kann fehlen (privates Fenster).
  }
}

/**
 * @returns {{ next: string | null } | null}
 */
export function consumeForcedSignOutStorage() {
  try {
    const raw = sessionStorage.getItem(FORCED_SIGN_OUT_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FORCED_SIGN_OUT_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const next = typeof parsed.next === 'string' ? safeReturnPath(parsed.next) : null;
    return { next };
  } catch {
    return null;
  }
}

let voluntarySignOut = false;

export function markVoluntarySignOut() {
  voluntarySignOut = true;
}

export function consumeVoluntarySignOut() {
  if (!voluntarySignOut) return false;
  voluntarySignOut = false;
  return true;
}

export function isVoluntarySignOutPending() {
  return voluntarySignOut;
}

let forcedSignOutClaimed = false;

export function claimForcedSignOut() {
  if (forcedSignOutClaimed) return false;
  forcedSignOutClaimed = true;
  return true;
}

export function resetForcedSignOutForTests() {
  forcedSignOutClaimed = false;
  voluntarySignOut = false;
}

/**
 * @param {() => void | Promise<void>} action
 */
export async function runForcedSignOutOnce(action) {
  if (!claimForcedSignOut()) return false;
  await action();
  return true;
}
