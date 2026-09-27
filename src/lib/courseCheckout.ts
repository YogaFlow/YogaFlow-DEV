import type { CoverageStatus, PaymentMethod, WaivedReason } from '../types';
import { berlinIsoDate } from './courseDateTime';

export { berlinIsoDate };

export const CASH_HINT =
  'Omlify vermerkt nur, wer bezahlt hat. Deine Kasse bzw. dein Kassenbuch führst du wie bisher selbst.';

export const WAIVE_NOTE_HINT = 'Die Notiz sieht auch die Kursleitung.';

export const WAIVE_REASONS: { value: WaivedReason; label: string }[] = [
  { value: 'pre_omlify', label: 'Schon vor Omlify bezahlt' },
  { value: 'goodwill', label: 'Kulanz' },
  { value: 'other', label: 'Sonstiges' },
];

export type ManualCheckoutMethod = 'cash' | 'paypal_manual' | 'bank_transfer';

export function waiveReasonLabel(reason: WaivedReason | null | undefined): string {
  return WAIVE_REASONS.find((item) => item.value === reason)?.label ?? '';
}

export function methodWord(method: PaymentMethod | ManualCheckoutMethod | null | undefined): string {
  if (method === 'cash') return 'bar';
  if (method === 'paypal_manual') return 'PayPal';
  if (method === 'bank_transfer') return 'Überweisung';
  if (method === 'card') return 'Karte';
  return 'bezahlt';
}

/** Lehrende sehen bei bezahlt nur das Wort. Owner und Admin sehen die Methode. */
export function paidStatusLabel(
  seesMethod: boolean,
  method: PaymentMethod | null | undefined
): string {
  if (!seesMethod) return 'bezahlt';
  if (!method) return 'bezahlt';
  return methodWord(method);
}

export function checkoutErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'NOT_OPEN':
      return 'Schon erledigt. Die Liste wird neu geladen.';
    case 'FORBIDDEN':
      return 'Dafür hast du keine Berechtigung.';
    case 'CANCELLED':
      return 'Diese Anmeldung ist storniert.';
    case 'NOT_REGISTERED':
      return 'Diese Person ist nicht angemeldet.';
    case 'NOTE_REQUIRED':
      return 'Bitte eine Notiz mit mindestens 3 Zeichen.';
    case 'INVALID_AMOUNT':
      return 'Der Betrag muss größer als 0 € sein.';
    case 'ALREADY_REVERSED':
      return 'Das ist schon rückgängig gemacht.';
    case 'INVALID_METHOD':
      return 'Diese Zahlungsart geht hier nicht.';
    case 'NOT_FOUND':
      return 'Diese Buchung gibt es hier nicht.';
    case 'INVALID_REASON':
      return 'Bitte einen Grund wählen.';
    case 'NOT_WAIVED':
      return 'Das ist kein Erlass mehr. Die Liste wird neu geladen.';
    default:
      return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
  }
}

/** Euro-Text aus dem Dialog → Cent. Komma oder Punkt, höchstens zwei Nachkommastellen. */
export function eurosToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace('€', '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function centsToEuroInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return '';
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100);
  if (frac === 0) return String(whole);
  return `${whole},${String(frac).padStart(2, '0')}`;
}

export type CheckoutSortRow = {
  coverage: CoverageStatus | undefined;
  lastName: string;
  firstName: string;
};

export function compareCheckoutRows(a: CheckoutSortRow, b: CheckoutSortRow): number {
  const aOpen = (a.coverage ?? 'open') === 'open' ? 0 : 1;
  const bOpen = (b.coverage ?? 'open') === 'open' ? 0 : 1;
  if (aOpen !== bOpen) return aOpen - bOpen;
  const byLast = a.lastName.localeCompare(b.lastName, 'de');
  if (byLast !== 0) return byLast;
  return a.firstName.localeCompare(b.firstName, 'de');
}

export function countCheckout(rows: { coverage: CoverageStatus | undefined }[]): {
  open: number;
  done: number;
} {
  let open = 0;
  for (const row of rows) {
    if ((row.coverage ?? 'open') === 'open') open += 1;
  }
  return { open, done: rows.length - open };
}

/** Notiz nur, wenn der Betrag vom eingefrorenen Buchungspreis abweicht. */
export function amountNoteRequired(
  cents: number | null,
  priceCents: number | null | undefined
): boolean {
  if (cents == null) return false;
  return cents !== priceCents;
}

export function checkoutDayWord(date: string, now = new Date()): 'heute' | 'gestern' | '' {
  if (date === berlinIsoDate(0, now)) return 'heute';
  if (date === berlinIsoDate(-1, now)) return 'gestern';
  return '';
}

type PaymentLike = {
  id: string;
  registration_id: string | null;
  amount_cents: number;
  reverses_payment_id: string | null;
  received_at: string;
  method: PaymentMethod;
};

/** Letzte positive Zahlung ohne Gegenzeile, je Buchung. */
export function latestUnreversedPayment<T extends PaymentLike>(payments: T[]): Map<string, T> {
  const reversed = new Set(
    payments
      .map((payment) => payment.reverses_payment_id)
      .filter((id): id is string => Boolean(id))
  );
  const best = new Map<string, T>();
  for (const payment of payments) {
    if (payment.amount_cents <= 0 || payment.reverses_payment_id) continue;
    if (reversed.has(payment.id) || !payment.registration_id) continue;
    const current = best.get(payment.registration_id);
    if (!current || payment.received_at > current.received_at) {
      best.set(payment.registration_id, payment);
    }
  }
  return best;
}
