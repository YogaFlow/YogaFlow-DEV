/**
 * Abmeldefrist-Texte — eine Quelle für Buchungskarte, Checkout und Mail-Spiegelung.
 * Datum: „Do, 8. Okt, 15:45“ (Europe/Berlin).
 */
export const CANCEL_DEADLINE_EXPIRED = 'Die kostenlose Abmeldefrist ist abgelaufen.';

function formatPriceCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${euros},${rest} €`;
}

/**
 * L12 — Hinweis im Abmelde-Dialog bei Vor-Ort-Buchung nach der Frist.
 * Vor der Frist: null (kein Hinweis).
 */
export function onsiteLateCancelHint(input: {
  studioName: string;
  deadlineIso: string | null | undefined;
  priceCents: number;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (!input.deadlineIso) return null;
  const ms = new Date(input.deadlineIso).getTime();
  if (!Number.isFinite(ms) || ms > now.getTime()) return null;
  if (!Number.isFinite(input.priceCents) || input.priceCents < 0) return null;
  const studio = input.studioName.trim() || 'Das Studio';
  const when = formatFriendlyCancellationDeadline(input.deadlineIso);
  return (
    `Die kostenlose Abmeldefrist ist vorbei (bis ${when}). ` +
    `${studio} kann den Kurspreis von ${formatPriceCents(input.priceCents)} trotzdem verlangen.`
  );
}

/** Do, 8. Okt, 15:45 */
export function formatFriendlyCancellationDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const weekday = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
  })
    .format(date)
    .replace(/\.$/, '');

  const day = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
  }).format(date);

  const month = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    month: 'short',
  })
    .format(date)
    .replace(/\.$/, '');

  const time = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${weekday}, ${day}. ${month}, ${time}`;
}

/**
 * Volle Zeile vor/nach Frist.
 * `deadlineIso` null/leer/ungültig/abgelaufen → abgelaufen-Text.
 */
export function cancellationDeadlineLine(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!deadlineIso) return CANCEL_DEADLINE_EXPIRED;
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms) || ms <= now.getTime()) return CANCEL_DEADLINE_EXPIRED;
  return `Kostenlos abmelden bis ${formatFriendlyCancellationDeadline(deadlineIso)}`;
}

/**
 * Vorschau vor Buchung: Kursbeginn (lokale Wandzeit wie courseDateTime) minus Fenster.
 * windowHours 0 → abgelaufen (keine kostenlose Abmeldung).
 */
export function previewCancellationDeadlineIso(
  courseDate: string,
  courseTime: string | null | undefined,
  windowHours: number,
): string | null {
  if (!Number.isFinite(windowHours) || windowHours < 0) return null;
  const [year, month, day] = courseDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  let hours = 0;
  let minutes = 0;
  if (courseTime) {
    const [h, m] = courseTime.split(':').map(Number);
    hours = Number.isFinite(h) ? h : 0;
    minutes = Number.isFinite(m) ? m : 0;
  }
  const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  // 0 h = keine kostenlose Abmeldung → sofort abgelaufen.
  if (windowHours === 0) {
    return new Date(0).toISOString();
  }
  return new Date(start.getTime() - windowHours * 3_600_000).toISOString();
}
