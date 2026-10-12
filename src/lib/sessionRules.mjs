/**
 * Reine Regeln für Sitzungsfehler, Rücksprung und einmaligen Abmelde-Ablauf.
 * Kein Supabase-Client, damit Node-Tests ohne Browser laufen.
 */

export const SIGNED_OUT_MESSAGE = 'Du wurdest abgemeldet. Bitte melde dich neu an.';

/** sessionStorage — überlebt das Neuladen, falls die Query noch fehlt. */
export const FORCED_SIGN_OUT_STORAGE_KEY = 'omlify_forced_sign_out';

/** Uhr für Schleifenschutz (zweiter Ablauf innerhalb von 10 s). */
export const FORCED_SIGN_OUT_LOOP_KEY = 'omlify_forced_sign_out_loop';

/** Intent gilt höchstens so lange. */
export const FORCED_SIGN_OUT_TTL_MS = 2 * 60 * 1000;

/** Zweiter Abmelde-Ablauf innerhalb dieses Fensters wird abgebrochen. */
export const FORCED_SIGN_OUT_LOOP_MS = 10 * 1000;

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
 * session_id aus dem Access-Token (GoTrue-JWT).
 * @param {string | null | undefined} token
 * @returns {string | null}
 */
export function sessionIdFromAccessToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload.session_id === 'string' && payload.session_id
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @param {number} [now]
 * @returns {{ next: string | null, sessionId: string | null, at: number } | null}
 */
export function parseForcedSignOutIntent(raw, now = Date.now()) {
  if (raw == null) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (parsed);
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : null;
  if (at == null) return null;
  if (now - at > FORCED_SIGN_OUT_TTL_MS) return null;
  const next = typeof record.next === 'string' ? safeReturnPath(record.next) : null;
  const sessionId = typeof record.sessionId === 'string' && record.sessionId
    ? record.sessionId
    : null;
  return { next, sessionId, at };
}

/**
 * @param {{ next?: string | null, sessionId?: string | null, at?: number }} intent
 * @param {string | null | undefined} currentSessionId
 * @param {number} [now]
 * @returns {'none' | 'expired' | 'await_login' | 'clear_stale' | 'accept_new'}
 */
export function decideForcedSignOutAction(intent, currentSessionId, now = Date.now()) {
  if (!intent) return 'none';
  if (now - intent.at > FORCED_SIGN_OUT_TTL_MS) return 'expired';
  if (!currentSessionId) return 'await_login';
  if (intent.sessionId && currentSessionId === intent.sessionId) return 'clear_stale';
  // Neue Anmeldung (andere session_id) oder Intent ohne alte ID nach Login.
  return 'accept_new';
}

/**
 * @param {{ next?: string | null, sessionId?: string | null }} payload
 * @param {number} [now]
 */
export function persistForcedSignOut(payload, now = Date.now()) {
  try {
    sessionStorage.setItem(
      FORCED_SIGN_OUT_STORAGE_KEY,
      JSON.stringify({
        next: payload.next ?? null,
        sessionId: payload.sessionId ?? null,
        at: now,
      }),
    );
  } catch {
    // sessionStorage kann fehlen (privates Fenster).
  }
}

/** Liest den Intent, ohne ihn zu löschen. Abgelaufene Intents werden entfernt. */
export function readForcedSignOutIntent(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(FORCED_SIGN_OUT_STORAGE_KEY);
    if (!raw) return null;
    const intent = parseForcedSignOutIntent(raw, now);
    if (!intent) {
      sessionStorage.removeItem(FORCED_SIGN_OUT_STORAGE_KEY);
      return null;
    }
    return intent;
  } catch {
    return null;
  }
}

export function clearForcedSignOutStorage() {
  try {
    sessionStorage.removeItem(FORCED_SIGN_OUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {number} [now]
 */
export function recordForcedSignOutLoopClock(now = Date.now()) {
  try {
    sessionStorage.setItem(FORCED_SIGN_OUT_LOOP_KEY, String(now));
  } catch {
    // ignore
  }
}

/**
 * @param {number | null | undefined} lastAt
 * @param {number} [now]
 * @returns {boolean} true = zweiten Ablauf blockieren
 */
export function isForcedSignOutLoop(lastAt, now = Date.now()) {
  return lastAt != null && Number.isFinite(lastAt) && now - lastAt < FORCED_SIGN_OUT_LOOP_MS;
}

/**
 * @param {number} [now]
 * @returns {boolean} true = zweiten Ablauf blockieren
 */
export function shouldBlockForcedSignOutLoop(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(FORCED_SIGN_OUT_LOOP_KEY);
    if (!raw) return false;
    return isForcedSignOutLoop(Number(raw), now);
  } catch {
    return false;
  }
}

export function clearForcedSignOutLoopClock() {
  try {
    sessionStorage.removeItem(FORCED_SIGN_OUT_LOOP_KEY);
  } catch {
    // ignore
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
