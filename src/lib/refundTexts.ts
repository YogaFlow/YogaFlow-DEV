import { hasCourseEnded } from './courseDateTime.ts';
import { formatCents } from './format.ts';
import { formatCancellationDeadline } from './passRefundInfo.ts';

/** Ein Eintrag aus get_registration_refund_states. */
export type RegistrationRefundState = {
  registration_id: string;
  payment_id: string | null;
  payment_cents: number;
  refundable_cents: number;
  refunded_cents: number;
  pending_cents: number;
  failed: boolean;
};

export type OnlineRefundInfo = {
  /** true = Selbstabmeldung erstattet (vor der Frist oder ohne Frist) */
  refundable: boolean;
  /** ISO timestamptz aus registrations.cancellation_deadline, null = keine Frist */
  deadline: string | null;
  /** Was bei Selbstabmeldung erstattet würde bzw. verfiele */
  amountCents: number;
};

/**
 * Online bezahlte Buchung: was passiert bei Selbstabmeldung.
 * Gleiche Regel wie der Trigger registrations_request_online_refund:
 * erstattet wird bei cancellation_deadline IS NULL oder jetzt < Frist.
 */
export function onlineRefundInfo(
  registration: { cancellation_deadline?: string | null },
  state: RegistrationRefundState | null | undefined,
  now: number = Date.now(),
): OnlineRefundInfo | null {
  if (!state || state.payment_cents <= 0 || state.refundable_cents <= 0) return null;
  const deadline = registration.cancellation_deadline || null;
  const ms = deadline ? new Date(deadline).getTime() : Number.NaN;
  const refundable = deadline == null || Number.isNaN(ms) || now < ms;
  return { refundable, deadline, amountCents: state.refundable_cents };
}

/** Text im Abmelde-Dialog (Teilnehmende), online bezahlte Buchung. */
export function unregisterOnlineDialogMessage(info: OnlineRefundInfo): string {
  const amount = formatCents(info.amountCents);
  if (info.refundable) {
    if (!info.deadline) return `Du bekommst ${amount} zurück.`;
    return `Du bekommst ${amount} zurück. Kostenlos abmelden bis ${formatCancellationDeadline(info.deadline)}.`;
  }
  const when = info.deadline ? formatCancellationDeadline(info.deadline) : '';
  return `Die Abmeldefrist ist seit ${when} vorbei. Die ${amount} werden nicht erstattet.`;
}

/** Erfolgstext nach Selbstabmeldung aus refund_cents der RPC-Antwort. */
export function unregisterRefundSuccessMessage(refundCents: number | null | undefined): string {
  if (!refundCents || refundCents <= 0) return 'Abgemeldet.';
  return `Abgemeldet. ${formatCents(refundCents)} werden erstattet – je nach Bank dauert das einige Werktage.`;
}

/** Statuszeile auf Kursdetail / Meine Anmeldungen. */
export function onlinePaidStatusLine(info: OnlineRefundInfo): string {
  if (info.refundable && info.deadline) {
    return `Online bezahlt · kostenlos abmelden bis ${formatCancellationDeadline(info.deadline)}`;
  }
  if (info.refundable) return 'Online bezahlt';
  return 'Online bezahlt · Abmeldefrist vorbei';
}

export type RefundProgressTone = 'pending' | 'done' | 'partial' | 'delayed';

export type RefundProgress = { text: string; tone: RefundProgressTone };

/** Erstattungsstand einer abgemeldeten/abgesagten Buchung (R9). */
export function refundProgress(
  state: RegistrationRefundState | null | undefined,
): RefundProgress | null {
  if (!state || state.payment_cents <= 0) return null;
  if (state.pending_cents > 0) {
    return { text: `Erstattung läuft · ${formatCents(state.pending_cents)}`, tone: 'pending' };
  }
  if (state.failed) {
    return { text: 'Erstattung verzögert sich – das Studio ist informiert.', tone: 'delayed' };
  }
  if (state.refunded_cents >= state.payment_cents) {
    return { text: `Erstattet · ${formatCents(state.payment_cents)}`, tone: 'done' };
  }
  if (state.refunded_cents > 0) {
    return {
      text: `Teilweise erstattet · ${formatCents(state.refunded_cents)} von ${formatCents(state.payment_cents)}`,
      tone: 'partial',
    };
  }
  return null;
}

/**
 * Stornierte Buchung in „Meine Anmeldungen“:
 * sichtbar bis Kursende, zusätzlich danach solange Erstattung läuft oder fehlgeschlagen ist.
 */
export function isCancelledEnrollmentVisible(
  course: { date?: string | null; time?: string | null; end_time?: string | null } | null | undefined,
  state: RegistrationRefundState | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!course) return false;
  if (!hasCourseEnded(course, now)) return true;
  if (!state || state.payment_cents <= 0) return false;
  return state.pending_cents > 0 || state.failed;
}

/** Zusammenfassung im Erstatten-Dialog (Owner/Admin). */
export function refundSummary(
  firstName: string,
  amountCents: number,
  refundableCents: number,
): string {
  const who = firstName.trim() || 'die Person';
  const rest = Math.max(refundableCents - amountCents, 0);
  return `${formatCents(amountCents)} an ${who} erstatten. Danach noch erstattbar: ${formatCents(rest)}. Stripe erstattet seine Gebühr für die Zahlung nicht.`;
}

/** Vorbelegung des Betragsfelds: 2400 → „24,00“. */
export function centsToRefundInput(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return '';
  const whole = Math.trunc(cents / 100);
  return `${whole},${String(Math.abs(cents % 100)).padStart(2, '0')}`;
}

/** Eingabe „10,00“ / „10“ / „10,5“ → Cent, sonst null. */
export function refundInputToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace('€', '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export const REFUND_NOTE_MAX = 200;

/** Prüfung vor dem Absenden; null = in Ordnung. */
export function refundFormError(
  input: string,
  note: string,
  refundableCents: number,
): string | null {
  const cents = refundInputToCents(input);
  if (cents == null) return 'Gib einen Betrag wie 10,00 ein.';
  if (cents > refundableCents) {
    return `Höchstens ${formatCents(refundableCents)} sind noch erstattbar.`;
  }
  if (!note.trim()) return 'Bitte gib einen Grund an.';
  if (note.trim().length > REFUND_NOTE_MAX) return 'Der Grund darf höchstens 200 Zeichen haben.';
  return null;
}

export function refundErrorMessage(code: string | null | undefined, remainingCents?: number): string {
  switch (code) {
    case 'AMOUNT_EXCEEDS_REMAINING':
      return remainingCents != null
        ? `Der Betrag ist höher als der Rest. Noch erstattbar: ${formatCents(remainingCents)}.`
        : 'Der Betrag ist höher als der noch erstattbare Rest.';
    case 'NOTHING_TO_REFUND':
      return 'Diese Zahlung ist schon vollständig erstattet.';
    case 'FORBIDDEN':
      return 'Erstatten dürfen nur Inhaber und Admins.';
    case 'NOTE_REQUIRED':
      return 'Bitte gib einen Grund an.';
    case 'INVALID_AMOUNT':
      return 'Gib einen Betrag wie 10,00 ein.';
    case 'NOT_FOUND':
      return 'Die Zahlung wurde nicht gefunden.';
    default:
      return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
  }
}

export function refundReasonLabel(reason: string): string {
  switch (reason) {
    case 'course_cancelled':
      return 'Kursabsage';
    case 'self_cancel_in_window':
      return 'Abmeldung';
    case 'staff_unregister':
      return 'Studio';
    case 'member_removed':
      return 'Entfernt';
    case 'late_payment':
      return 'Spätzahlung';
    case 'manual':
      return 'Manuell';
    case 'provider_dashboard':
      return 'Stripe-Dashboard';
    default:
      return reason;
  }
}

export function refundStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'läuft';
    case 'succeeded':
      return 'erstattet';
    case 'failed':
      return 'fehlgeschlagen';
    default:
      return status;
  }
}

export const DISPUTE_OPEN_HINT = 'Rückbuchung offen – bitte im Stripe-Dashboard beantworten';

function countPhrase(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace('%n', String(count));
}

/** Kursabsage-Dialog vorher. */
export function courseCancelRefundLine(paidCount: number, refundCents: number): string | null {
  if (paidCount <= 0 || refundCents <= 0) return null;
  const who = countPhrase(paidCount, '1 Person hat online bezahlt.', '%n haben online bezahlt.');
  return `${who} ${formatCents(refundCents)} werden automatisch erstattet.`;
}

/** Kursabsage nachher (refund_cents der Antwort). */
export function courseCancelRefundDone(refundCents: number | null | undefined): string {
  if (!refundCents || refundCents <= 0) return '';
  return `${formatCents(refundCents)} werden automatisch erstattet.`;
}

/** Studio meldet ab. */
export function staffUnregisterRefundLine(refundCents: number): string | null {
  if (refundCents <= 0) return null;
  return `Die Online-Zahlung über ${formatCents(refundCents)} wird automatisch erstattet.`;
}

/** Person entfernen. */
export function memberRemovalRefundLine(paidCount: number, refundCents: number): string | null {
  if (paidCount <= 0 || refundCents <= 0) return null;
  if (paidCount === 1) {
    return `1 künftige online bezahlte Buchung (${formatCents(refundCents)}) wird erstattet.`;
  }
  return `${paidCount} künftige online bezahlte Buchungen (${formatCents(refundCents)}) werden erstattet.`;
}
