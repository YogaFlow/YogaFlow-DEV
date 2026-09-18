import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { courseMeta } from '../demo/data';
import type { DemoCourse } from '../demo/types';

type CourseRowProps = {
  course: DemoCourse;
  leading: 'time' | 'date';
  status?: ReactNode;
  onOpen?: (id: number) => void;
};

export function CourseRow({ course, leading, status, onOpen }: CourseRowProps) {
  const interactive = typeof onOpen === 'function';

  const open = () => onOpen?.(course.id);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <div
      className={[
        'flex items-center gap-3 px-3.5 py-3 border-b border-border last:border-b-0',
        interactive
          ? 'cursor-pointer min-h-11 hover:bg-sage-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-open={interactive ? course.id : undefined}
      onClick={interactive ? open : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
    >
      {leading === 'date' ? (
        <div
          className="flex w-12 shrink-0 flex-col items-center self-start rounded-sm bg-brandSoft py-1 text-center leading-tight text-brandOnSoft tabular-nums"
          aria-hidden
        >
          <span className="text-[12px] font-normal">{course.weekday}</span>
          <span className="text-[19px] font-medium">{course.day}</span>
          <span className="text-[12px] font-normal">{course.month}</span>
        </div>
      ) : (
        <div className="shrink-0 self-start rounded-sm bg-brandSoft px-2 py-1 text-[15px] font-medium leading-tight text-brandOnSoft tabular-nums">
          {course.time}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 line-clamp-2 break-words text-[17px] font-medium leading-normal text-text">
            {course.title}
          </h3>
          <span className="shrink-0 text-[17px] font-medium leading-normal text-text tabular-nums">
            {course.price}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-textMuted tabular-nums">{courseMeta(course)}</p>
        {status ? <div className="mt-1">{status}</div> : null}
      </div>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
    </div>
  );
}
