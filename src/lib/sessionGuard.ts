import { supabase } from './supabase';
import { withDevTenant } from '../context/TenantContext';
import { setSessionHttpHandler } from './sessionHttp';
import {
  claimForcedSignOut,
  fieldsFromErrorBody,
  forcedSignOutAuthPath,
  isSessionError,
  isVoluntarySignOutPending,
  markVoluntarySignOut,
  persistForcedSignOut,
  safeReturnPath,
  sessionFailureFromInvokeError,
  type SessionErrorSource,
} from './sessionRules.mjs';

export { consumeVoluntarySignOut, markVoluntarySignOut } from './sessionRules.mjs';

function clearLocalAuthStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    }
  } catch {
    // localStorage kann blockiert sein.
  }
}

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

/**
 * Hinweis und Login-URL müssen das Neuladen überleben:
 * zuerst sessionStorage + Tokens löschen, signOut abwarten, dann replace.
 * Ohne await sprang /auth mit noch gültiger Sitzung zurück auf next (/users).
 */
export async function beginForcedSignOut(): Promise<void> {
  if (!claimForcedSignOut()) return;
  markVoluntarySignOut();

  const here = `${window.location.pathname}${window.location.search}`;
  persistForcedSignOut({ next: safeReturnPath(here) });
  clearLocalAuthStorage();

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Tokens sind lokal schon weg.
  }

  const target = withDevTenant(forcedSignOutAuthPath(here));
  if (
    window.location.pathname === '/auth'
    && new URLSearchParams(window.location.search).get('signed_out') === '1'
  ) {
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
      void beginForcedSignOut();
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

/** Liest FunctionsHttpError (Status in context, Text im Body). */
export async function readInvokeFailure(error: unknown): Promise<{
  status: number | null;
  code: string | null;
  message: string | null;
}> {
  const context = (error as {
    context?: { status?: number; clone?: () => Response; text?: () => Promise<string> };
  }).context;
  let bodyText: string | null = null;
  if (context) {
    try {
      const source = typeof context.clone === 'function' ? context.clone() : context;
      if (source && typeof source.text === 'function') {
        bodyText = await source.text();
      }
    } catch {
      bodyText = null;
    }
  }
  const failure = sessionFailureFromInvokeError(error, bodyText);
  return {
    status: failure.status ?? null,
    code: failure.code ?? null,
    message: failure.message ?? null,
  };
}

/** true = Abmelde-Ablauf gestartet (Aufrufer soll nichts weiter anzeigen). */
export async function reactToSessionInvokeError(error: unknown): Promise<boolean> {
  const failure = await readInvokeFailure(error);
  if (!isSessionError({ ...failure, source: 'function' })) return false;
  await beginForcedSignOut();
  return true;
}

setSessionHttpHandler(noteHttpResponse);
