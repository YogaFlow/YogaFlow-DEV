/** Display formatting for German UI. No timezone conversion on date/time strings. */

const NBSP = '\u00A0';
const LOCALE = 'de-DE';
const TIMEZONE = 'Europe/Berlin';

type CivilDate = { y: number; m: number; d: number };

function parseCivilDate(value: string): CivilDate | null {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Local midnight for a civil calendar date — not a UTC parse of YYYY-MM-DD. */
function civilToLocalDate({ y, m, d }: CivilDate): Date {
  return new Date(y, m - 1, d);
}

function berlinTodayParts(): CivilDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function addDays(parts: CivilDate, days: number): CivilDate {
  const dt = new Date(parts.y, parts.m - 1, parts.d + days);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function sameDay(a: CivilDate, b: CivilDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function stripTrailingDot(value: string): string {
  return value.replace(/\.$/, '');
}

/** HH:mm — never seconds. Accepts "16:15:00" / "16:15" without Date parsing. */
export function formatTime(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value).trim();
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** 18:30 – 19:30 (en dash with spaces) */
export function formatTimeRange(
  start: string | null | undefined,
  end?: string | null | undefined
): string {
  const from = formatTime(start);
  if (!from) return '';
  const to = formatTime(end);
  return to ? `${from} – ${to}` : from;
}

/** Do, 18. Sep — with year when not the current Berlin calendar year. */
export function formatDate(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const parts = parseCivilDate(value);
  if (!parts) return String(value);
  const date = civilToLocalDate(parts);
  const weekday = stripTrailingDot(
    new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(date)
  );
  const month = stripTrailingDot(
    new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(date)
  );
  const today = berlinTodayParts();
  if (parts.y !== today.y) {
    return `${weekday}, ${parts.d}. ${month} ${parts.y}`;
  }
  return `${weekday}, ${parts.d}. ${month}`;
}

/** Heute / Morgen / Donnerstag, 18. September */
export function formatDayLabel(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const parts = parseCivilDate(value);
  if (!parts) return String(value);
  const today = berlinTodayParts();
  if (sameDay(parts, today)) return 'Heute';
  if (sameDay(parts, addDays(today, 1))) return 'Morgen';
  const date = civilToLocalDate(parts);
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(date);
  return `${weekday}, ${parts.d}. ${month}`;
}

/** Heute / Morgen, otherwise empty — same near-day logic as formatDayLabel. */
export function formatTodayOrTomorrow(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const parts = parseCivilDate(value);
  if (!parts) return '';
  const today = berlinTodayParts();
  if (sameDay(parts, today)) return 'Heute';
  if (sameDay(parts, addDays(today, 1))) return 'Morgen';
  return '';
}

/** Compact date-block parts: Do / 7 / Sep (or Jan 27 if not the current Berlin year). */
export function formatDateBlock(
  value: string | null | undefined
): { weekday: string; day: string; month: string } | null {
  if (value == null || value === '') return null;
  const parts = parseCivilDate(value);
  if (!parts) return null;
  const date = civilToLocalDate(parts);
  const weekday = stripTrailingDot(
    new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(date)
  );
  const monthName = stripTrailingDot(
    new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(date)
  );
  const today = berlinTodayParts();
  const month =
    parts.y !== today.y ? `${monthName} ${String(parts.y).slice(-2)}` : monthName;
  return { weekday, day: String(parts.d), month };
}

export function formatDuration(minutes: number): string {
  return `${minutes} Min`;
}

/**
 * timestamptz → Berlin wall-clock display.
 * Example: Do, 18. Sep, 18:30
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const time = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${formatDate(isoDate)}, ${time}`;
}

/** 01.09.2026 — civil date, no timezone shift. */
export function formatNumericDate(value: string | null | undefined): string {
  const parts = parseCivilDate(value ?? '');
  if (!parts) return '';
  const day = String(parts.d).padStart(2, '0');
  const month = String(parts.m).padStart(2, '0');
  return `${day}.${month}.${parts.y}`;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** Oktober 2026 — civil date, day ignored. */
export function formatMonthYear(value: string | null | undefined): string {
  const parts = parseCivilDate(value ?? '');
  if (!parts) return '';
  return `${MONTH_NAMES[parts.m - 1]} ${parts.y}`;
}

/** First day of the month, `months` before the civil date (0 = same month). */
export function monthStartIso(value: string, monthsBack = 0): string {
  const parts = parseCivilDate(value);
  if (!parts) return '';
  const index = parts.y * 12 + (parts.m - 1) - monthsBack;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Shift a YYYY-MM-DD civil date by whole days. */
export function shiftIsoDate(value: string, days: number): string {
  const parts = parseCivilDate(value);
  if (!parts) return '';
  const next = addDays(parts, days);
  const month = String(next.m).padStart(2, '0');
  const day = String(next.d).padStart(2, '0');
  return `${next.y}-${month}-${day}`;
}

export { asCivilIsoDate, berlinIsoFromInstant, clampCivilIsoDate } from './courseDateTime.ts';

/** 18 € / 18,50 € (narrow no-break space before €) */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded % 1) < 1e-9) {
    return `${Math.round(rounded)}${NBSP}€`;
  }
  return `${rounded.toFixed(2).replace('.', ',')}${NBSP}€`;
}

/** Always two decimals from integer cents — e.g. 15000 → 150,00 € */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '−' : '';
  const abs = Math.abs(rounded);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest}${NBSP}€`;
}
