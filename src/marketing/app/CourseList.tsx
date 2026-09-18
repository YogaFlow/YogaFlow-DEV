import { DEMO_COURSES, isOwnCourse, occupancy, waitlistPositionFor } from '../demo/data';
import type { DemoState } from '../demo/types';
import { CourseRow } from './CourseRow';
import { courseStatus } from './courseStatus';
import type { AppRole } from './navigation';

type CourseListProps = {
  role: AppRole;
  booked: DemoState['booked'];
  waitlisted?: DemoState['waitlisted'];
  onOpenCourse?: (id: number) => void;
};

export function CourseList({ role, booked, waitlisted = {}, onOpenCourse }: CourseListProps) {
  return (
    <div className="space-y-5">
      {DEMO_COURSES.map((course) => {
        const { remaining } = occupancy(course, booked);
        const status = courseStatus({
          registered: Boolean(booked[course.id]),
          waitlistPosition: waitlisted[course.id] ? waitlistPositionFor(course) : undefined,
          remaining,
          isMine: isOwnCourse(course, role),
        });
        return (
          <section key={course.id}>
            <h2 className="mb-2 text-[15px] font-medium text-textMuted">{course.dayLabel}</h2>
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <CourseRow course={course} leading="time" status={status} onOpen={onOpenCourse} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
