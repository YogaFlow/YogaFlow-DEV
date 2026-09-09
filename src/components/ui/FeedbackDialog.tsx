import React, { useEffect, useState } from 'react';

export interface FeedbackDialogState {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface FeedbackDialogProps {
  dialog: FeedbackDialogState | null;
  onClose: () => void;
}

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ dialog, onClose }) => {
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

  const variant = dialog.type || 'info';
  const colorClasses =
    variant === 'success'
      ? {
          dot: 'bg-sage-500',
          button: 'bg-brand hover:bg-brandPressed',
        }
      : variant === 'error'
        ? {
            dot: 'bg-danger',
            button: 'bg-danger hover:bg-danger',
          }
        : {
            dot: 'bg-sage-500',
            button: 'bg-sage-500 hover:bg-brandPressed',
          };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isVisible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-2xl transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${colorClasses.dot}`} aria-hidden />
          <h3 className="text-lg font-semibold text-text">{dialog.title}</h3>
        </div>
        <p className="text-sm leading-6 text-textMuted">{dialog.message}</p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className={`rounded-full px-6 py-2 text-sm font-semibold text-white transition-colors ${colorClasses.button}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackDialog;
