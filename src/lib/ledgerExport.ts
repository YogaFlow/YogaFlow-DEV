import { asCivilIsoDate } from './courseDateTime';
import { formatNumericDate } from './format';
import { supabase } from './supabase';

export const LEDGER_EXPORT_FOOTNOTE =
  'Der Export enthält nur Zahlungen, die in Omlify vermerkt wurden. Er ersetzt kein Kassenbuch.';

export const LEDGER_RANGE_MAX_DAYS = 366;

const INVALID_RANGE_MESSAGE = 'Bitte wähle einen gültigen Zeitraum.';
const RANGE_TOO_LARGE_MESSAGE = 'Der Zeitraum darf höchstens 366 Tage lang sein.';

const ACCOUNT_ORDER = [
  'cash',
  'bank',
  'paypal_clearing',
  'psp_clearing',
  'revenue_standard',
  'revenue_small_business',
  'vat_output',
] as const;

const ACCOUNT_LABEL: Record<string, string> = {
  cash: 'Bar',
  bank: 'Bank',
  paypal_clearing: 'PayPal',
  psp_clearing: 'Verrechnung Stripe',
  revenue_standard: 'Umsatz (regelbesteuert)',
  revenue_small_business: 'Umsatz (Kleinunternehmer)',
  vat_output: 'Umsatzsteuer',
};

export type LedgerExportRow = {
  booking_date: string;
  event_id: string;
  payment_id: string;
  account: string;
  debit_cents: number;
  credit_cents: number;
  sale_kind: string;
  tax_regime: string;
  vat_rate_bp: number;
  method: string | null;
  receipt_number?: string;
};

export type LedgerExportResult =
  | { ok: true; rows: LedgerExportRow[] }
  | { ok: false; message: string };

function inclusiveDays(fromIso: string, toIso: string): number | null {
  const from = asCivilIsoDate(fromIso);
  const to = asCivilIsoDate(toIso);
  if (!from || !to) return null;
  const fromParts = from.split('-').map(Number);
  const toParts = to.split('-').map(Number);
  const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.round((toUtc - fromUtc) / 86_400_000) + 1;
}

/** Last calendar day of YYYY-MM without local-timezone day shifts. */
export function monthBounds(yearMonth: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

function exportErrorMessage(error: { message?: string; code?: string } | null): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (text.includes('INVALID_RANGE')) return INVALID_RANGE_MESSAGE;
  if (text.includes('RANGE_TOO_LARGE')) return RANGE_TOO_LARGE_MESSAGE;
  if (text.includes('FORBIDDEN')) return 'Dafür hast du keine Berechtigung.';
  return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
}

export async function fetchLedgerExport(from: string, to: string): Promise<LedgerExportResult> {
  const fromCivil = asCivilIsoDate(from);
  const toCivil = asCivilIsoDate(to);
  const span = inclusiveDays(fromCivil, toCivil);
  if (span == null || span < 1) {
    return { ok: false, message: INVALID_RANGE_MESSAGE };
  }
  if (span > LEDGER_RANGE_MAX_DAYS) {
    return { ok: false, message: RANGE_TOO_LARGE_MESSAGE };
  }
  const { data, error } = await supabase.rpc('export_ledger', {
    p_from: fromCivil,
    p_to: toCivil,
  });
  if (error) return { ok: false, message: exportErrorMessage(error) };
  const rows = (data ?? []) as LedgerExportRow[];
  const paymentIds = [...new Set(rows.map((row) => row.payment_id).filter(Boolean))];
  if (paymentIds.length > 0) {
    const { data: receipts } = await supabase
      .from('receipts')
      .select('payment_id, number')
      .eq('kind', 'receipt')
      .in('payment_id', paymentIds);
    const byPayment = new Map(
      (receipts ?? []).map((row) => [String(row.payment_id), String(row.number)]),
    );
    for (const row of rows) {
      row.receipt_number = byPayment.get(row.payment_id) ?? '';
    }
  }
  return { ok: true, rows };
}

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Euro with comma and two decimals, no currency sign. Negative with ASCII minus. */
export function formatCsvCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest}`;
}

function accountLabel(account: string): string {
  return ACCOUNT_LABEL[account] ?? account;
}

function saleLabel(saleKind: string): string {
  if (saleKind === 'course') return 'Kurs';
  if (saleKind === 'pass') return 'Mehrfachkarte';
  return saleKind;
}

function methodLabel(method: string | null): string {
  if (method === 'cash') return 'Bar';
  if (method === 'bank_transfer') return 'Überweisung';
  if (method === 'paypal_manual') return 'PayPal';
  if (method === 'card') return 'Kreditkarte';
  return method ?? '';
}

function taxLabel(regime: string, vatRateBp: number): string {
  if (regime === 'small_business') return 'Kleinunternehmer';
  if (vatRateBp === 1900) return '19 %';
  if (vatRateBp === 700) return '7 %';
  return '';
}

export function buildLedgerLinesCsv(rows: LedgerExportRow[]): string {
  const header = [
    'Datum',
    'Konto',
    'Soll',
    'Haben',
    'Art',
    'Zahlart',
    'Steuer',
    'Buchungs-ID',
    'Zahlungs-ID',
    'Belegnummer',
  ];
  const lines = [header.join(';')];
  for (const row of rows) {
    lines.push(
      [
        csvCell(formatNumericDate(asCivilIsoDate(String(row.booking_date)))),
        csvCell(accountLabel(row.account)),
        formatCsvCents(row.debit_cents),
        formatCsvCents(row.credit_cents),
        csvCell(saleLabel(row.sale_kind)),
        csvCell(methodLabel(row.method)),
        csvCell(taxLabel(row.tax_regime, row.vat_rate_bp)),
        csvCell(row.event_id),
        csvCell(row.payment_id),
        csvCell(row.receipt_number ?? ''),
      ].join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function buildLedgerSumsCsv(rows: LedgerExportRow[]): string {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    const current = totals.get(row.account) ?? { debit: 0, credit: 0 };
    current.debit += row.debit_cents;
    current.credit += row.credit_cents;
    totals.set(row.account, current);
  }
  const ordered = [
    ...ACCOUNT_ORDER.filter((account) => totals.has(account)),
    ...[...totals.keys()].filter((account) => !ACCOUNT_ORDER.includes(account as (typeof ACCOUNT_ORDER)[number])),
  ];
  const lines = [['Konto', 'Soll', 'Haben', 'Saldo'].join(';')];
  for (const account of ordered) {
    const sum = totals.get(account);
    if (!sum) continue;
    lines.push(
      [
        csvCell(accountLabel(account)),
        formatCsvCents(sum.debit),
        formatCsvCents(sum.credit),
        formatCsvCents(sum.debit - sum.credit),
      ].join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function downloadCsv(filename: string, body: string) {
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadLedgerCsv(stem: string, rows: LedgerExportRow[]) {
  downloadCsv(`${stem}.csv`, buildLedgerLinesCsv(rows));
  window.setTimeout(() => {
    downloadCsv(`${stem}-summen.csv`, buildLedgerSumsCsv(rows));
  }, 250);
}
