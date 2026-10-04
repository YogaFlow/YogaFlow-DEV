import { berlinIsoFromInstant } from './courseDateTime.ts';
import { formatCents, formatNumericDate } from './format.ts';
import {
  paymentKindLabel,
  paymentPersonName,
  paymentPurpose,
  paymentStatusText,
  type StudioPaymentRow,
} from './paymentOverview.ts';

function csvCell(value: string): string {
  const text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildPaymentsListCsv(
  rows: StudioPaymentRow[],
  receiptByPayment: Map<string, string>,
): string {
  const header = [
    'Datum',
    'Name',
    'Zweck',
    'Art',
    'Betrag',
    'Erstattet',
    'Status',
    'Belegnummer',
    'Zahlungs-ID',
  ].join(';');
  const lines = [header];
  for (const row of rows) {
    lines.push(
      [
        csvCell(formatNumericDate(berlinIsoFromInstant(row.paid_at)) || row.paid_at),
        csvCell(paymentPersonName(row)),
        csvCell(paymentPurpose(row)),
        csvCell(paymentKindLabel(row.kind)),
        csvCell(formatCents(row.amount_cents)),
        csvCell(formatCents(row.refunded_cents)),
        csvCell(paymentStatusText(row)),
        csvCell(receiptByPayment.get(row.payment_id) ?? ''),
        csvCell(row.payment_id),
      ].join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function paymentsExportFilename(month: string, studioSlug: string | null): string {
  const slug = studioSlug ?? 'studio';
  const ym = /^\d{4}-\d{2}/.exec(month)?.[0] ?? month.slice(0, 7);
  return `omlify-${slug}-zahlungen-${ym}.csv`;
}
