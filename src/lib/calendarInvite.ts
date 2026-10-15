/**
 * Kalender-Einladung (UX-4 C1): Geräte-Reihenfolge, Google-Link, einfache ICS.
 */

export type CalendarDevice = 'ios' | 'android' | 'desktop';

export type CalendarActionId = 'apple' | 'google' | 'ics' | 'outlook';

export type CalendarAction = {
  id: CalendarActionId;
  label: string;
  primary: boolean;
};

export function detectCalendarDevice(userAgent: string): CalendarDevice {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Reihenfolge der Knöpfe; alle Wege bleiben sichtbar. */
export function calendarActionsForDevice(device: CalendarDevice): CalendarAction[] {
  if (device === 'ios') {
    return [
      { id: 'apple', label: 'Apple Kalender', primary: true },
      { id: 'google', label: 'Google Kalender', primary: false },
    ];
  }
  if (device === 'android') {
    return [
      { id: 'google', label: 'Google Kalender', primary: true },
      { id: 'ics', label: 'Andere Kalender (.ics)', primary: false },
    ];
  }
  return [
    { id: 'outlook', label: 'Outlook / Apple (.ics)', primary: true },
    { id: 'google', label: 'Google Kalender', primary: true },
  ];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIcsLocal(date: string, time: string): string | null {
  const ymd = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const hm = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!ymd || !hm) return null;
  return `${ymd[1]}${ymd[2]}${ymd[3]}T${pad2(Number(hm[1]))}${pad2(Number(hm[2]))}00`;
}

function addMinutesLocal(date: string, time: string, minutes: number): string | null {
  const start = toIcsLocal(date, time);
  if (!start) return null;
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(4, 6));
  const d = Number(start.slice(6, 8));
  const h = Number(start.slice(9, 11));
  const min = Number(start.slice(11, 13));
  const local = new Date(y, m - 1, d, h, min + minutes, 0);
  return (
    `${local.getFullYear()}${pad2(local.getMonth() + 1)}${pad2(local.getDate())}` +
    `T${pad2(local.getHours())}${pad2(local.getMinutes())}00`
  );
}

export function buildGoogleCalendarUrl(input: {
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  details?: string | null;
}): string | null {
  const start = toIcsLocal(input.date, input.startTime);
  if (!start) return null;
  let end = input.endTime ? toIcsLocal(input.date, input.endTime) : null;
  if (!end) end = addMinutesLocal(input.date, input.startTime, 60);
  if (!end) return null;
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', input.title);
  url.searchParams.set('dates', `${start}/${end}`);
  url.searchParams.set('ctz', 'Europe/Berlin');
  if (input.location?.trim()) url.searchParams.set('location', input.location.trim());
  if (input.details?.trim()) url.searchParams.set('details', input.details.trim());
  return url.toString();
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Minimale ICS für Client-Download (eingeloggt via rid). */
export function buildSimpleIcs(input: {
  uid: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
}): string {
  const start = toIcsLocal(input.date, input.startTime) ?? '';
  let end = input.endTime ? toIcsLocal(input.date, input.endTime) : null;
  if (!end) end = addMinutesLocal(input.date, input.startTime, 60) ?? start;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Omlify//Calendar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@omlify`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Berlin:${start}`,
    `DTEND;TZID=Europe/Berlin:${end}`,
    `SUMMARY:${icsEscape(input.title)}`,
  ];
  if (input.location?.trim()) lines.push(`LOCATION:${icsEscape(input.location.trim())}`);
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${icsEscape(input.description.trim())}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcsBlob(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export type CalendarMeta = {
  title: string;
  date: string;
  time: string;
  dateLabel: string;
  timeLabel: string;
  place: string | null;
  studioName: string;
  brandColor: string | null;
  googleUrl: string | null;
  icsUrl: string | null;
  icsInlineUrl: string | null;
  /** Für Client-ICS wenn kein Token */
  registrationId?: string;
  endTime?: string | null;
};
