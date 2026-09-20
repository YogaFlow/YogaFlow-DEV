import type { ReactNode } from 'react';
import { ArrowLeft, Calendar, Check, Clock, MapPin, User, Users } from 'lucide-react';
import { isOwnCourse, occupancy, waitlistPositionFor } from '../demo/data';
import type { DemoCourse } from '../demo/types';
import { courseStatus } from './courseStatus';
import type { AppRole } from './navigation';

type CourseDetailProps = {
  course: DemoCourse;
  role: AppRole;
  booked: Record<number, boolean>;
  waitlisted: Record<number, boolean>;
  onBack: () => void;
  onBook?: (id: number) => void;
  onWaitlist?: (id: number) => void;
  onParticipants?: () => void;
};

const ACTION =
  'mkt-action-btn inline-flex items-center justify-center rounded-full min-h-11 px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
const STAFF_ACTION =
  'inline-flex items-center justify-center rounded-full min-h-11 px-5 text-[15px] font-medium border border-borderStrong bg-surface text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

export function CourseDetail({
  course,
  role,
  booked,
  waitlisted,
  onBack,
  onBook,
  onWaitlist,
  onParticipants,
}: CourseDetailProps) {
  const staff = role === 'owner' || role === 'teacher';
  const isBooked = Boolean(booked[course.id]);
  const isWaitlisted = Boolean(waitlisted[course.id]);
  const { taken, remaining } = occupancy(course, booked);
  const waitPos = isWaitlisted ? waitlistPositionFor(course) : undefined;
  const status = courseStatus({
    registered: isBooked,
    waitlistPosition: waitPos,
    remaining,
    isMine: isOwnCourse(course, role),
  });

  let action: ReactNode = null;
  if (staff) {
    action = (
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={STAFF_ACTION} onClick={onParticipants}>
          Teilnehmer
        </button>
        <button type="button" className={STAFF_ACTION}>
          Bearbeiten
        </button>
      </div>
    );
  } else if (isBooked) {
    action = (
      <button type="button" className={`${ACTION} border border-borderStrong bg-surface text-danger`}>
        Abmelden
      </button>
    );
  } else if (isWaitlisted) {
    action = (
      <button
        type="button"
        disabled
        className={`${ACTION} border border-accent bg-accentSoft text-accentText`}
      >
        Warteliste Pos. {waitPos}
      </button>
    );
  } else if (remaining <= 0) {
    action = (
      <button
        type="button"
        className={`${ACTION} border border-accent bg-accentSoft text-accentText`}
        onClick={() => onWaitlist?.(course.id)}
      >
        Auf die Warteliste
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        className={`${ACTION} bg-brand text-onBrand active:bg-brandPressed`}
        onClick={() => onBook?.(course.id)}
      >
        Anmelden
      </button>
    );
  }

  let actionNote: ReactNode;
  if (isBooked) {
    actionNote = (
      <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-success">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Angemeldet
      </span>
    );
  } else if (isWaitlisted) {
    actionNote = (
      <span className="mt-0.5 inline-flex rounded-full bg-accentSoft px-2.5 py-0.5 text-[13px] font-medium text-accentText whitespace-nowrap">
        Warteliste Pos. {waitPos}
      </span>
    );
  } else {
    actionNote = <p className="mt-0.5 text-[13px] text-textMuted">pro Termin</p>;
  }

  return (
    <div className="mkt-detail mx-auto">
      <button
        type="button"
        data-demo-back
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 pr-2 text-[15px] font-medium text-textMuted"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
        Zurück
      </button>

      <h2 className="mt-2.5 text-[22px] font-medium leading-snug text-text">{course.title}</h2>
      {status ? <div className="mt-2">{status}</div> : null}

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex items-start gap-3 px-3.5 py-3">
          <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
          <p className="text-[15px] text-text">{course.dateLine}</p>
        </div>
        <div className="flex items-start gap-3 px-3.5 py-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
          <p className="text-[15px] text-text tabular-nums">
            {course.time} bis {course.end} · {course.duration}
          </p>
        </div>
        <div className="flex items-start gap-3 px-3.5 py-3">
          <User className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
          <p className="text-[15px] text-text">{course.teacher}</p>
        </div>
        <div className="flex items-start gap-3 px-3.5 py-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
          <p className="text-[15px] text-text">{course.location}</p>
        </div>
        {staff ? (
          <div className="flex items-start gap-3 px-3.5 py-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
            <p className="text-[15px] text-text tabular-nums">
              {taken} von {course.max} Plätzen belegt
            </p>
          </div>
        ) : null}
      </div>

      <h3 className="mt-5 text-[17px] font-medium text-text">Über den Kurs</h3>
      <p className="mt-2 text-[15px] leading-normal text-text">{course.description}</p>

      <div className="mkt-actionbar mt-5 flex items-center justify-between gap-3 border-t border-border bg-surface py-3">
        <div className="min-w-0 shrink-0">
          <p className="text-[19px] font-medium leading-tight text-text tabular-nums">{course.price}</p>
          {actionNote}
        </div>
        {action}
      </div>
    </div>
  );
}
