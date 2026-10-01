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
      return phase === 'preparing' ? 'ready' : phase;
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
      return event.code === 'CARD_DECLINED' || event.code === 'AUTHENTICATION_REQUIRED'
        ? 'error'
        : 'done';
    case 'POLL_TIMEOUT':
      return 'done';
    default:
      return phase;
  }
}
