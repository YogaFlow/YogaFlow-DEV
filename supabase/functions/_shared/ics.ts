/**
 * iCalendar (ICS) für Buchungsmails (UX-2 B1).
 * UID = Buchungs-/Anmeldungs-ID; Zeitzone Europe/Berlin.
 * METHOD:CANCEL ist vorbereitet (Absage/Abmeldung später).
 */

export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export type IcsEventInput = {
  /** registrations.id */
  uid: string;
  summary: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm oder HH:mm:ss */
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
  method?: IcsMethod;
  /** ISO timestamptz oder Date */
  dtStamp?: string | Date;
};

const BERLIN_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseHm(time: string): { h: number; m: number } | null {
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const m = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Local Europe/Berlin wall time → ICS local form YYYYMMDDTHHMMSS */
export function toIcsLocalDateTime(date: string, time: string): string | null {
  const ymd = parseYmd(date);
  const hm = parseHm(time);
  if (!ymd || !hm) return null;
  return `${ymd.y}${pad2(ymd.m)}${pad2(ymd.d)}T${pad2(hm.h)}${pad2(hm.m)}00`;
}

function toIcsUtcStamp(value: string | Date | undefined): string {
  const d = value == null
    ? new Date()
    : typeof value === "string"
    ? new Date(value)
    : value;
  const ms = d.getTime();
  const safe = Number.isFinite(ms) ? d : new Date();
  return (
    `${safe.getUTCFullYear()}${pad2(safe.getUTCMonth() + 1)}${pad2(safe.getUTCDate())}` +
    `T${pad2(safe.getUTCHours())}${pad2(safe.getUTCMinutes())}${pad2(safe.getUTCSeconds())}Z`
  );
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function addMinutesToLocal(
  date: string,
  time: string,
  minutes: number,
): string | null {
  const ymd = parseYmd(date);
  const hm = parseHm(time);
  if (!ymd || !hm) return null;
  const local = new Date(ymd.y, ymd.m - 1, ymd.d, hm.h, hm.m + minutes, 0);
  return (
    `${local.getFullYear()}${pad2(local.getMonth() + 1)}${pad2(local.getDate())}` +
    `T${pad2(local.getHours())}${pad2(local.getMinutes())}00`
  );
}

export function buildIcs(input: IcsEventInput): string {
  const method = input.method ?? "REQUEST";
  const dtStart = toIcsLocalDateTime(input.date, input.startTime);
  if (!dtStart) {
    throw new Error("ICS_INVALID_START");
  }
  let dtEnd: string | null = null;
  if (input.endTime) {
    dtEnd = toIcsLocalDateTime(input.date, input.endTime);
  }
  if (!dtEnd) {
    dtEnd = addMinutesToLocal(input.date, input.startTime, 60);
  }
  if (!dtEnd) throw new Error("ICS_INVALID_END");

  const uid = `${input.uid.trim()}@omlify`;
  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Omlify//Buchung//DE",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    BERLIN_VTIMEZONE,
    "BEGIN:VEVENT",
    foldLine(`UID:${uid}`),
    `DTSTAMP:${toIcsUtcStamp(input.dtStamp)}`,
    `DTSTART;TZID=Europe/Berlin:${dtStart}`,
    `DTEND;TZID=Europe/Berlin:${dtEnd}`,
    foldLine(`SUMMARY:${escapeIcsText(input.summary)}`),
  ];
  if (input.location?.trim()) {
    lines.push(foldLine(`LOCATION:${escapeIcsText(input.location.trim())}`));
  }
  if (input.description?.trim()) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(input.description.trim())}`));
  }
  lines.push(`STATUS:${status}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** data:-URI für den Kalender-Knopf in HTML-Mails. */
export function icsDataUri(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

/** Extrahiert DTSTART local aus ICS (für Tests). */
export function parseIcsDtStartLocal(ics: string): string | null {
  const m = ics.match(/DTSTART;TZID=Europe\/Berlin:(\d{8}T\d{6})/);
  return m?.[1] ?? null;
}

export function parseIcsUid(ics: string): string | null {
  const m = ics.match(/^UID:(.+)$/m);
  return m?.[1]?.trim() ?? null;
}
