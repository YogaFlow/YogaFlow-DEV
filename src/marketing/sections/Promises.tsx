import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BRAND_PRESETS, deriveBrandTokens } from '../../design/brand';
import { AppShell } from '../app/AppShell';
import { GuestDashboard, StaffHome } from '../app/GuestDashboard';
import { ParticipantList, type ParticipantRow } from '../app/ParticipantList';
import type { AppRole } from '../app/navigation';
import { DEMO_COURSES } from '../demo/data';
import { BrowserWindow } from '../ui/BrowserWindow';
import { usePrefersReducedMotion } from '../ui/prefersReducedMotion';
import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const SWATCH_IDS = ['sage', 'plum', 'petrol', 'olive', 'berry'] as const;

const SWATCHES = SWATCH_IDS.map((id) => {
  const preset = BRAND_PRESETS.find((item) => item.id === id);
  if (!preset) {
    throw new Error(`Brand preset ${id} fehlt in BRAND_PRESETS.`);
  }
  const tokens = deriveBrandTokens(preset.hex);
  return {
    id: preset.id,
    label: preset.label,
    hex: preset.hex,
    brand: tokens.brand,
    brandPressed: tokens.brandPressed,
    brandSoft: tokens.brandSoft,
    brandOnSoft: tokens.brandOnSoft,
  };
});

function brandWindowStyle(swatch: (typeof SWATCHES)[number]): CSSProperties {
  return {
    '--color-brand': swatch.brand,
    '--color-brand-pressed': swatch.brandPressed,
    '--color-brand-soft': swatch.brandSoft,
    '--color-brand-on-soft': swatch.brandOnSoft,
  } as CSSProperties;
}

const VINYASA = DEMO_COURSES[0];

const ROLES: readonly { id: AppRole; label: string }[] = [
  { id: 'owner', label: 'Inhaberin' },
  { id: 'teacher', label: 'Kursleitung' },
  { id: 'user', label: 'Teilnehmerin' },
];

function BrandPreview() {
  const [selectedId, setSelectedId] = useState<(typeof SWATCHES)[number]['id']>('sage');
  const selected = SWATCHES.find((item) => item.id === selectedId) ?? SWATCHES[0];

  return (
    <div className="mkt-row2">
      <div className="mkt-txt">
        <h3>Dein Studio, deine Farben</h3>
        <p>
          Eigene Adresse, eigenes Logo, eigene Markenfarbe. Deine Teilnehmer sehen dein Studio — nicht
          ein Portal, das ihnen nebenbei drei andere vorschlägt.
        </p>
        <div className="mkt-swatches">
          <span className="mkt-swlab">Markenfarbe wählen</span>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              type="button"
              className="mkt-sw"
              aria-pressed={swatch.id === selectedId}
              aria-label={swatch.label}
              onClick={() => setSelectedId(swatch.id)}
            >
              <span className="mkt-sw-dot" style={{ background: swatch.hex }} />
            </button>
          ))}
        </div>
      </div>
      <BrowserWindow url="yomita.omlify.de/dashboard" style={brandWindowStyle(selected)}>
        <AppShell role="user" path="/dashboard" unread={2}>
          <GuestDashboard booked={{ 1: true }} />
        </AppShell>
      </BrowserWindow>
    </div>
  );
}

function WaitlistPreview() {
  const [after, setAfter] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const promoteTimer = useRef<number | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    return () => {
      if (promoteTimer.current !== null) window.clearTimeout(promoteTimer.current);
    };
  }, []);

  const play = () => {
    if (promoteTimer.current !== null) {
      window.clearTimeout(promoteTimer.current);
      promoteTimer.current = null;
    }

    if (after) {
      setAfter(false);
      setLeaving(false);
      return;
    }

    setLeaving(true);
    const delay = reduceMotion ? 0 : 480;
    promoteTimer.current = window.setTimeout(() => {
      setAfter(true);
      setLeaving(false);
      promoteTimer.current = null;
    }, delay);
  };

  const registered: ParticipantRow[] = after
    ? [
        { name: 'Mira Kellner', note: 'Nachgerückt · gerade eben', promoted: true },
        { name: 'Anna Reuter', note: 'Angemeldet' },
      ]
    : [
        { name: 'Lena Brandt', note: 'Angemeldet', leaving },
        { name: 'Anna Reuter', note: 'Angemeldet' },
      ];

  const waiting: ParticipantRow[] = after
    ? [{ name: 'Ella Sander', note: 'Position 1' }]
    : [
        { name: 'Mira Kellner', note: 'Position 1' },
        { name: 'Ella Sander', note: 'Position 2' },
      ];

  return (
    <div className="mkt-row2 flip">
      <div className="mkt-txt">
        <h3>Wartelisten, die sich selbst sortieren</h3>
        <p>
          Ein Kurs ist voll, jemand meldet sich ab — die Warteliste rückt nach und die Nächste wird
          benachrichtigt. Ohne dass du eine Nachricht tippst.
        </p>
        <p className="mkt-play">
          <button type="button" className="mkt-btn ghost sm" onClick={play}>
            {after ? 'Nochmal abspielen' : 'Lena meldet sich ab'}
          </button>
        </p>
      </div>
      <BrowserWindow url="yomita.omlify.de/course/1/participants" className="mkt-win-relative">
        <AppShell role="owner" path="/course/1/participants" unread={0}>
          <ParticipantList
            course={VINYASA}
            registered={registered}
            waiting={waiting}
            taken={12}
            showExport={false}
            compact
            registeredMore={10}
          />
        </AppShell>
        <div className={`mkt-toast${after ? ' in' : ''}`} role="status">
          {after ? <span>Mira ist nachgerückt und wurde benachrichtigt.</span> : null}
        </div>
      </BrowserWindow>
    </div>
  );
}

function RolesPreview() {
  const [role, setRole] = useState<AppRole>('owner');

  return (
    <div className="mkt-row2">
      <div className="mkt-txt">
        <h3>Allein oder im Team</h3>
        <p>
          Als selbstständige Lehrerin brauchst du nichts außer dir. Kommen Trainerinnen dazu, bekommen
          sie eigene Zugänge — und sehen genau das, was sie brauchen.
        </p>
        <div className="mkt-rolechips">
          {ROLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mkt-chip"
              aria-pressed={item.id === role}
              onClick={() => setRole(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <BrowserWindow url="yomita.omlify.de/dashboard">
        <AppShell
          role={role}
          path="/dashboard"
          unread={role === 'owner' ? 3 : 0}
          sidebarAsContent
        >
          {role === 'user' ? (
            <GuestDashboard booked={{ 1: true }} />
          ) : (
            <StaffHome name={role === 'owner' ? 'Mila Vogt' : 'Jana Ortmann'} />
          )}
        </AppShell>
      </BrowserWindow>
    </div>
  );
}

export function Promises() {
  return (
    <Section background="bg-sand">
      <Reveal>
        <div className="mkt-eyebrow">Was du bekommst</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Drei Dinge, die den Sonntagabend zurückgeben.</h2>
      </Reveal>
      <Reveal>
        <BrandPreview />
      </Reveal>
      <Reveal>
        <WaitlistPreview />
      </Reveal>
      <Reveal>
        <RolesPreview />
      </Reveal>
    </Section>
  );
}
