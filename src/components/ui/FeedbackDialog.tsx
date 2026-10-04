import React, { useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import type { ToastUndo } from '../../lib/toastModel';

export interface FeedbackDialogState {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  undo?: ToastUndo;
  /** Override auto-hide (success/info). */
  durationMs?: number;
}

interface FeedbackDialogProps {
  dialog: FeedbackDialogState | null;
  onClose: () => void;
}

/**
 * Kompatibilitätsschicht: frühere Erfolgs-/Fehlerdialoge werden als Toast gezeigt
 * (UX-3 A). Kein blockierendes OK mehr.
 */
const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ dialog, onClose }) => {
  const { showToast } = useToast();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!dialog) {
      lastKey.current = null;
      return;
    }
    const key = `${dialog.type ?? 'info'}|${dialog.title}|${dialog.message}|${dialog.undo?.label ?? ''}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    const type = dialog.type === 'error' ? 'error' : dialog.type === 'info' ? 'info' : 'success';

    if (type === 'error') {
      showToast({
        title: dialog.title,
        message: dialog.message,
        type: 'error',
      });
      // Parent-State freigeben; Fehler-Toast bleibt bis Schließen sichtbar.
      onClose();
      return;
    }

    showToast({
      title: dialog.title,
      message: dialog.message,
      type,
      undo: dialog.undo,
      durationMs: dialog.durationMs,
    });
    onClose();
  }, [dialog, onClose, showToast]);

  return null;
};

export default FeedbackDialog;
