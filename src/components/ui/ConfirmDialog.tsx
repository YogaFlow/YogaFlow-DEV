import React, { useEffect, useState } from 'react';

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmDialogProps {
  dialog: ConfirmDialogState | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  dialog,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (dialog) {
      setIsMounted(true);
      const frameId = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [dialog]);

  if (!isMounted || !dialog) return null;

  const variant = dialog.variant || 'danger';
  const colorClasses =
    variant === 'primary'
      ? {
          dot: 'bg-sage-500',
          button: 'bg-brand text-onBrand hover:bg-brandPressed',
        }
      : {
          dot: 'bg-danger',
          button: 'text-danger hover:bg-dangerSoft',
        };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isVisible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={loading ? undefined : onCancel}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-2xl transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${colorClasses.dot}`} aria-hidden />
          <h3 className="text-lg font-semibold text-text">{dialog.title}</h3>
        </div>
        <p className="text-sm leading-6 text-textMuted">{dialog.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-full px-6 py-2 text-sm font-semibold text-textMuted transition-colors hover:bg-surfaceSunken disabled:opacity-50"
          >
            {dialog.cancelLabel || 'Abbrechen'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${colorClasses.button}`}
          >
            {loading ? 'Bitte warten…' : dialog.confirmLabel || 'Bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
