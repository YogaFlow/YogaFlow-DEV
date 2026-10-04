/** Pure toast helpers (UX-3 A / UX-4 A2 / ZW-1 N2) — unit-testable without DOM. */

export type ToastTone = 'success' | 'error' | 'info';

export type ToastUndo = {
  label: string;
  onAction: () => void | Promise<void>;
};

export type ToastInput = {
  title?: string;
  message: string;
  type?: ToastTone;
  /** Success auto-hide; errors ignore this and stay until dismiss. */
  durationMs?: number;
  undo?: ToastUndo;
  /** Only for success when undo is set (story: 6 s base). */
  undoDurationMs?: number;
};

/** Kurze Bestätigung ohne Rückgängig — kein Zeitbalken. */
export const TOAST_SUCCESS_MS = 3000;
/** Bestätigung mit Rückgängig — mit Zeitbalken. */
export const TOAST_UNDO_MS = 6000;
export const TOAST_ENTER_MS = 200;
/** Längerer Text (> 60 Zeichen) verlängert die Dauer. */
export const TOAST_LONG_TEXT_CHARS = 60;
export const TOAST_LONG_TEXT_EXTRA_MS = 1000;

export function toastRole(type: ToastTone): 'status' | 'alert' {
  return type === 'error' ? 'alert' : 'status';
}

export function toastAutoDismissMs(
  type: ToastTone,
  durationMs?: number,
  hasUndo?: boolean,
  textLength?: number,
): number | null {
  if (type === 'error') return null;
  const base = durationMs ?? (hasUndo ? TOAST_UNDO_MS : TOAST_SUCCESS_MS);
  const long =
    (textLength ?? 0) > TOAST_LONG_TEXT_CHARS ? TOAST_LONG_TEXT_EXTRA_MS : 0;
  return base + long;
}

/**
 * Eine kurze Zeile: Nachricht bevorzugen, sonst Titel.
 * Kein „Titel — Nachricht“ mehr (UX-4 A2).
 */
export function toastDisplayText(input: Pick<ToastInput, 'title' | 'message'>): string {
  const title = input.title?.trim() ?? '';
  const message = input.message.trim();
  if (message) return message;
  return title;
}

/** Wann „Rückgängig“ gezeigt werden darf: nur vollständig umkehrbar, ohne Erstattung. */
export function toastUndoAllowed(opts: {
  refundCents?: number | null;
  wasPaidOnline?: boolean;
}): boolean {
  const refund = opts.refundCents ?? 0;
  return refund === 0 && !opts.wasPaidOnline;
}
