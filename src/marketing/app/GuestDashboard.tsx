import { DEMO_COURSES, occupancy, waitlistPositionFor } from '../demo/data';
import type { DemoCourse } from '../demo/types';
import { CourseRow } from './CourseRow';
import { courseStatus } from './courseStatus';

type GuestDashboardProps = {
  booked: Record<number, boolean>;
  waitlisted?: Record<number, boolean>;
  onOpenCourse?: (id: number) => void;
};

function firstBookedCourse(booked: Record<number, boolean>): DemoCourse | undefined {
  const id = Object.keys(booked)
    .map(Number)
    .find((courseId) => booked[courseId]);
  return id == null ? undefined : DEMO_COURSES.find((course) => course.id === id);
}

export function GuestDashboard({ booked, waitlisted = {}, onOpenCourse }: GuestDashboardProps) {
  const hero = firstBookedCourse(booked);

  return (
    <div>
      <p className="text-[17px] text-text">Willkommen zurück, Anna!</p>
      {hero ? (
        <div className="mt-3.5 rounded-lg bg-brand p-5 text-onBrand">
          <p className="text-[13px]">Deine nächste Stunde</p>
          <h3 className="mt-1 text-[22px] font-medium">{hero.title}</h3>
          <p className="mt-1 text-[17px] tabular-nums">
            {hero.dayLabel} · {hero.time} bis {hero.end}
          </p>
          <p className="mt-0.5 text-[13px] opacity-90">
            {hero.location.split(' · ')[0]} · {hero.teacher}
          </p>
        </div>
      ) : (
        <div className="mt-3.5 rounded-lg bg-brand p-5 text-onBrand">
          <h3 className="text-[22px] font-medium">Noch nichts gebucht</h3>
          <p className="mt-1 text-[17px]">Schau dir an, was diese Woche läuft.</p>
        </div>
      )}

      <h2 className="mb-2 mt-5 text-[15px] font-medium text-textMuted">
        {hero ? 'Danach' : 'Demnächst im Studio'}
      </h2>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {(hero ? DEMO_COURSES.filter((course) => course.id !== hero.id) : DEMO_COURSES.slice(0, 2)).map(
          (course) => {
            const { remaining } = occupancy(course, booked);
            return (
              <CourseRow
                key={course.id}
                course={course}
                leading="date"
                status={courseStatus({
                  registered: Boolean(booked[course.id]),
                  waitlistPosition: waitlisted[course.id] ? waitlistPositionFor(course) : undefined,
                  remaining,
                })}
                onOpen={onOpenCourse}
              />
            );
          },
        )}
      </div>
    </div>
  );
}

type MyRegistrationsProps = {
  booked: Record<number, boolean>;
  waitlisted: Record<number, boolean>;
  onOpenCourse?: (id: number) => void;
};

export function MyRegistrations({ booked, waitlisted, onOpenCourse }: MyRegistrationsProps) {
  const ids = [
    ...Object.keys(booked).map(Number).filter((id) => booked[id]),
    ...Object.keys(waitlisted).map(Number).filter((id) => waitlisted[id]),
  ];
  const courses = DEMO_COURSES.filter((course) => ids.includes(course.id));

  if (courses.length === 0) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="px-3.5 py-3">
          <div className="text-[15px] text-text">Noch keine Anmeldungen</div>
          <div className="mt-px text-[13px] text-textSubtle">
            Melde dich für einen Kurs an, dann steht er hier.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      {courses.map((course) => {
        const { remaining } = occupancy(course, booked);
        return (
          <CourseRow
            key={course.id}
            course={course}
            leading="date"
            status={courseStatus({
              registered: Boolean(booked[course.id]),
              waitlistPosition: waitlisted[course.id] ? waitlistPositionFor(course) : undefined,
              remaining,
            })}
            onOpen={onOpenCourse}
          />
        );
      })}
    </div>
  );
}

type StaffHomeProps = {
  name: string;
};

export function StaffHome({ name }: StaffHomeProps) {
  const firstName = name.split(' ')[0];
  return (
    <div>
      <p className="text-[17px] text-text">Willkommen zurück, {firstName}!</p>
      <h2 className="mb-2 mt-5 text-[15px] font-medium text-textMuted">Deine nächsten Kurse</h2>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {DEMO_COURSES.slice(0, 2).map((course) => (
          <CourseRow
            key={course.id}
            course={course}
            leading="date"
            status={courseStatus({
              remaining: occupancy(course, {}).remaining,
              isMine: true,
            })}
          />
        ))}
      </div>
    </div>
  );
}
