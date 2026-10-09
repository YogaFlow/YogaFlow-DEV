import { supabase } from './supabase';
import { withDevTenant } from '../context/TenantContext';
import { setSessionHttpHandler } from './sessionHttp';
import {
  claimForcedSignOut,
  fieldsFromErrorBody,
  isSessionError,
  isVoluntarySignOutPending,
  loginSearchForReturn,
  markVoluntarySignOut,
  type SessionErrorSource,
} from './sessionRules.mjs';

export { consumeVoluntarySignOut, markVoluntarySignOut } from './sessionRules.mjs';

export async function signOutThisDevice(): Promise<void> {
  markVoluntarySignOut();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Dieses Gerät soll lokal raus, auch wenn der Server nicht antwortet.
  }
}

function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((key) => {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) return false;
      const raw = localStorage.getItem(key);
      return !!raw && raw.includes('access_token');
    });
  } catch {
    return false;
  }
}

export function beginForcedSignOut(): void {
  if (!claimForcedSignOut()) return;
  markVoluntarySignOut();
  const here = `${window.location.pathname}${window.location.search}`;
  const target = withDevTenant(`/auth?${loginSearchForReturn(here)}`);
  void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  if (window.location.pathname === '/auth' && new URLSearchParams(window.location.search).get('signed_out') === '1') {
    return;
  }
  window.location.replace(target);
}

function sourceFromUrl(url: string): SessionErrorSource {
  if (url.includes('/auth/v1/user')) return 'auth_user';
  if (url.includes('/functions/v1/')) return 'function';
  if (url.includes('/rest/v1/')) return 'postgrest';
  return 'unknown';
}

export function noteHttpResponse(url: string, response: Response): void {
  if (response.ok || url.includes('/auth/v1/logout')) return;
  if (isVoluntarySignOutPending() || !hasStoredSession()) return;
  const status = response.status;
  const source = sourceFromUrl(url);
  let textPromise: Promise<string>;
  try {
    textPromise = response.clone().text();
  } catch {
    return;
  }
  void textPromise.then((text) => {
    if (isVoluntarySignOutPending()) return;
    const parsed = fieldsFromErrorBody(text);
    if (isSessionError({ status, code: parsed.code, message: parsed.message, source })) {
      beginForcedSignOut();
    }
  }).catch(() => {
    // Netzwerk beim Lesen der Fehlerantwort ist kein Sitzungsfehler.
  });
}

export function isSessionAuthFailure(error: { message?: string; code?: string; status?: number } | null): boolean {
  if (!error) return false;
  return isSessionError({
    status: error.status ?? null,
    code: error.code ?? null,
    message: error.message ?? null,
    source: 'auth_user',
  });
}

setSessionHttpHandler(noteHttpResponse);
