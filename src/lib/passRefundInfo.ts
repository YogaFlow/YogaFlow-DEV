import type { CoverageStatus } from '../types';
import { formatFriendlyCancellationDeadline } from './cancellationDeadline.ts';

export type PassRefundInfo = {
  /** true = noch innerhalb der eingefrorenen Frist */
  refundable: boolean;
  /** ISO timestamptz aus registrations.cancellation_deadline */
  deadline: string;
};

type RefundSource = {
  coverage_status?: CoverageStatus | string | null;
  cancellation_deadline?: string | null;
};

/**
 * Ob eine Buchung mit Karte bei Selbstabmeldung die Einheit zurückgibt.
 * Frist kommt ausschließlich aus registrations.cancellation_deadline — nie neu rechnen.
 */
export function passRefundInfo(registration: RefundSource): PassRefundInfo | null {
  if (registration.coverage_status !== 'pass') return null;
  const deadline = registration.cancellation_deadline;
  if (deadline == null || deadline === '') return null;
  const ms = new Date(deadline).getTime();
  if (Number.isNaN(ms)) return null;
  return {
    refundable: Date.now() < ms,
    deadline,
  };
}

/** Do, 8. Okt, 15:45 — Europe/Berlin (UX-4 B1, gemeinsam mit Mail). */
export const formatCancellationDeadline = formatFriendlyCancellationDeadline;

/** Text im Abmelde-Dialog (Teilnehmende), Buchung mit Karte. */
export function unregisterPassDialogMessage(info: PassRefundInfo): string {
  const when = formatCancellationDeadline(info.deadline);
  if (info.refundable) {
    return `Du bekommst die Einheit auf deine Kurskarte zurück. Kostenlos abmelden bis ${when}.`;
  }
  return `Die Abmeldefrist ist seit ${when} vorbei. Die Einheit bleibt verbraucht.`;
}

/** Zahlstatus ohne Abmeldefrist (Frist ist eigene Zeile, UX-4 B1). */
export function passRefundStatusLine(): string {
  return 'mit Kurskarte bezahlt';
}
