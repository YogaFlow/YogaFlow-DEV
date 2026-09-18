import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

type Channel = 'whatsapp' | 'instagram' | 'email';

type InboxMessage = {
  channel: Channel;
  time: string;
  text: string;
  pos: 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6';
};

const MESSAGES: readonly InboxMessage[] = [
  { channel: 'whatsapp', time: '21:14', text: 'Hey! Ist morgen um 18:30 noch ein Platz frei? 🙏', pos: 'm1' },
  { channel: 'instagram', time: '21:22', text: 'Kann ich diese Woche von Di auf Do tauschen?', pos: 'm2' },
  { channel: 'email', time: '22:03', text: 'Ich hatte doch schon überwiesen, oder? Finde die Bestätigung nicht.', pos: 'm3' },
  { channel: 'whatsapp', time: '22:31', text: 'Melde mich für morgen leider ab, mir gehts nicht gut', pos: 'm4' },
  { channel: 'whatsapp', time: '07:48', text: 'Steh ich auf der Warteliste noch drauf?', pos: 'm5' },
  { channel: 'instagram', time: '08:02', text: 'Gibts die 10er-Karte noch?', pos: 'm6' },
];

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-Mail',
};

const ROTATIONS = [-2.6, 1.9, -1.4, 2.4, -1.8, 1.2] as const;

function channelDotClass(channel: Channel): string {
  return channel === 'email' ? 'mkt-dotlet bg-accent' : 'mkt-dotlet';
}

function channelDotStyle(channel: Channel): { background: string } | undefined {
  if (channel === 'whatsapp') return { background: '#25D366' };
  if (channel === 'instagram') return { background: '#E1306C' };
  return undefined;
}

export function Problem() {
  const inboxRef = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(() => MESSAGES.map(() => false));
  const reduceMotion = usePrefersReducedMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  useEffect(() => {
    const inbox = inboxRef.current;
    if (!inbox) return;

    let cancelled = false;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled || !entries.some((entry) => entry.isIntersecting)) return;
        const reduce = reduceMotionRef.current;
        MESSAGES.forEach((_, index) => {
          const delay = reduce ? 0 : index * 120;
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
      { threshold: 0.2 },
    );
    io.observe(inbox);

    return () => {
      cancelled = true;
      io.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <Section background="bg-sage-50" blendTop="sand" blendBottom="sand">
      <Reveal>
        <div className="mkt-eyebrow">Das Problem</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Sonntagabend, und du sortierst Anmeldungen.</h2>
      </Reveal>
      <div ref={inboxRef} className="mkt-inbox" aria-hidden="true">
        {MESSAGES.map((message, index) => {
          const rotation = ROTATIONS[index];
          const visible = arrived[index];
          return (
            <div
              key={`${message.channel}-${message.time}`}
              className={`mkt-msg mkt-${message.pos}${visible ? ' in' : ''}`}
              style={{
                transform: visible
                  ? `translateY(0) rotate(${rotation}deg)`
                  : `translateY(22px) rotate(${rotation}deg)`,
              }}
            >
              <div className="mkt-msg-who">
                <span className={channelDotClass(message.channel)} style={channelDotStyle(message.channel)} />
                <b>{CHANNEL_LABEL[message.channel]}</b> · {message.time}
              </div>
              <p>{message.text}</p>
            </div>
          );
        })}
      </div>
      <Reveal>
        <p className="mkt-punch">
          Sechs Nachrichten, drei Kanäle, eine Liste im Kopf.
          <br />
          <span>Das ist keine Frage von Disziplin. Es ist ein Werkzeugproblem.</span>
        </p>
      </Reveal>
    </Section>
  );
}
