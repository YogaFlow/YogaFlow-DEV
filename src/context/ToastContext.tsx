import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import ToastViewport, { type ToastItem } from '../components/ui/Toast';
import {
  toastAutoDismissMs,
  toastDisplayText,
  type ToastInput,
  type ToastTone,
} from '../lib/toastModel';

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSeq = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
    },
    [clearTimer],
  );

  const showToast = useCallback(
    (input: ToastInput) => {
      const type: ToastTone = input.type ?? 'success';
      const id = `toast-${++toastSeq}`;
      const hasUndo = Boolean(input.undo);
      const durationMs = toastAutoDismissMs(type, input.durationMs, hasUndo);
      const item: ToastItem = {
        id,
        text: toastDisplayText(input),
        type,
        undoLabel: input.undo?.label,
        durationMs,
        createdAt: Date.now(),
        onUndo: input.undo
          ? async () => {
              try {
                await input.undo!.onAction();
              } finally {
                dismissToast(id);
              }
            }
          : undefined,
      };

      setItems((prev) => [...prev, item].slice(-3));

      if (durationMs != null) {
        clearTimer(id);
        timers.current.set(
          id,
          window.setTimeout(() => dismissToast(id), durationMs),
        );
      }
    },
    [clearTimer, dismissToast],
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast muss innerhalb von ToastProvider genutzt werden.');
  }
  return ctx;
}
