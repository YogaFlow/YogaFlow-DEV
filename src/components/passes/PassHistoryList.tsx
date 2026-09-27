import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  formatPassMovementLabel,
  type PassMovementView,
} from '../../lib/passes';
import type { PaymentMethod } from '../../types';

type Props = {
  movements: PassMovementView[];
  studioView?: boolean;
  method?: PaymentMethod | null;
};

const PassHistoryList: React.FC<Props> = ({ movements, studioView, method }) => {
  const [open, setOpen] = useState(false);

  if (movements.length === 0) return null;

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
          {movements.map((move) => (
            <li key={move.id} className="text-[13px] leading-5 text-textMuted">
              {formatPassMovementLabel(move, { studioView, method })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default PassHistoryList;
