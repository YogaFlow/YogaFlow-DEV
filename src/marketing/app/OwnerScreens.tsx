import { Plus, Users } from 'lucide-react';
import { DEMO_COURSES, DEMO_STUDIO_PEOPLE, initials, occupancy, withMore } from '../demo/data';
import { CourseRow } from './CourseRow';
import { CourseList } from './CourseList';
import { courseStatus } from './courseStatus';

const OWNER_STATS = [
  {
    title: 'Meine Kurse',
    value: DEMO_COURSES.filter((course) => course.teacher === 'Mila Vogt').length,
  },
  {
    title: 'Kommende Kurse',
    value: DEMO_COURSES.length,
  },
  {
    title: 'Teilnehmer',
    value: DEMO_COURSES.reduce((sum, course) => sum + course.registered, 0),
  },
] as const;

type OwnerDashboardProps = {
  onOpenCourse?: (id: number) => void;
};

export function OwnerDashboard({ onOpenCourse }: OwnerDashboardProps) {
  return (
    <div>
      <p className="text-[17px] text-text">Willkommen zurück, Mila!</p>
      <div className="mt-3.5 overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex divide-x divide-border">
          {OWNER_STATS.map((card) => (
            <div key={card.title} className="min-w-0 flex-1 px-3.5 py-3">
              <p className="text-[22px] font-medium tabular-nums text-text">{card.value}</p>
              <p className="mt-0.5 text-[13px] text-textMuted">{card.title}</p>
            </div>
          ))}
        </div>
      </div>
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
            onOpen={onOpenCourse}
          />
        ))}
      </div>
    </div>
  );
}

type OwnerMyCoursesProps = {
  onOpenCourse?: (id: number) => void;
};

export function OwnerMyCourses({ onOpenCourse }: OwnerMyCoursesProps) {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[14px] font-medium text-brand"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Neuer Kurs
        </button>
      </div>
      <CourseList role="owner" booked={{}} mineOnly onOpenCourse={onOpenCourse} />
    </div>
  );
}

export function StudioParticipants() {
  const { shown, rest } = withMore(DEMO_STUDIO_PEOPLE);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 text-[14px] text-textSubtle">
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        <span>Teilnehmer suchen</span>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {shown.map((name) => (
          <div key={name} className="flex items-center gap-2.5 px-3.5 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surfaceSunken text-[13px] font-medium text-textMuted">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] leading-snug text-text">{name}</div>
              <div className="mt-px text-[13px] text-textSubtle">Aktiv · seit Mai 2026</div>
            </div>
          </div>
        ))}
        {rest > 0 ? <div className="mkt-more">und {rest} weitere</div> : null}
      </div>
    </div>
  );
}
