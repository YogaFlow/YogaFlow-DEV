/**
 * payments-checkout Client (2.2b-1). Zustandsautomat für prepare → confirm → status.
 * Stripe-SDK bleibt in StripePaymentForm; hier nur invoke + Codes.
 */
import { useCallback, useRef, useState } from 'react';
import { readInvokeErrorBody } from '../../lib/removePerson';
import { supabase } from '../../lib/supabase';
import { paymentMessageForCode } from '../../lib/paymentTexts';

export type CheckoutPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'submitting'
  | 'action'
  | 'processing'
  | 'retrying'
  | 'done'
  | 'error';

export type PrepareOk = {
  attemptId: string;
  amountCents: number;
  currency: string;
  holdExpiresAt: string;
  accountRef: string;
};

export type CheckoutDoneCode =
  | 'COMPLETED'
  | 'ALREADY_COMPLETED'
  | 'RESTORED'
  | 'REFUND_REQUIRED'
  | string;

const POLL_MS = 3000;
const POLL_MAX_MS = 60_000;

function invokeCode(
  data: unknown,
  fallback: string | null,
): string | null {
  if (data && typeof data === 'object' && 'code' in data) {
    const c = (data as { code?: unknown }).code;
    if (typeof c === 'string' && c) return c;
  }
  return fallback;
}

export function usePaymentCheckout() {
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [prepare, setPrepare] = useState<PrepareOk | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);
  const pollAbort = useRef(0);

  const reset = useCallback(() => {
    pollAbort.current += 1;
    setPhase('idle');
    setPrepare(null);
    setCode(null);
    setMessage(null);
    setRegistrationStatus(null);
  }, []);

  const fail = useCallback((errCode: string | null) => {
    setPhase('error');
    setCode(errCode);
    setMessage(paymentMessageForCode(errCode));
  }, []);

  const applyPrepareRow = useCallback(
    (row: Record<string, unknown>): PrepareOk | null => {
      if (typeof row.code === 'string' && row.attempt_id == null) {
        fail(row.code);
        return null;
      }

      const attemptId = typeof row.attempt_id === 'string' ? row.attempt_id : '';
      const amountCents =
        typeof row.amount_cents === 'number' ? row.amount_cents : NaN;
      const currency = typeof row.currency === 'string' ? row.currency : '';
      const holdExpiresAt =
        typeof row.hold_expires_at === 'string' ? row.hold_expires_at : '';
      const accountRef = typeof row.account_ref === 'string' ? row.account_ref : '';

      if (
        !attemptId ||
        !Number.isFinite(amountCents) ||
        !currency ||
        !holdExpiresAt ||
        !accountRef
      ) {
        fail('INVALID_REQUEST');
        return null;
      }

      const next: PrepareOk = {
        attemptId,
        amountCents,
        currency,
        holdExpiresAt,
        accountRef,
      };
      setPrepare(next);
      setPhase('ready');
      return next;
    },
    [fail],
  );

  const runPrepare = useCallback(
    async (
      registrationId: string,
      options?: { mode?: 'initial' | 'retry' },
    ): Promise<PrepareOk | null> => {
      const retry = options?.mode === 'retry';
      setPhase(retry ? 'retrying' : 'preparing');
      setCode(null);
      setMessage(null);
      // L2: beim Retry prepare nicht leeren — Payment Element bleibt gemountet.
      if (!retry) setPrepare(null);

      const { data, error } = await supabase.functions.invoke('payments-checkout', {
        body: { action: 'prepare', registration_id: registrationId },
      });

      if (error) {
        const body = await readInvokeErrorBody(error);
        fail(body.code ?? 'INVALID_REQUEST');
        return null;
      }

      return applyPrepareRow((data ?? {}) as Record<string, unknown>);
    },
    [applyPrepareRow, fail],
  );

  /** K1: Online-Kartenkauf mit Consent-Hashes. */
  const runPreparePass = useCallback(
    async (
      productId: string,
      immediateUseHash: string,
      withdrawalInfoHash: string,
      options?: { mode?: 'initial' | 'retry' },
    ): Promise<PrepareOk | null> => {
      const retry = options?.mode === 'retry';
      setPhase(retry ? 'retrying' : 'preparing');
      setCode(null);
      setMessage(null);
      if (!retry) setPrepare(null);

      const { data, error } = await supabase.functions.invoke('payments-checkout', {
        body: {
          action: 'prepare',
          product_id: productId,
          immediate_use_hash: immediateUseHash,
          withdrawal_info_hash: withdrawalInfoHash,
        },
      });

      if (error) {
        const body = await readInvokeErrorBody(error);
        fail(body.code ?? 'INVALID_REQUEST');
        return null;
      }

      return applyPrepareRow((data ?? {}) as Record<string, unknown>);
    },
    [applyPrepareRow, fail],
  );

  /** L2: Nach Ablehnung/3DS-Fehler neuen Versuch vorbereiten (neue attempt_id). */
  const runRetryPrepare = useCallback(
    async (registrationId: string): Promise<PrepareOk | null> => {
      return runPrepare(registrationId, { mode: 'retry' });
    },
    [runPrepare],
  );

  const applyStatusBody = useCallback(
    (row: Record<string, unknown>): {
      kind: 'done' | 'error' | 'continue';
      code: string | null;
      message: string;
    } => {
      const completion = invokeCode(row, null);
      const regStatus =
        typeof row.registration_status === 'string'
          ? row.registration_status
          : null;
      setRegistrationStatus(regStatus);

      if (
        completion === 'COMPLETED' ||
        completion === 'ALREADY_COMPLETED' ||
        completion === 'RESTORED' ||
        completion === 'REFUND_REQUIRED'
      ) {
        const msg = paymentMessageForCode(completion);
        setPhase('done');
        setCode(completion);
        setMessage(msg);
        return { kind: 'done', code: completion, message: msg };
      }

      const attemptStatus =
        typeof row.attempt_status === 'string' ? row.attempt_status : '';
      if (attemptStatus === 'failed' || attemptStatus === 'canceled') {
        const msg = paymentMessageForCode('CARD_DECLINED');
        setPhase('error');
        setCode('CARD_DECLINED');
        setMessage(msg);
        return { kind: 'error', code: 'CARD_DECLINED', message: msg };
      }

      if (regStatus === 'registered' || regStatus === 'cancelled') {
        const c = completion ?? 'ALREADY_COMPLETED';
        const msg = paymentMessageForCode(c);
        setPhase('done');
        setCode(c);
        setMessage(msg);
        return { kind: 'done', code: c, message: msg };
      }

      // K1: Kartenkauf hat keine registration_status — succeeded reicht.
      const subjectType =
        typeof row.subject_type === 'string' ? row.subject_type : null;
      if (
        subjectType === 'pass_product' &&
        (attemptStatus === 'succeeded' || completion === 'COMPLETED')
      ) {
        const c = completion ?? 'COMPLETED';
        const msg = paymentMessageForCode(c);
        setPhase('done');
        setCode(c);
        setMessage(msg);
        return { kind: 'done', code: c, message: msg };
      }

      return { kind: 'continue', code: null, message: '' };
    },
    [],
  );

  const runStatus = useCallback(
    async (
      attemptId: string,
    ): Promise<{ kind: 'done' | 'error' | 'continue'; code: string | null; message: string }> => {
      const { data, error } = await supabase.functions.invoke('payments-checkout', {
        body: { action: 'status', attempt_id: attemptId },
      });
      if (error) {
        const body = await readInvokeErrorBody(error);
        const errCode = body.code ?? 'INVALID_REQUEST';
        const msg = paymentMessageForCode(errCode);
        setPhase('error');
        setCode(errCode);
        setMessage(msg);
        return { kind: 'error', code: errCode, message: msg };
      }
      return applyStatusBody((data ?? {}) as Record<string, unknown>);
    },
    [applyStatusBody],
  );

  const pollUntilDone = useCallback(
    async (
      attemptId: string,
    ): Promise<{ code: string | null; message: string }> => {
      const token = ++pollAbort.current;
      setPhase('processing');
      const started = Date.now();
      while (Date.now() - started < POLL_MAX_MS) {
        if (token !== pollAbort.current) {
          return { code: null, message: '' };
        }
        const result = await runStatus(attemptId);
        if (token !== pollAbort.current) {
          return { code: null, message: '' };
        }
        if (result.kind === 'done' || result.kind === 'error') {
          return { code: result.code, message: result.message };
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (token !== pollAbort.current) {
        return { code: null, message: '' };
      }
      const msg = paymentMessageForCode('PROCESSING_TIMEOUT');
      setPhase('done');
      setCode('PROCESSING_TIMEOUT');
      setMessage(msg);
      return { code: 'PROCESSING_TIMEOUT', message: msg };
    },
    [runStatus],
  );

  const runConfirm = useCallback(
    async (
      attemptId: string,
      confirmationToken: string,
    ): Promise<
      | { kind: 'succeeded' | 'processing' | 'done' }
      | { kind: 'requires_action'; clientSecret: string }
      | { kind: 'error' }
    > => {
      setPhase('submitting');
      setCode(null);
      setMessage(null);

      const { data, error } = await supabase.functions.invoke('payments-checkout', {
        body: {
          action: 'confirm',
          attempt_id: attemptId,
          confirmation_token: confirmationToken,
        },
      });

      if (error) {
        const body = await readInvokeErrorBody(error);
        fail(body.code ?? 'INVALID_REQUEST');
        return { kind: 'error' };
      }

      const row = (data ?? {}) as Record<string, unknown>;
      const status = typeof row.status === 'string' ? row.status : '';

      if (status === 'requires_action') {
        const clientSecret =
          typeof row.client_secret === 'string' ? row.client_secret : '';
        if (!clientSecret) {
          fail('AUTHENTICATION_REQUIRED');
          return { kind: 'error' };
        }
        setPhase('action');
        return { kind: 'requires_action', clientSecret };
      }

      if (status === 'succeeded' || status === 'processing') {
        const completion = invokeCode(row, null);
        if (
          completion === 'COMPLETED' ||
          completion === 'ALREADY_COMPLETED' ||
          completion === 'RESTORED' ||
          completion === 'REFUND_REQUIRED'
        ) {
          setPhase('done');
          setCode(completion);
          setMessage(paymentMessageForCode(completion));
          setRegistrationStatus(
            typeof row.registration_status === 'string'
              ? row.registration_status
              : null,
          );
          return { kind: 'done' };
        }
        if (status === 'processing' || !completion) {
          await pollUntilDone(attemptId);
          return { kind: 'processing' };
        }
        setPhase('done');
        setCode(completion);
        setMessage(paymentMessageForCode(completion));
        return { kind: 'done' };
      }

      // Fehlerantworten kommen meist als invoke error; falls Body mit code:
      if (typeof row.code === 'string') {
        fail(row.code);
        return { kind: 'error' };
      }
      fail('INVALID_REQUEST');
      return { kind: 'error' };
    },
    [fail, pollUntilDone],
  );

  const markAuthFailed = useCallback(() => {
    fail('AUTHENTICATION_REQUIRED');
  }, [fail]);

  const busy =
    phase === 'preparing' ||
    phase === 'submitting' ||
    phase === 'action' ||
    phase === 'processing' ||
    phase === 'retrying';

  return {
    phase,
    prepare,
    code,
    message,
    registrationStatus,
    busy,
    reset,
    runPrepare,
    runPreparePass,
    runRetryPrepare,
    runConfirm,
    runStatus,
    pollUntilDone,
    markAuthFailed,
    fail,
  };
}

/** sessionStorage-Schlüssel für 3-D-Secure-Rückkehr (nur attempt_id, nie acct_/secret). */
export function paymentAttemptStorageKey(registrationId: string): string {
  return `omlify.paymentAttempt.${registrationId}`;
}

export function storePaymentAttempt(
  registrationId: string,
  attemptId: string,
): void {
  try {
    sessionStorage.setItem(paymentAttemptStorageKey(registrationId), attemptId);
  } catch {
    // private mode / quota
  }
}

export function readPaymentAttempt(registrationId: string): string | null {
  try {
    return sessionStorage.getItem(paymentAttemptStorageKey(registrationId));
  } catch {
    return null;
  }
}

export function clearPaymentAttempt(registrationId: string): void {
  try {
    sessionStorage.removeItem(paymentAttemptStorageKey(registrationId));
  } catch {
    // ignore
  }
}

/** Liest den letzten gespeicherten Versuch (beliebige Buchung) für ?payment=return. */
export function readAnyPaymentAttempt(): {
  registrationId: string;
  attemptId: string;
} | null {
  try {
    const prefix = 'omlify.paymentAttempt.';
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const attemptId = sessionStorage.getItem(key);
      if (!attemptId) continue;
      return {
        registrationId: key.slice(prefix.length),
        attemptId,
      };
    }
  } catch {
    return null;
  }
  return null;
}
