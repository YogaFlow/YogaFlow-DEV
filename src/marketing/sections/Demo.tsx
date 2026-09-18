import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppShell } from '../app/AppShell';
import { CourseDetail } from '../app/CourseDetail';
import { CourseList } from '../app/CourseList';
import { GuestDashboard, MyRegistrations } from '../app/GuestDashboard';
import { ParticipantList } from '../app/ParticipantList';
import type { AppRole } from '../app/navigation';
import { courseById } from '../demo/data';
import type { DemoState, DemoView } from '../demo/types';
import { BrowserWindow } from '../ui/BrowserWindow';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const INITIAL_STATE: DemoState = {
  view: 'owner',
  path: '/courses',
  courseId: null,
  booked: {},
  waitlisted: {},
};

const OWNER_CLICKABLE = ['/courses', '/participants'] as const;
const GUEST_CLICKABLE = ['/dashboard', '/courses', '/my-registrations'] as const;

function windowUrl(path: string): string {
  return `yomita.omlify.de${path}`;
}

function roleFor(view: DemoView): AppRole {
  return view === 'owner' ? 'owner' : 'user';
}

export function Demo() {
  const [state, setState] = useState<DemoState>(INITIAL_STATE);
  const reduceMotion = usePrefersReducedMotion();
  const bodyRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTextRef = useRef<HTMLSpanElement>(null);
  const toastTimer = useRef<number | null>(null);
  const toastVisible = useRef(false);
  const focusTarget = useRef<'back' | 'row' | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (toastVisible.current) toastRef.current?.classList.add('in');
  });

  useLayoutEffect(() => {
    const root = bodyRef.current;
    if (!root || focusTarget.current === null) return;
    const el =
      focusTarget.current === 'back'
        ? root.querySelector<HTMLElement>('[data-demo-back]')
        : state.courseId != null
          ? root.querySelector<HTMLElement>(`[data-open="${state.courseId}"]`)
          : null;
    el?.focus();
    focusTarget.current = null;
  }, [state.path, state.courseId, state.view]);

  const say = (text: string) => {
    if (toastTextRef.current) toastTextRef.current.textContent = text;
    toastVisible.current = true;
    toastRef.current?.classList.add('in');
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastVisible.current = false;
      toastRef.current?.classList.remove('in');
      toastTimer.current = null;
    }, 4200);
  };

  const setView = (view: DemoView) => {
    setState((prev) => ({
      ...prev,
      view,
      path: view === 'owner' ? '/courses' : '/dashboard',
      courseId: null,
    }));
  };

  const openCourse = (id: number) => {
    focusTarget.current = 'back';
    setState((prev) => ({ ...prev, courseId: id, path: `/course/${id}` }));
  };

  const goBack = () => {
    focusTarget.current = 'row';
    setState((prev) => ({ ...prev, path: '/courses' }));
  };

  const goParticipants = () => {
    setState((prev) =>
      prev.courseId == null
        ? prev
        : { ...prev, path: `/course/${prev.courseId}/participants` },
    );
  };

  const navigate = (path: string) => {
    setState((prev) => ({ ...prev, path, courseId: null }));
  };

  const book = (id: number) => {
    setState((prev) => ({ ...prev, booked: { ...prev.booked, [id]: true } }));
    say('Du bist angemeldet. Mila sieht das sofort.');
  };

  const waitlist = (id: number) => {
    setState((prev) => ({ ...prev, waitlisted: { ...prev.waitlisted, [id]: true } }));
    say('Du stehst auf der Warteliste. Wird ein Platz frei, bekommst du Bescheid.');
  };

  const role = roleFor(state.view);
  const clickable = state.view === 'owner' ? OWNER_CLICKABLE : GUEST_CLICKABLE;
  const unread = state.view === 'owner' ? 3 : 0;
  const course = state.courseId == null ? undefined : courseById(state.courseId);
  const onCourseParticipants = state.path.match(/^\/course\/\d+\/participants$/);

  let body = null;
  if (state.path === '/dashboard') {
    body = (
      <GuestDashboard
        booked={state.booked}
        waitlisted={state.waitlisted}
        onOpenCourse={openCourse}
      />
    );
  } else if (state.path === '/my-registrations') {
    body = (
      <MyRegistrations
        booked={state.booked}
        waitlisted={state.waitlisted}
        onOpenCourse={openCourse}
      />
    );
  } else if (onCourseParticipants && course) {
    body = <ParticipantList course={course} booked={state.booked} onBack={goBack} />;
  } else if (state.path.startsWith('/course/') && course) {
    body = (
      <CourseDetail
        course={course}
        role={role}
        booked={state.booked}
        waitlisted={state.waitlisted}
        onBack={goBack}
        onBook={book}
        onWaitlist={waitlist}
        onParticipants={goParticipants}
      />
    );
  } else {
    body = (
      <CourseList
        role={role}
        booked={state.booked}
        waitlisted={state.waitlisted}
        onOpenCourse={openCourse}
      />
    );
  }

  return (
    <Section id="demo" background="bg-sand">
      <Reveal>
        <div className="mkt-eyebrow">Die Demo</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Sieh es dir an. Von beiden Seiten.</h2>
      </Reveal>
      <Reveal>
        <p className="mkt-lede">
          Dieselbe Oberfläche wie in Omlify, mit erfundenen Namen. Meld dich als Teilnehmerin für
          einen Kurs an — und wechsle dann zurück auf „Was du siehst“.
        </p>
      </Reveal>
      <Reveal>
        <div className="dm-switch" role="group" aria-label="Ansicht wählen">
          <button
            type="button"
            aria-pressed={state.view === 'owner'}
            onClick={() => setView('owner')}
          >
            Was du siehst
          </button>
          <button
            type="button"
            aria-pressed={state.view === 'guest'}
            onClick={() => setView('guest')}
          >
            Was deine Teilnehmerin sieht
          </button>
        </div>
      </Reveal>
      <Reveal>
        <BrowserWindow url={windowUrl(state.path)} className="dm-window mkt-win-relative">
          <div ref={bodyRef} aria-live="polite">
            <AppShell
              role={role}
              path={state.path}
              unread={unread}
              clickable={clickable}
              onNavigate={navigate}
            >
              {body}
            </AppShell>
          </div>
          <div
            ref={toastRef}
            className="mkt-toast"
            role="status"
            style={reduceMotion ? { transition: 'none', transform: 'none' } : undefined}
          >
            <span aria-hidden="true">✓</span>
            <span ref={toastTextRef} />
          </div>
        </BrowserWindow>
      </Reveal>
    </Section>
  );
}
