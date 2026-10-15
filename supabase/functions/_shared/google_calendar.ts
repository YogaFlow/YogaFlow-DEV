/**
 * Google-Kalender TEMPLATE-Link (UX-3 B). Zeiten als Europe/Berlin Wall-Time
 * im Format YYYYMMDDTHHMMSS (ohne Z), ctz=Europe/Berlin.
 */

import { toIcsLocalDateTime } from "./ics.ts";

function addMinutesLocal(date: string, time: string, minutes: number): string | null {
  const start = toIcsLocalDateTime(date, time);
  if (!start) return null;
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(4, 6));
  const d = Number(start.slice(6, 8));
  const h = Number(start.slice(9, 11));
  const min = Number(start.slice(11, 13));
  const local = new Date(y, m - 1, d, h, min + minutes, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}` +
    `T${pad(local.getHours())}${pad(local.getMinutes())}00`
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
  const start = toIcsLocalDateTime(input.date, input.startTime);
  if (!start) return null;
  let end = input.endTime ? toIcsLocalDateTime(input.date, input.endTime) : null;
  if (!end) end = addMinutesLocal(input.date, input.startTime, 60);
  if (!end) return null;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);
  url.searchParams.set("dates", `${start}/${end}`);
  url.searchParams.set("ctz", "Europe/Berlin");
  if (input.location?.trim()) url.searchParams.set("location", input.location.trim());
  if (input.details?.trim()) url.searchParams.set("details", input.details.trim());
  return url.toString();
}
