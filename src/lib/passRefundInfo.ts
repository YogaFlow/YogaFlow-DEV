import type { CoverageStatus } from '../types';

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

/** Fr, 03.10., 18:00 — Europe/Berlin */
export function formatCancellationDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const weekday = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
  })
    .format(date)
    .replace(/\.$/, '');

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${weekday}, ${get('day')}.${get('month')}., ${get('hour')}:${get('minute')}`;
}

/** Text im Abmelde-Dialog (Teilnehmende), Buchung mit Karte. */
export function unregisterPassDialogMessage(info: PassRefundInfo): string {
  const when = formatCancellationDeadline(info.deadline);
  if (info.refundable) {
    return `Du bekommst die Einheit auf deine Karte zurück. Kostenlos abmelden bis ${when}.`;
  }
  return `Die Abmeldefrist ist seit ${when} vorbei. Die Einheit bleibt verbraucht.`;
}

/** Kleine Statuszeile auf Kursdetail / Meine Anmeldungen. */
export function passRefundStatusLine(info: PassRefundInfo): string {
  if (info.refundable) {
    return `Mit Karte bezahlt · kostenlos abmelden bis ${formatCancellationDeadline(info.deadline)}`;
  }
  return 'Abmeldefrist vorbei';
}
