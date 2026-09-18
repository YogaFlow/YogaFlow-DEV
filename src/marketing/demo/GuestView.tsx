import type { ReactNode } from 'react';
import { CourseRow } from './CourseRow';
import {
  DEMO_COURSES,
  courseById,
  listStatusLabel,
  occupancy,
  waitlistPosition,
} from './data';
import type { DemoState } from './types';

type GuestViewProps = {
  state: DemoState;
  onOpenCourse: (id: number) => void;
  onBack: () => void;
  onBook: (id: number) => void;
  onWaitlist: (id: number) => void;
};

function HeartMark() {
  return (
    <span className="mkt-slogo">
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </span>
  );
}

function GuestList({
  state,
  onOpenCourse,
}: {
  state: DemoState;
  onOpenCourse: (id: number) => void;
}) {
  return (
    <div className="dm-main dm-guest">
      <div className="mkt-studiohead">
        <HeartMark />
        <div>
          <div className="mkt-sname">Yoga mit Mila</div>
          <div className="mkt-ssub">Kurse buchen · Neuss</div>
        </div>
      </div>
      <div className="mkt-list">
        {DEMO_COURSES.map((course) => {
          const { free } = occupancy(course, state.booked);
          const label = listStatusLabel(course, free);
          return (
            <CourseRow
              key={course.id}
              course={course}
              onOpen={onOpenCourse}
              status={
                <>
                  {label ? <span className="mkt-pill">{label}</span> : null}
                  {state.booked[course.id] ? <span className="mkt-pill ok">Gebucht</span> : null}
                  {state.waitlisted[course.id] ? (
                    <span className="mkt-pill">
                      Auf Warteliste · Position {waitlistPosition(course)}
                    </span>
                  ) : null}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function GuestDetail({
  state,
  onBack,
  onBook,
  onWaitlist,
}: {
  state: DemoState;
  onBack: () => void;
  onBook: (id: number) => void;
  onWaitlist: (id: number) => void;
}) {
  const course = state.courseId === null ? undefined : courseById(state.courseId);
  if (!course) return null;

  const { free } = occupancy(course, state.booked);
  const isBooked = Boolean(state.booked[course.id]);
  const isWaitlisted = Boolean(state.waitlisted[course.id]);

  let cta: ReactNode;
  if (isBooked) {
    cta = (
      <button type="button" className="mkt-btn sm success" disabled>
        ✓ Gebucht
      </button>
    );
  } else if (isWaitlisted) {
    cta = (
      <button type="button" className="mkt-btn ghost sm" disabled>
        Auf Warteliste · Position {waitlistPosition(course)}
      </button>
    );
  } else if (free <= 0) {
    cta = (
      <button type="button" className="mkt-btn ghost sm" onClick={() => onWaitlist(course.id)}>
        Auf die Warteliste
      </button>
    );
  } else {
    cta = (
      <button type="button" className="mkt-btn sm" onClick={() => onBook(course.id)}>
        Jetzt buchen
      </button>
    );
  }

  return (
    <div className="dm-main dm-guest">
      <button type="button" className="dm-back" data-demo-back onClick={onBack}>
        ‹ Alle Kurse
      </button>
      <div className="dm-title dm-title-lg">{course.title}</div>
      <dl className="dm-kv">
        <div>
          <dt>Termin</dt>
          <dd>
            {course.weekday} {course.day}. {course.month}
          </dd>
        </div>
        <div>
          <dt>Uhrzeit</dt>
          <dd>{course.time}</dd>
        </div>
        <div>
          <dt>Preis</dt>
          <dd>{course.price}</dd>
        </div>
        <div>
          <dt>Plätze</dt>
          <dd>{free > 0 ? `${free} frei` : 'ausgebucht'}</dd>
        </div>
      </dl>
      <p className="dm-big">
        Fließende Übergänge, ruhiges Tempo. Bring gern eine eigene Matte mit — Blöcke und Gurte sind da.
      </p>
      <div className="dm-actions">{cta}</div>
    </div>
  );
}

export function GuestView({ state, onOpenCourse, onBack, onBook, onWaitlist }: GuestViewProps) {
  if (state.screen === 'detail') {
    return (
      <GuestDetail state={state} onBack={onBack} onBook={onBook} onWaitlist={onWaitlist} />
    );
  }
  return <GuestList state={state} onOpenCourse={onOpenCourse} />;
}
