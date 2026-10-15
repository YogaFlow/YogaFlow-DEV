import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  formatPassExtensionLabel,
  type PassHistoryEntry,
} from '../../lib/passHistory';
import {
  formatPassMovementLabel,
  type PassMovementView,
} from '../../lib/passes';
import type { PaymentMethod } from '../../types';

type Props = {
  entries: PassHistoryEntry<PassMovementView>[];
  studioView?: boolean;
  method?: PaymentMethod | null;
};

const PassHistoryList: React.FC<Props> = ({ entries, studioView, method }) => {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm text-textMuted"
      >
        <span>Verlauf</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </button>
      {open ? (
        <ul className="mt-1 space-y-1.5 border-l border-border pl-3">
          {entries.map((entry) => (
            <li key={entry.id} className="text-[13px] leading-5 text-textMuted">
              {entry.kind === 'extension'
                ? formatPassExtensionLabel(entry.change)
                : formatPassMovementLabel(entry.movement, { studioView, method })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default PassHistoryList;
