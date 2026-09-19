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
  mineOnly?: boolean;
  registeredById?: Readonly<Record<number, number>>;
  flashId?: number | null;
};

export function CourseList({
  role,
  booked,
  waitlisted = {},
  onOpenCourse,
  mineOnly = false,
  registeredById,
  flashId = null,
}: CourseListProps) {
  const courses = mineOnly
    ? DEMO_COURSES.filter((course) => isOwnCourse(course, role))
    : DEMO_COURSES;

  return (
    <div className="space-y-5">
      {courses.map((course) => {
        const { remaining } = occupancy(course, booked, registeredById?.[course.id]);
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
              <CourseRow
                course={course}
                leading="time"
                status={status}
                flash={flashId === course.id}
                onOpen={onOpenCourse}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
