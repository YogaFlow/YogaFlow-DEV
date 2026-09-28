/**
 * Lädt und ändert den Online-Zahlungs-Stand (1.3b).
 * Edge Function payments-onboarding über supabase.functions.invoke (JWT + Tenant-Header).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { readInvokeErrorBody } from '../../lib/removePerson';
import { copy } from './paymentSetupCopy';
import {
  mockStatus,
  type PaymentSetupStatus,
  type PaymentUiStatus,
  readDevMockStatus,
  toUiStatus,
} from './paymentSetupTypes';

export type SwitchResult =
  | { ok: true }
  | { ok: false; code: string | null; message: string };

async function loadSetupStatus(): Promise<PaymentSetupStatus> {
  const mock = readDevMockStatus();
  if (mock) return mockStatus(mock);

  const { data, error } = await supabase.rpc('get_payment_setup_status');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('empty');
  const row = data as PaymentSetupStatus;
  if (row.success === false) {
    const err = new Error(typeof row.error === 'string' ? row.error : 'FORBIDDEN');
    (err as Error & { code?: string }).code = typeof row.error === 'string' ? row.error : 'FORBIDDEN';
    throw err;
  }
  return row;
}

export async function startOnboardingSession(): Promise<{ clientSecret: string; expiresAt: number }> {
  const { data, error } = await supabase.functions.invoke('payments-onboarding', {
    body: { action: 'start' },
  });
  if (error) {
    const body = await readInvokeErrorBody(error);
    throw Object.assign(new Error(body.message ?? copy.genericError), { code: body.code });
  }
  const row = (data ?? {}) as { client_secret?: unknown; expires_at?: unknown; code?: unknown; message?: unknown };
  if (typeof row.client_secret !== 'string' || typeof row.expires_at !== 'number') {
    throw Object.assign(new Error(typeof row.message === 'string' ? row.message : copy.formError), {
      code: typeof row.code === 'string' ? row.code : null,
    });
  }
  return { clientSecret: row.client_secret, expiresAt: row.expires_at };
}

export async function refreshOnboardingStatus(): Promise<PaymentSetupStatus> {
  const mock = readDevMockStatus();
  if (mock) return mockStatus(mock);

  const { data, error } = await supabase.functions.invoke('payments-onboarding', {
    body: { action: 'refresh' },
  });
  if (error) {
    const body = await readInvokeErrorBody(error);
    throw Object.assign(new Error(body.message ?? copy.genericError), { code: body.code });
  }
  const row = (data ?? {}) as PaymentSetupStatus;
  if (row.success === false) {
    throw Object.assign(new Error(copy.genericError), {
      code: typeof row.error === 'string' ? row.error : null,
    });
  }
  return row;
}

function mapSwitchError(code: string | null, fallback: string): string {
  if (code === 'TAX_SETTING_MISSING') return copy.switchErrors.TAX_SETTING_MISSING;
  if (code === 'PROVIDER_NOT_READY') return copy.switchErrors.PROVIDER_NOT_READY;
  if (code === 'PLATFORM_DISABLED') return copy.switchErrors.PLATFORM_DISABLED;
  return fallback;
}

export function usePaymentSetup(enabled: boolean) {
  const [status, setStatus] = useState<PaymentSetupStatus | null>(null);
  const [uiStatus, setUiStatus] = useState<PaymentUiStatus | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: PaymentSetupStatus) => {
    setStatus(next);
    setUiStatus(toUiStatus(next.onboarding_status));
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      apply(await loadSetupStatus());
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FORBIDDEN') {
        setError(copy.loadError);
      } else {
        setError(copy.loadError);
      }
      setStatus(null);
      setUiStatus(null);
    } finally {
      setLoading(false);
    }
  }, [apply, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, reload]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      apply(await refreshOnboardingStatus());
    } catch {
      setError(copy.genericError);
    } finally {
      setBusy(false);
    }
  }, [apply]);

  const setOnlineEnabled = useCallback(async (enabledOnline: boolean): Promise<SwitchResult> => {
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_online_payments_enabled', {
        p_enabled: enabledOnline,
      });
      if (rpcError) {
        return { ok: false, code: null, message: copy.genericError };
      }
      const row = (data ?? {}) as { success?: boolean; error?: string };
      if (row.success === false) {
        const code = typeof row.error === 'string' ? row.error : null;
        return { ok: false, code, message: mapSwitchError(code, copy.genericError) };
      }
      await reload();
      return { ok: true };
    } catch {
      return { ok: false, code: null, message: copy.genericError };
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const setOnsiteAllowed = useCallback(async (allow: boolean): Promise<SwitchResult> => {
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_allow_onsite_payment', {
        p_allow: allow,
      });
      if (rpcError) {
        return { ok: false, code: null, message: copy.genericError };
      }
      const row = (data ?? {}) as { success?: boolean; error?: string };
      if (row.success === false) {
        const code = typeof row.error === 'string' ? row.error : null;
        return { ok: false, code, message: mapSwitchError(code, copy.genericError) };
      }
      await reload();
      return { ok: true };
    } catch {
      return { ok: false, code: null, message: copy.genericError };
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return {
    status,
    uiStatus,
    loading,
    error,
    busy,
    reload,
    refresh,
    setOnlineEnabled,
    setOnsiteAllowed,
  };
}
