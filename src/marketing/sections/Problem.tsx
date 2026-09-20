import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

type Channel = 'wa' | 'ig' | 'ml';
type Depth = 1 | 2 | 3;

type InboxMessage = {
  channel: Channel;
  time: string;
  x: number;
  y: number;
  rotate: number;
  depth: Depth;
  text: string;
  hideOnSmall?: boolean;
};

const MESSAGES: readonly InboxMessage[] = [
  { channel: 'wa', time: '21:14', x: 0, y: 0, rotate: -2.2, depth: 1, text: 'Hey! Ist morgen um 18:30 noch ein Platz frei? 🙏' },
  { channel: 'ig', time: '21:22', x: 26, y: 16, rotate: 1.6, depth: 2, text: 'Kann ich diese Woche von Di auf Do tauschen?' },
  { channel: 'wa', time: '21:40', x: 53, y: 0, rotate: -1.3, depth: 1, text: 'Kommt ihr Sonntag auch? Meine Freundin will mit' },
  { channel: 'ml', time: '22:03', x: 78, y: 20, rotate: 2.1, depth: 3, text: 'Ich hatte doch schon überwiesen, oder? Finde die Bestätigung nicht.', hideOnSmall: true },
  { channel: 'wa', time: '22:31', x: 12, y: 132, rotate: 1.9, depth: 2, text: 'Melde mich für morgen leider ab, mir gehts nicht gut' },
  { channel: 'ig', time: '22:52', x: 38, y: 150, rotate: -1.7, depth: 3, text: 'Wie viele Plätze sind noch frei für Samstag?', hideOnSmall: true },
  { channel: 'wa', time: '07:48', x: 64, y: 132, rotate: 2.4, depth: 1, text: 'Steh ich auf der Warteliste noch drauf?' },
  { channel: 'ig', time: '08:02', x: 89, y: 154, rotate: -2.4, depth: 2, text: 'Gibts die 10er-Karte noch?', hideOnSmall: true },
  { channel: 'wa', time: '09:40', x: 4, y: 272, rotate: -1.5, depth: 1, text: 'Hab überwiesen — 18 € für Donnerstag ✌️' },
  { channel: 'ml', time: '11:30', x: 31, y: 288, rotate: 1.4, depth: 2, text: 'Die Rechnung für die Steuer bräuchte ich noch', hideOnSmall: true },
];

const CHANNEL: Record<Channel, { color: string; label: string }> = {
  wa: { color: '#25D366', label: 'WhatsApp' },
  ig: { color: '#E1306C', label: 'Instagram' },
  ml: { color: '#B87A2E', label: 'E-Mail' },
};

const SCALE: Record<Depth, number> = {
  1: 1,
  2: 0.965,
  3: 0.93,
};

export function Problem() {
  const pileRef = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(() => MESSAGES.map(() => false));
  const reduceMotion = usePrefersReducedMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  useEffect(() => {
    const pile = pileRef.current;
    if (!pile) return;

    let cancelled = false;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled || !entries.some((entry) => entry.isIntersecting)) return;
        const reduce = reduceMotionRef.current;
        MESSAGES.forEach((_, index) => {
          const delay = reduce ? 0 : index * 95;
          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;
              setArrived((prev) => {
                if (prev[index]) return prev;
                const next = [...prev];
                next[index] = true;
                return next;
              });
            }, delay),
          );
        });
        io.disconnect();
      },
      { threshold: 0.15 },
    );
    io.observe(pile);

    return () => {
      cancelled = true;
      io.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <Section background="bg-sage-50" blendTop="sand" blendBottom="sand" className="overflow-hidden">
      <Reveal>
        <div className="mkt-eyebrow">Das Problem</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Sonntagabend. Und wer morgen kommt, steht in drei verschiedenen Apps.</h2>
      </Reveal>
      <div className="mkt-pile">
        <div ref={pileRef} className="mkt-pile-msgs" aria-hidden="true">
          {MESSAGES.map((message, index) => {
            const channel = CHANNEL[message.channel];
            const scale = SCALE[message.depth];
            const visible = arrived[index];
            const visibleIndex = MESSAGES.slice(0, index).filter((item) => !item.hideOnSmall).length;
            return (
              <div
                key={`${message.channel}-${message.time}`}
                className={`mkt-msg mkt-d${message.depth}${message.hideOnSmall ? ' hide-s' : ''}${
                  !message.hideOnSmall && visibleIndex % 2 === 1 ? ' mkt-msg-end' : ''
                }${visible ? ' in' : ''}`}
                style={{
                  left: `${message.x}%`,
                  top: `${message.y}px`,
                  transform: `translateY(${visible ? 0 : 22}px) rotate(${message.rotate}deg) scale(${scale})`,
                }}
              >
                <div className="mkt-msg-who">
                  <span className="mkt-dotlet" style={{ background: channel.color }} />
                  <b>{channel.label}</b> · {message.time}
                </div>
                <p>{message.text}</p>
              </div>
            );
          })}
        </div>
        <Reveal>
          <div className="mkt-punchbox">
            <p>
              Zehn Nachrichten, drei Kanäle, eine Liste im Kopf.
              <br />
              <span>Nichts davon ist kompliziert. Es liegt nur nicht an einem Ort.</span>
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
