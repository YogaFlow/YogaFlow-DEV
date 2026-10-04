/** Pure toast helpers (UX-3 A) — unit-testable without DOM. */

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
  /** Only for success when undo is set (story: 5 s window). */
  undoDurationMs?: number;
};

export const TOAST_SUCCESS_MS = 4000;
export const TOAST_UNDO_MS = 5000;

export function toastRole(type: ToastTone): 'status' | 'alert' {
  return type === 'error' ? 'alert' : 'status';
}

export function toastAutoDismissMs(type: ToastTone, durationMs?: number, hasUndo?: boolean): number | null {
  if (type === 'error') return null;
  if (hasUndo) return durationMs ?? TOAST_UNDO_MS;
  return durationMs ?? TOAST_SUCCESS_MS;
}

export function toastDisplayText(input: Pick<ToastInput, 'title' | 'message'>): string {
  const title = input.title?.trim() ?? '';
  const message = input.message.trim();
  if (!title) return message;
  if (!message || title === message) return title;
  return `${title} — ${message}`;
}
