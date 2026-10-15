import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

  const dismissToast = useCallback((id: string) => {
    setItems((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const type: ToastTone = input.type ?? 'success';
      const id = `toast-${++toastSeq}`;
      const hasUndo = Boolean(input.undo);
      const text = toastDisplayText(input);
      const durationMs = toastAutoDismissMs(
        type,
        input.durationMs ?? (hasUndo ? input.undoDurationMs : undefined),
        hasUndo,
        text.length,
      );
      const item: ToastItem = {
        id,
        text,
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
    },
    [dismissToast],
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
