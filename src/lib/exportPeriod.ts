/** Zeitraum-Logik für Zahlungs-Export (UX-3 C2). */

export type ExportPeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'custom';

export type YearMonth = { year: number; month: number };

export function parseYearMonth(value: string): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function shiftYearMonth(ym: YearMonth, deltaMonths: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + deltaMonths;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return { year, month };
}

/** Berlin civil „heute“ aus Date (Tests können fixed Date übergeben). */
export function berlinYearMonth(now = new Date()): YearMonth {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, month };
}

export function monthBoundsFromYm(ym: YearMonth): { from: string; to: string } {
  const last = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const mm = String(ym.month).padStart(2, '0');
  return {
    from: `${ym.year}-${mm}-01`,
    to: `${ym.year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

export function yearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function resolveExportRange(input: {
  preset: ExportPeriodPreset;
  /** für this/last month und custom-from */
  month: YearMonth;
  /** nur custom */
  monthTo?: YearMonth;
  now?: Date;
}): { from: string; to: string; labelMonth?: string } {
  const now = input.now ?? new Date();
  const current = berlinYearMonth(now);

  if (input.preset === 'this_month') {
    const bounds = monthBoundsFromYm(current);
    return { ...bounds, labelMonth: formatYearMonth(current) };
  }
  if (input.preset === 'last_month') {
    const last = shiftYearMonth(current, -1);
    const bounds = monthBoundsFromYm(last);
    return { ...bounds, labelMonth: formatYearMonth(last) };
  }
  if (input.preset === 'this_year') {
    return yearBounds(current.year);
  }

  const fromYm = input.month;
  const toYm = input.monthTo ?? input.month;
  const from = monthBoundsFromYm(fromYm).from;
  const to = monthBoundsFromYm(toYm).to;
  if (from > to) {
    return { from: monthBoundsFromYm(toYm).from, to: monthBoundsFromYm(fromYm).to };
  }
  return { from, to };
}

const MONTH_NAMES_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

export function formatMonthLabel(ym: YearMonth): string {
  return `${MONTH_NAMES_DE[ym.month - 1]} ${ym.year}`;
}

export function exportPreviewLabel(count: number | null): string {
  if (count == null) return 'Zahlungen werden gezählt…';
  if (count === 1) return '1 Zahlung im Zeitraum';
  return `${count} Zahlungen im Zeitraum`;
}
