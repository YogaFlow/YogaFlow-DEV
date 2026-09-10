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

/** 18 € / 18,50 € (narrow no-break space before €) */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded % 1) < 1e-9) {
    return `${Math.round(rounded)}${NBSP}€`;
  }
  return `${rounded.toFixed(2).replace('.', ',')}${NBSP}€`;
}
