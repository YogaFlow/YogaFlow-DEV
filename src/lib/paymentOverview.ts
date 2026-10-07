import { formatCents, formatDate, formatMonthYear, formatTime, monthStartIso } from './format.ts';

/** Art laut get_studio_payments: Online = Stripe, sonst manuelle Methode. */
export type PaymentKind = 'cash' | 'paypal_manual' | 'bank_transfer' | 'online';

export type PaymentOverviewStatus =
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'refund_pending'
  | 'refund_failed'
  | 'dispute_open'
  | 'canceled';

/** Eine Zeile aus get_studio_payments. */
export type StudioPaymentRow = {
  payment_id: string;
  paid_at: string;
  member_id: string | null;
  first_name: string | null;
  last_name: string | null;
  subject_type: 'registration' | 'pass_purchase';
  course_id: string | null;
  course_title: string | null;
  course_date: string | null;
  course_time: string | null;
  pass_name: string | null;
  kind: PaymentKind;
  amount_cents: number;
  refunded_cents: number;
  status: PaymentOverviewStatus;
};

export type StatusTone = 'neutral' | 'pending' | 'attention' | 'muted';

export const PAYMENTS_PAGE_SIZE = 50;

export const PAYMENT_SUMS_HINT =
  'Summen und Umsatz stehen im Export unter „Exportieren“.';

const KIND_LABELS: Record<PaymentKind, string> = {
  cash: 'Bar',
  paypal_manual: 'PayPal',
  bank_transfer: 'Überweisung',
  online: 'Online',
};

export const PAYMENT_KIND_OPTIONS: Array<{ value: PaymentKind | ''; label: string }> = [
  { value: '', label: 'Alle Arten' },
  { value: 'cash', label: KIND_LABELS.cash },
  { value: 'paypal_manual', label: KIND_LABELS.paypal_manual },
  { value: 'bank_transfer', label: KIND_LABELS.bank_transfer },
  { value: 'online', label: KIND_LABELS.online },
];

const STATUS_LABELS: Record<PaymentOverviewStatus, string> = {
  paid: 'Bezahlt',
  partially_refunded: 'Teilweise erstattet',
  refunded: 'Erstattet',
  refund_pending: 'Erstattung läuft',
  refund_failed: 'Erstattung fehlgeschlagen',
  dispute_open: 'Rückbuchung offen',
  canceled: 'Storniert',
};

export const PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentOverviewStatus | ''; label: string }> = [
  { value: '', label: 'Alle Status' },
  ...(Object.keys(STATUS_LABELS) as PaymentOverviewStatus[]).map((value) => ({
    value,
    label: STATUS_LABELS[value],
  })),
];

export function paymentKindLabel(kind: PaymentKind): string {
  return KIND_LABELS[kind] ?? kind;
}

/** „Teilweise erstattet · 10,00 € von 24,00 €“, sonst das Status-Wort. */
export function paymentStatusText(
  row: Pick<StudioPaymentRow, 'status' | 'amount_cents' | 'refunded_cents'>,
): string {
  if (row.status === 'partially_refunded') {
    return `${STATUS_LABELS.partially_refunded} · ${formatCents(row.refunded_cents)} von ${formatCents(row.amount_cents)}`;
  }
  return STATUS_LABELS[row.status] ?? row.status;
}

export function paymentStatusTone(status: PaymentOverviewStatus): StatusTone {
  switch (status) {
    case 'dispute_open':
    case 'refund_failed':
      return 'attention';
    case 'refund_pending':
      return 'pending';
    case 'refunded':
    case 'canceled':
      return 'muted';
    default:
      return 'neutral';
  }
}

/** Kurs + Termin oder Kartenname. */
export function paymentPurpose(
  row: Pick<StudioPaymentRow, 'subject_type' | 'course_title' | 'course_date' | 'course_time' | 'pass_name'>,
): string {
  if (row.subject_type === 'pass_purchase') return row.pass_name?.trim() || 'Kurskarte';
  const title = row.course_title?.trim() || 'Kurs';
  const when = [formatDate(row.course_date), formatTime(row.course_time)].filter(Boolean).join(', ');
  return when ? `${title} · ${when}` : title;
}

export function paymentPersonName(row: Pick<StudioPaymentRow, 'first_name' | 'last_name'>): string {
  return [row.first_name, row.last_name].map((v) => v?.trim()).filter(Boolean).join(' ') || 'Ohne Namen';
}

/** Monatsauswahl: aktueller Monat zuerst, dann rückwärts. */
export function paymentMonthOptions(todayIso: string, count = 13): Array<{ value: string; label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const value = monthStartIso(todayIso, i);
    return { value, label: formatMonthYear(value) };
  });
}

export function paymentPageLabel(page: number, total: number): string {
  if (total === 0) return '';
  const from = (page - 1) * PAYMENTS_PAGE_SIZE + 1;
  const to = Math.min(page * PAYMENTS_PAGE_SIZE, total);
  return `${from}–${to} von ${total}`;
}

export function paymentEmptyText(filtered: boolean): string {
  return filtered
    ? 'Keine Zahlungen für diese Auswahl.'
    : 'In diesem Monat sind noch keine Zahlungen eingegangen.';
}
