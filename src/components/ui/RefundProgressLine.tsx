import React from 'react';
import { Check, Clock, Info } from 'lucide-react';
import type { RefundProgress } from '../../lib/refundTexts';

const ICONS = {
  pending: Clock,
  done: Check,
  partial: Check,
  delayed: Info,
} as const;

const RefundProgressLine: React.FC<{ progress: RefundProgress }> = ({ progress }) => {
  const Icon = ICONS[progress.tone];
  return (
    <p
      className="inline-flex items-center gap-1 text-[13px] text-text tabular-nums"
      data-testid="refund-progress"
    >
      <Icon className="h-4 w-4 shrink-0 text-textMuted" aria-hidden />
      {progress.text}
    </p>
  );
};

export default RefundProgressLine;
