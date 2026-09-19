import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../app/AppShell';
import { CourseList } from '../app/CourseList';
import { BrowserWindow } from '../ui/BrowserWindow';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const HATHA_ID = 2;
const VINYASA_ID = 1;
const HATHA_START = 8;
const UNREAD_START = 2;
const TOAST_MS = 3400;

function resetHeroState(
  setHathaTaken: (value: number) => void,
  setUnread: (value: number) => void,
  setFlashId: (value: number | null) => void,
  setToastText: (value: string | null) => void,
  setToastIn: (value: boolean) => void,
) {
  setHathaTaken(HATHA_START);
  setUnread(UNREAD_START);
  setFlashId(null);
  setToastText(null);
  setToastIn(false);
}

export function Hero() {
  const reduceMotion = usePrefersReducedMotion();
  const windowRef = useRef<HTMLDivElement>(null);
  const [hathaTaken, setHathaTaken] = useState(HATHA_START);
  const [unread, setUnread] = useState(UNREAD_START);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [toastIn, setToastIn] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      resetHeroState(setHathaTaken, setUnread, setFlashId, setToastText, setToastIn);
      return;
    }

    const node = windowRef.current;
    if (!node) return;

    const timers: number[] = [];
    let stopped = false;
    let started = false;

    const hideToastLater = () => {
      timers.push(
        window.setTimeout(() => {
          if (!stopped) setToastIn(false);
        }, TOAST_MS),
      );
    };

    const cycle = () => {
      if (stopped) return;
      timers.push(
        window.setTimeout(() => {
          if (stopped) return;
          setHathaTaken(9);
          setUnread(3);
          setFlashId(HATHA_ID);
          setToastText('Neue Anmeldung · Hatha für Einsteiger');
          setToastIn(true);
          hideToastLater();
        }, 1700),
      );
      timers.push(
        window.setTimeout(() => {
          if (stopped) return;
          setUnread(4);
          setFlashId(VINYASA_ID);
          setToastText('Mira ist von der Warteliste nachgerückt');
          setToastIn(true);
          hideToastLater();
        }, 6200),
      );
      timers.push(
        window.setTimeout(() => {
          if (stopped) return;
          resetHeroState(setHathaTaken, setUnread, setFlashId, setToastText, setToastIn);
          cycle();
        }, 13000),
      );
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((entry) => entry.isIntersecting)) {
          started = true;
          cycle();
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(node);

    return () => {
      stopped = true;
      io.disconnect();
      for (const id of timers) window.clearTimeout(id);
    };
  }, [reduceMotion]);

  return (
    <Section background="bg-sand" spacing="hero" className="mkt-hero">
      <div className="mkt-hero-grid">
        <Reveal>
          <h1 className="mkt-hero-h1">
            <span>Deine Kurse.</span> <span>Deine Buchungsseite.</span>{' '}
            <span className="text-brand">Deine Kunden.</span>
          </h1>
          <p className="mkt-hero-sub">
            Omlify ist die Kurs- und Buchungsverwaltung für Yoga-Studios und selbstständige
            Yogalehrer in Deutschland. Unter deiner eigenen Adresse, mit deinem Logo — und ohne
            dass wir an deinen Buchungen mitverdienen.
          </p>
          <div className="mkt-hero-cta">
            <a href="#demo" className="mkt-btn">
              Omlify ansehen
            </a>
            <a
              href="/onboarding"
              className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Oder direkt loslegen: Studio einrichten
            </a>
          </div>
          <p className="mkt-hero-fine">Aktuell kostenlos · Keine Kreditkarte · In 5 Minuten eingerichtet</p>
        </Reveal>
        <Reveal className="mkt-hero-vis">
          <div className="mkt-hero-glow" aria-hidden="true" />
          <div ref={windowRef} className="relative z-[1]" aria-hidden="true">
            <BrowserWindow url="yomita.omlify.de/courses" className="mkt-hero-win">
              <AppShell role="owner" path="/courses" unread={unread}>
                <CourseList
                  role="owner"
                  booked={{}}
                  registeredById={{ [HATHA_ID]: hathaTaken }}
                  flashId={flashId}
                />
              </AppShell>
              <div className={toastIn ? 'mkt-toast in' : 'mkt-toast'}>
                <span aria-hidden="true">✓</span>
                <span>{toastText}</span>
              </div>
            </BrowserWindow>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
