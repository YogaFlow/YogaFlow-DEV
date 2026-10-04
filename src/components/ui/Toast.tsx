import React from 'react';
import { X } from 'lucide-react';
import { toastRole, type ToastTone } from '../../lib/toastModel';

export type ToastItem = {
  id: string;
  text: string;
  type: ToastTone;
  undoLabel?: string;
  onUndo?: () => void | Promise<void>;
};

type ToastViewportProps = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
};

/**
 * Toast unten (mobil über der Aktionsleiste / Navigation).
 * Erfolg: role=status, kein OK. Fehler: role=alert, Schließen.
 */
const ToastViewport: React.FC<ToastViewportProps> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-3 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      data-testid="toast-viewport"
    >
      {items.map((item) => {
        const isError = item.type === 'error';
        return (
          <div
            key={item.id}
            role={toastRole(item.type)}
            data-testid={isError ? 'toast-error' : 'toast-success'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border px-3.5 py-3 shadow-lg ${
              isError
                ? 'border-danger bg-dangerSoft text-text'
                : 'border-border bg-surface text-text'
            }`}
          >
            <p className="min-w-0 flex-1 text-[15px] leading-snug">{item.text}</p>
            {item.onUndo && item.undoLabel ? (
              <button
                type="button"
                onClick={() => void item.onUndo?.()}
                className="inline-flex h-11 shrink-0 items-center rounded-full px-3 text-[15px] font-medium text-brand active:text-brandPressed"
                data-testid="toast-undo"
              >
                {item.undoLabel}
              </button>
            ) : null}
            {isError ? (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label="Schließen"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text active:bg-surfaceSunken"
                data-testid="toast-dismiss"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ToastViewport;
