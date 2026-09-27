import React, { useEffect } from 'react';

interface UndoBarProps {
  text: string;
  actionLabel: string;
  onAction: () => void;
  onExpire: () => void;
  busy?: boolean;
  durationMs?: number;
}

const UndoBar: React.FC<UndoBarProps> = ({
  text,
  actionLabel,
  onAction,
  onExpire,
  busy = false,
  durationMs = 10000,
}) => {
  useEffect(() => {
    const timeoutId = window.setTimeout(onExpire, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [onExpire, durationMs, text]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2 shadow-lg"
      >
        <p className="min-w-0 flex-1 text-[15px] text-text">{text}</p>
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center rounded-full px-3 text-[15px] font-medium text-brand disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

export default UndoBar;
