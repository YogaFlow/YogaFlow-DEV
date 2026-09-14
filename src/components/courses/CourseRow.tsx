import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Course } from '../../types';
import { formatDateBlock, formatDayLabel, formatPrice, formatTime } from '../../lib/format';

interface CourseRowProps {
  course: Course;
  href: string;
  leading: 'date' | 'time';
  meta: string;
  status?: React.ReactNode;
}

const CourseRow: React.FC<CourseRowProps> = ({ course, href, leading, meta, status }) => {
  const dateBlock = leading === 'date' ? formatDateBlock(course.date) : null;

  return (
    <Link
      to={href}
      className="block px-3.5 py-3 no-underline text-inherit active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
    >
      <div className="flex items-center gap-3">
        {leading === 'date' && dateBlock ? (
          <div className="shrink-0 self-start">
            <div
              className="flex w-12 flex-col items-center justify-center rounded-sm bg-brandSoft py-1 text-center leading-tight text-brandOnSoft tabular-nums"
              aria-hidden
            >
              <span className="text-[12px] font-normal">{dateBlock.weekday}</span>
              <span className="text-[19px] font-medium">{dateBlock.day}</span>
              <span className="text-[12px] font-normal">{dateBlock.month}</span>
            </div>
            <span className="sr-only">{formatDayLabel(course.date)}</span>
          </div>
        ) : null}
        {leading === 'time' ? (
          <div className="shrink-0 self-start rounded-sm bg-brandSoft px-2 py-1 text-[15px] font-medium leading-tight text-brandOnSoft tabular-nums">
            {formatTime(course.time)}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="min-w-0 truncate text-[17px] font-medium text-text">{course.title}</h3>
            {course.price != null ? (
              <span className="shrink-0 text-[17px] font-medium text-text tabular-nums">
                {formatPrice(course.price)}
              </span>
            ) : null}
          </div>
          {meta ? (
            <p className="truncate text-[13px] text-textMuted tabular-nums">{meta}</p>
          ) : null}
          {status ? <div className="mt-1">{status}</div> : null}
        </div>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
      </div>
    </Link>
  );
};

export default CourseRow;
