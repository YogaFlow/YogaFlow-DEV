import type { KeyboardEvent, ReactNode } from 'react';
import type { DemoCourse } from './types';

type CourseRowProps = {
  course: DemoCourse;
  status?: ReactNode;
  onOpen: (id: number) => void;
};

export function CourseRow({ course, status, onOpen }: CourseRowProps) {
  const open = () => onOpen(course.id);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <div
      className="mkt-cr"
      role="button"
      tabIndex={0}
      data-open={course.id}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <div className="mkt-dateblk" aria-hidden="true">
        <div className="w">{course.weekday}</div>
        <div className="d">{course.day}</div>
        <div className="m">{course.month}</div>
      </div>
      <div className="mkt-crm">
        <div className="mkt-crt">
          <h4>{course.title}</h4>
          <span className="pr">{course.price}</span>
        </div>
        <div className="mkt-meta">{course.time}</div>
        {status}
      </div>
      <div className="mkt-chev" aria-hidden="true">
        ›
      </div>
    </div>
  );
}
