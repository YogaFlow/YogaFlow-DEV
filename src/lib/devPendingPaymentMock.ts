/**
 * DEV-only: Screenshot-Hilfe für pending_payment-UI.
 * Query ?pendingPayment=1 — nur mit import.meta.env.DEV.
 * Feste Frist: Do., 01.10.2026, 16:00 Europe/Berlin (für lesbare Screenshots).
 *
 * Wichtig: Strings und Logik nur hinter `import.meta.env.DEV`, damit der
 * Production-Build sie per Dead-Code-Elimination entfernt.
 */

export function isDevPendingPaymentMock(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pendingPayment') === '1';
}

export function resolveHoldExpiresAt(
  real: string | null | undefined,
): string | null {
  if (import.meta.env.DEV && isDevPendingPaymentMock()) {
    // 2026-10-01 16:00 Europe/Berlin
    return '2026-10-01T14:00:00.000Z';
  }
  return real ?? null;
}
