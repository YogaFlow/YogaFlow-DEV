import type { ReactNode } from 'react';
import { CourseRow } from './CourseRow';
import {
  DEMO_COURSES,
  DEMO_PARTICIPANTS,
  OWNER_NAV,
  courseById,
  freeSeatsLabel,
  initials,
  listStatusLabel,
  occupancy,
} from './data';
import type { DemoState } from './types';

type OwnerViewProps = {
  state: DemoState;
  onOpenCourse: (id: number) => void;
  onBack: () => void;
};

function OwnerShell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dm-frame">
      <div className="dm-side" aria-hidden="true">
        <div className="mkt-navlist">
          {OWNER_NAV.map((item) => (
            <div key={item.label} className={`mkt-navitem${item.current ? ' on' : ''}`}>
              <span className="mkt-navdot" />
              {item.label}
            </div>
          ))}
        </div>
      </div>
      <div className="dm-main">
        {onBack ? (
          <button type="button" className="dm-back" data-demo-back onClick={onBack}>
            ‹ Kurse
          </button>
        ) : null}
        <div className="dm-head">
          <div>
            <div className="dm-title">{title}</div>
            {subtitle ? <div className="dm-sub">{subtitle}</div> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function OwnerList({
  state,
  onOpenCourse,
}: {
  state: DemoState;
  onOpenCourse: (id: number) => void;
}) {
  return (
    <OwnerShell title="Kurse" subtitle="Kommende Termine">
      <div className="mkt-list">
        {DEMO_COURSES.map((course) => {
          const { free } = occupancy(course, state.booked);
          const label = listStatusLabel(course, free);
          return (
            <CourseRow
              key={course.id}
              course={course}
              onOpen={onOpenCourse}
              status={label ? <span className="mkt-pill">{label}</span> : null}
            />
          );
        })}
      </div>
    </OwnerShell>
  );
}

function OwnerDetail({
  state,
  onBack,
}: {
  state: DemoState;
  onBack: () => void;
}) {
  const course = state.courseId === null ? undefined : courseById(state.courseId);
  if (!course) return null;

  const { taken, free } = occupancy(course, state.booked);
  const bookedHere = Boolean(state.booked[course.id]);
  const names = DEMO_PARTICIPANTS[course.id]?.slice(0, course.taken) ?? [];
  const pill =
    free <= 0
      ? course.waitlist
        ? `Ausgebucht · ${course.waitlist} auf Warteliste`
        : 'Ausgebucht'
      : freeSeatsLabel(free);

  return (
    <OwnerShell
      title={course.title}
      subtitle={`${course.weekday} ${course.day}. ${course.month} · ${course.time} · ${course.price}`}
      onBack={onBack}
    >
      <span className="mkt-pill">{pill}</span>
      <div className="dm-head dm-head-participants">
        <div className="dm-title dm-title-sm">
          Teilnehmer · {taken} von {course.seats}
        </div>
      </div>
      <div className="mkt-list">
        {bookedHere ? (
          <div className="dm-prow dm-you">
            <div className="dm-av">Du</div>
            <div>
              <div className="dm-pn">Du</div>
              <div className="dm-pm">Angemeldet · gerade eben</div>
            </div>
          </div>
        ) : null}
        {names.map((name) => (
          <div key={name} className="dm-prow">
            <div className="dm-av">{initials(name)}</div>
            <div>
              <div className="dm-pn">{name}</div>
              <div className="dm-pm">Angemeldet</div>
            </div>
          </div>
        ))}
      </div>
      {bookedHere ? (
        <div className="dm-note">
          Diese Anmeldung kam gerade über deine Buchungsseite herein — ohne dass du etwas tun musstest.
        </div>
      ) : null}
      <div className="dm-actions">
        <button type="button" className="mkt-btn sm">
          Teilnehmer benachrichtigen
        </button>
        <button type="button" className="mkt-btn ghost sm">
          Kurs bearbeiten
        </button>
      </div>
    </OwnerShell>
  );
}

export function OwnerView({ state, onOpenCourse, onBack }: OwnerViewProps) {
  if (state.screen === 'detail') {
    return <OwnerDetail state={state} onBack={onBack} />;
  }
  return <OwnerList state={state} onOpenCourse={onOpenCourse} />;
}
