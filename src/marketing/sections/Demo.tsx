import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GuestView } from '../demo/GuestView';
import { OwnerView } from '../demo/OwnerView';
import type { DemoState, DemoView } from '../demo/types';
import { BrowserWindow } from '../ui/BrowserWindow';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const INITIAL_STATE: DemoState = {
  view: 'owner',
  screen: 'list',
  courseId: null,
  booked: {},
  waitlisted: {},
};

function windowUrl(state: DemoState): string {
  if (state.view === 'owner') {
    return state.screen === 'list' ? 'yomita.omlify.de · Kurse' : 'yomita.omlify.de · Kursdetail';
  }
  return state.screen === 'list' ? 'yomita.omlify.de' : `yomita.omlify.de/kurs/${state.courseId}`;
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
  }, [state.screen, state.courseId, state.view]);

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
    setState((prev) => ({ ...prev, view, screen: 'list' }));
  };

  const openCourse = (id: number) => {
    focusTarget.current = 'back';
    setState((prev) => ({ ...prev, courseId: id, screen: 'detail' }));
  };

  const goBack = () => {
    focusTarget.current = 'row';
    setState((prev) => ({ ...prev, screen: 'list' }));
  };

  const book = (id: number) => {
    setState((prev) => ({ ...prev, booked: { ...prev.booked, [id]: true } }));
    say('Du bist angemeldet. Mila sieht das sofort.');
  };

  const waitlist = (id: number) => {
    setState((prev) => ({ ...prev, waitlisted: { ...prev.waitlisted, [id]: true } }));
    say('Du stehst auf der Warteliste. Wird ein Platz frei, bekommst du Bescheid.');
  };

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
          Beispieldaten, echte Oberfläche. Buch unten einen Kurs als Teilnehmerin — und wechsle dann
          zurück auf „Was du siehst“. Die Anmeldung ist sofort da.
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
        <BrowserWindow url={windowUrl(state)} className="dm-window mkt-win-relative">
          <div ref={bodyRef} aria-live="polite">
            {state.view === 'owner' ? (
              <OwnerView state={state} onOpenCourse={openCourse} onBack={goBack} />
            ) : (
              <GuestView
                state={state}
                onOpenCourse={openCourse}
                onBack={goBack}
                onBook={book}
                onWaitlist={waitlist}
              />
            )}
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
      <Reveal>
        <p className="dm-hint">
          Nichts davon ist ein Video. Es ist dieselbe Oberfläche wie in Omlify, mit erfundenen Namen.
        </p>
      </Reveal>
    </Section>
  );
}
