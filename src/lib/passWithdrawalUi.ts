/**
 * FS-1 D/B — Texte und Phasen für den Widerruf-Dialog (ohne React).
 */
import { formatCents } from './format.ts';

export type PassWithdrawalPhase = 'form' | 'summary' | 'done' | 'blocked';

export function passWithdrawalSuccessMessage(refundCents: number): string {
  const amount =
    typeof refundCents === 'number' && Number.isFinite(refundCents) ? refundCents : 0;
  return `Widerruf bestätigt. ${formatCents(amount)} werden erstattet. Du erhältst eine Eingangsbestätigung per E-Mail.`;
}

export function passWithdrawalAlreadyMessage(): string {
  return 'Dieser Vertrag wurde bereits widerrufen.';
}

/** Nach RPC-Antwort: nächste Phase und ob Bestätigen erlaubt ist. */
export function passWithdrawalAfterConfirm(result: {
  success?: boolean;
  error?: string;
  refund_cents?: number;
}): {
  phase: PassWithdrawalPhase;
  message: string;
  showConfirm: boolean;
} {
  if (result.success === true) {
    return {
      phase: 'done',
      message: passWithdrawalSuccessMessage(result.refund_cents ?? 0),
      showConfirm: false,
    };
  }
  if (result.error === 'ALREADY_WITHDRAWN') {
    return {
      phase: 'blocked',
      message: passWithdrawalAlreadyMessage(),
      showConfirm: false,
    };
  }
  if (result.error === 'WINDOW_EXPIRED') {
    return {
      phase: 'blocked',
      message: 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.',
      showConfirm: false,
    };
  }
  return {
    phase: 'summary',
    message: 'Widerruf fehlgeschlagen.',
    showConfirm: true,
  };
}
