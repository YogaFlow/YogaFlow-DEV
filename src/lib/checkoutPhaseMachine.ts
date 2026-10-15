/**
 * Pure Übergänge für den Checkout-Zustandsautomaten (Unit-Tests / Übersicht).
 * Die Runtime-Logik liegt in usePaymentCheckout — diese Tabelle spiegelt die Phasen.
 */
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

export type CheckoutEvent =
  | { type: 'PREPARE_START' }
  | { type: 'PREPARE_OK' }
  | { type: 'PREPARE_FAIL'; code: string }
  | { type: 'CONFIRM_START' }
  | { type: 'REQUIRES_ACTION' }
  | { type: 'CONFIRM_SUCCEEDED'; code?: string }
  | { type: 'CONFIRM_FAILED'; code: string }
  | { type: 'POLL_START' }
  | { type: 'POLL_DONE'; code: string }
  | { type: 'POLL_TIMEOUT' }
  | { type: 'RETRY_START' }
  | { type: 'HOLD_EXPIRED' }
  | { type: 'RESET' };

export function reduceCheckoutPhase(
  phase: CheckoutPhase,
  event: CheckoutEvent,
): CheckoutPhase {
  switch (event.type) {
    case 'RESET':
      return 'idle';
    case 'PREPARE_START':
      return 'preparing';
    case 'PREPARE_OK':
      return phase === 'preparing' || phase === 'retrying' ? 'ready' : phase;
    case 'PREPARE_FAIL':
    case 'CONFIRM_FAILED':
    case 'HOLD_EXPIRED':
      return 'error';
    case 'CONFIRM_START':
      return phase === 'ready' || phase === 'action' ? 'submitting' : phase;
    case 'REQUIRES_ACTION':
      return 'action';
    case 'CONFIRM_SUCCEEDED':
      return 'done';
    case 'POLL_START':
      return 'processing';
    case 'POLL_DONE':
      return event.code === 'CARD_DECLINED' ||
        event.code === 'AUTHENTICATION_REQUIRED'
        ? 'error'
        : 'done';
    case 'POLL_TIMEOUT':
      return 'done';
    case 'RETRY_START':
      return phase === 'error' ? 'retrying' : phase;
    default:
      return phase;
  }
}

/**
 * L1: Anmeldungen erst neu laden, wenn das Sheet geschlossen wird
 * und ein Endzustand (done/error) erreicht war — nicht schon beim Statuswechsel.
 */
export function shouldRefreshRegistrationsOnSheetClose(
  phase: CheckoutPhase,
  closing: boolean,
): boolean {
  if (!closing) return false;
  return phase === 'done' || phase === 'error';
}

/**
 * L1: Offenes Sheet bleibt gemountet, auch wenn die Buchung
 * von pending_payment → registered wechselt.
 */
export function sheetRemainsOpenAfterRegistrationChange(
  sheetOpen: boolean,
  registrationStatus: string | null | undefined,
): boolean {
  void registrationStatus;
  return sheetOpen;
}

const HOLD_CLOCK_RETRYABLE = new Set([
  'CARD_DECLINED',
  'AUTHENTICATION_REQUIRED',
  'PROVIDER_UNAVAILABLE',
]);

function holdClockApplies(phase: CheckoutPhase, code: string | null | undefined): boolean {
  if (phase === 'ready' || phase === 'retrying') return true;
  if (phase !== 'error') return false;
  return code == null || HOLD_CLOCK_RETRYABLE.has(code);
}

/**
 * Z7: Bei offenem Sheet führt der Ablauf der Frist zu HOLD_EXPIRED.
 * Das Sheet bleibt offen, Bezahlen ist gesperrt.
 * Ein geschlossenes Sheet wird dadurch nicht geöffnet.
 * Erfolg, laufende Bestätigung und schon gesetzte Fachfehler (z. B. NOT_PENDING) bleiben.
 */
export function resolveOpenSheetHoldExpiry(input: {
  sheetOpen: boolean;
  phase: CheckoutPhase;
  code?: string | null;
  holdExpiresAt: string | null | undefined;
  nowMs: number;
}): {
  sheetOpen: boolean;
  phase: CheckoutPhase;
  code: 'HOLD_EXPIRED' | null;
  payLocked: boolean;
} {
  if (!input.sheetOpen) {
    return {
      sheetOpen: false,
      phase: input.phase,
      code: null,
      payLocked: false,
    };
  }
  const expiresMs = input.holdExpiresAt
    ? new Date(input.holdExpiresAt).getTime()
    : Number.NaN;
  const expired = Number.isFinite(expiresMs) && expiresMs <= input.nowMs;
  if (!expired || !holdClockApplies(input.phase, input.code)) {
    return {
      sheetOpen: true,
      phase: input.phase,
      code: null,
      payLocked: false,
    };
  }
  return {
    sheetOpen: true,
    phase: reduceCheckoutPhase(input.phase, { type: 'HOLD_EXPIRED' }),
    code: 'HOLD_EXPIRED',
    payLocked: true,
  };
}

/**
 * L2: Nach fehlgeschlagenem Versuch nie dieselbe attempt_id für confirm nutzen.
 * prepare liefert eine neue ID; HOLD_EXPIRED aus prepare bleibt Fehler.
 */
export function attemptIdAfterRetryPrepare(
  previousAttemptId: string,
  prepareResult:
    | { ok: true; attemptId: string }
    | { ok: false; code: string },
): { attemptId: string | null; code: string | null } {
  if (!prepareResult.ok) {
    return { attemptId: null, code: prepareResult.code };
  }
  if (prepareResult.attemptId === previousAttemptId) {
    return { attemptId: null, code: 'INVALID_REQUEST' };
  }
  return { attemptId: prepareResult.attemptId, code: null };
}
