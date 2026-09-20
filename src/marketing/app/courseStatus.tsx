import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export type CourseStatusContext = {
  registered?: boolean;
  waitlistPosition?: number;
  remaining: number;
  isMine?: boolean;
};

const pillClass =
  'inline-flex rounded-full bg-accentSoft px-2.5 py-0.5 text-[13px] font-medium text-accentText whitespace-nowrap';

/** Reihenfolge wie in Courses.tsx / CourseDetail.tsx. */
export function courseStatus({
  registered,
  waitlistPosition,
  remaining,
  isMine,
}: CourseStatusContext): ReactNode {
  if (registered) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
        <Check className="h-4 w-4" aria-hidden />
        Angemeldet
      </span>
    );
  }
  if (waitlistPosition) {
    return <span className={pillClass}>Warteliste Pos. {waitlistPosition}</span>;
  }
  if (remaining <= 0) {
    return <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>;
  }
  if (remaining <= 2) {
    return (
      <span className={pillClass}>
        {remaining === 1 ? 'noch 1\u00A0Platz' : `noch ${remaining}\u00A0Plätze`}
      </span>
    );
  }
  if (isMine) {
    return <span className="text-[13px] font-medium text-textMuted">Dein Kurs</span>;
  }
  return null;
}
