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
          dot: 'bg-teal-500',
          button: 'bg-teal-600 hover:bg-teal-700',
        }
      : variant === 'error'
        ? {
            dot: 'bg-red-500',
            button: 'bg-red-600 hover:bg-red-700',
          }
        : {
            dot: 'bg-blue-500',
            button: 'bg-blue-600 hover:bg-blue-700',
          };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isVisible ? 'bg-slate-900/45 opacity-100' : 'bg-slate-900/0 opacity-0'
      }`}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${colorClasses.dot}`} aria-hidden />
          <h3 className="text-lg font-semibold text-gray-900">{dialog.title}</h3>
        </div>
        <p className="text-sm leading-6 text-gray-600">{dialog.message}</p>
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
