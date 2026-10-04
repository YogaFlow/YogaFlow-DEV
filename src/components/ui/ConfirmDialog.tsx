import React, { useEffect, useState } from 'react';
import ModalBackdrop from './ModalBackdrop';

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
          dot: 'bg-brand',
          button: 'bg-brand text-onBrand active:bg-brandPressed',
        }
      : {
          dot: 'bg-danger',
          button: 'text-danger active:bg-dangerSoft',
        };

  return (
    <ModalBackdrop
      open
      visible={isVisible}
      canDismiss={!loading}
      onDismiss={onCancel}
      variant="dialog"
      panelClassName="max-w-md"
    >
      <div className="p-6">
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
            className="rounded-full px-6 py-2 text-sm font-semibold text-textMuted active:bg-surfaceSunken disabled:opacity-50"
          >
            {dialog.cancelLabel || 'Abbrechen'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-full px-6 py-2 text-sm font-semibold disabled:opacity-50 ${colorClasses.button}`}
          >
            {loading ? 'Bitte warten…' : dialog.confirmLabel || 'Bestätigen'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
};

export default ConfirmDialog;
