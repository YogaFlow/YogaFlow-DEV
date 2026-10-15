/**
 * Abmeldefrist-Texte (Spiegel zu src/lib/cancellationDeadline.ts).
 * Datum: „Do, 8. Okt, 15:45“ (Europe/Berlin).
 */

export const CANCEL_DEADLINE_EXPIRED = "Die kostenlose Abmeldefrist ist abgelaufen.";

export function formatFriendlyCancellationDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const weekday = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  })
    .format(date)
    .replace(/\.$/, "");

  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
  }).format(date);

  const month = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    month: "short",
  })
    .format(date)
    .replace(/\.$/, "");

  const time = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${weekday}, ${day}. ${month}, ${time}`;
}

export function cancellationDeadlineLine(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!deadlineIso) return CANCEL_DEADLINE_EXPIRED;
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms) || ms <= now.getTime()) return CANCEL_DEADLINE_EXPIRED;
  return `Kostenlos abmelden bis ${formatFriendlyCancellationDeadline(deadlineIso)}`;
}
