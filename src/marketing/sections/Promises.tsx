import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BRAND_PRESETS, deriveBrandTokens } from '../../design/brand';
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
    brandSoft: tokens.brandSoft,
    brandOnSoft: tokens.brandOnSoft,
  };
});

function brandWindowStyle(swatch: (typeof SWATCHES)[number]): CSSProperties {
  return {
    '--color-brand': swatch.brand,
    '--color-brand-soft': swatch.brandSoft,
    '--color-brand-on-soft': swatch.brandOnSoft,
  } as CSSProperties;
}

const COURSES = [
  { weekday: 'Do', day: '18', month: 'Sep', title: 'Vinyasa Flow', price: '18 €', meta: '18:30 bis 19:45' },
  {
    weekday: 'Sa',
    day: '20',
    month: 'Sep',
    title: 'Hatha für Einsteiger',
    price: '15 €',
    meta: '10:00 bis 11:15',
    pill: 'noch 2 Plätze',
  },
] as const;

type WaitlistState = 'voll' | 'nachgerueckt';

const ROLES = [
  {
    name: 'Inhaberin',
    items: [
      { label: 'Übersicht', on: true },
      { label: 'Kurse', on: false },
      { label: 'Teilnehmer', on: false },
      { label: 'Trainer', on: false },
      { label: 'Nachrichten', on: false },
      { label: 'Einstellungen', on: false },
    ],
  },
  {
    name: 'Trainerin',
    items: [
      { label: 'Meine Kurse', on: true },
      { label: 'Teilnehmerliste', on: false },
      { label: 'Nachrichten', on: false },
      { label: 'Profil', on: false },
    ],
  },
  {
    name: 'Teilnehmerin',
    items: [
      { label: 'Kurse buchen', on: true },
      { label: 'Meine Anmeldungen', on: false },
      { label: 'Profil', on: false },
    ],
  },
] as const;

function BookingPreview() {
  const [selectedId, setSelectedId] = useState<(typeof SWATCHES)[number]['id']>('sage');
  const selected = SWATCHES.find((item) => item.id === selectedId) ?? SWATCHES[0];

  return (
    <div className="mkt-row2">
      <div className="mkt-txt">
        <h3>Deine eigene Buchungsseite</h3>
        <p>
          Unter deiner Adresse, mit deinem Logo und deiner Farbe. Deine Teilnehmer buchen bei dir — nicht
          auf einem Portal, das ihnen nebenbei drei andere Studios vorschlägt.
        </p>
        <div className="mkt-swatches">
          <span className="mkt-swlab">Farbe wählen</span>
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
      <BrowserWindow url="yomita.omlify.de" style={brandWindowStyle(selected)}>
        <div className="mkt-studio" aria-hidden="true">
          <div className="mkt-studiohead">
            <span className="mkt-slogo">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
            </span>
            <div>
              <div className="mkt-sname">Yoga mit Mila</div>
              <div className="mkt-ssub">Kurse buchen</div>
            </div>
          </div>
          <div className="mkt-list">
            {COURSES.map((course) => (
              <div key={course.title} className="mkt-cr">
                <div className="mkt-dateblk">
                  <div className="w">{course.weekday}</div>
                  <div className="d">{course.day}</div>
                  <div className="m">{course.month}</div>
                </div>
                <div className="mkt-crm">
                  <div className="mkt-crt">
                    <h4>{course.title}</h4>
                    <span className="pr">{course.price}</span>
                  </div>
                  <div className="mkt-meta">{course.meta}</div>
                  {'pill' in course ? <span className="mkt-pill">{course.pill}</span> : null}
                </div>
                <div className="mkt-chev">›</div>
              </div>
            ))}
          </div>
        </div>
      </BrowserWindow>
    </div>
  );
}

function WaitlistPreview() {
  const [state, setState] = useState<WaitlistState>('voll');
  const [promoted, setPromoted] = useState(false);
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

    if (state === 'nachgerueckt') {
      setState('voll');
      setPromoted(false);
      return;
    }

    setState('nachgerueckt');
    const delay = reduceMotion ? 0 : 520;
    promoteTimer.current = window.setTimeout(() => {
      setPromoted(true);
      promoteTimer.current = null;
    }, delay);
  };

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
            {state === 'nachgerueckt' ? 'Nochmal abspielen' : 'Lena meldet sich ab'}
          </button>
        </p>
      </div>
      <BrowserWindow url="Kurs · Vinyasa Flow, Do 18. Sep" className="mkt-win-relative">
        <div className="mkt-studio" aria-hidden="true">
          <div className="mkt-list">
            <div className="mkt-cr">
              <div className="mkt-dateblk">
                <div className="w">Do</div>
                <div className="d">18</div>
                <div className="m">Sep</div>
              </div>
              <div className="mkt-crm">
                <div className="mkt-crt">
                  <h4>Vinyasa Flow · Mittelstufe</h4>
                  <span className="pr">18 €</span>
                </div>
                <div className="mkt-meta">18:30 bis 19:45 · 12 von 12 Plätzen</div>
                <span className={`mkt-pill${promoted ? ' ok' : ''}`}>
                  {promoted ? 'Voll besetzt' : 'Ausgebucht'}
                </span>
              </div>
              <div className="mkt-chev">›</div>
            </div>
            <div className={`mkt-cr${state === 'nachgerueckt' ? ' is-leaving' : ''}`}>
              <div className="mkt-dateblk neutral">
                <div className="w">&nbsp;</div>
                <div className="d">L</div>
                <div className="m">&nbsp;</div>
              </div>
              <div className="mkt-crm">
                <div className="mkt-crt">
                  <h4>Lena Brandt</h4>
                </div>
                <div className="mkt-meta">Angemeldet · seit 2. Sep</div>
              </div>
            </div>
            <div className="mkt-cr">
              <div className="mkt-dateblk neutral">
                <div className="w">&nbsp;</div>
                <div className="d">M</div>
                <div className="m">&nbsp;</div>
              </div>
              <div className="mkt-crm">
                <div className="mkt-crt">
                  <h4>Mira Kellner</h4>
                </div>
                <div className="mkt-meta">
                  {promoted ? 'Angemeldet · nachgerückt' : 'Warteliste · Position 1'}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={`mkt-toast${promoted ? ' in' : ''}`} role="status">
          {promoted ? (
            <>
              <span aria-hidden="true">✓</span>
              <span>Mira ist nachgerückt und wurde benachrichtigt.</span>
            </>
          ) : null}
        </div>
      </BrowserWindow>
    </div>
  );
}

function RolesPreview() {
  const [roleIndex, setRoleIndex] = useState(0);
  const role = ROLES[roleIndex];

  return (
    <div className="mkt-row2">
      <div className="mkt-txt">
        <h3>Allein oder im Team</h3>
        <p>
          Als selbstständige Lehrerin brauchst du nichts außer dir. Kommen Trainerinnen dazu, bekommen sie
          eigene Zugänge — und sehen genau das, was sie brauchen.
        </p>
        <div className="mkt-rolechips">
          {ROLES.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className="mkt-chip"
              aria-pressed={index === roleIndex}
              onClick={() => setRoleIndex(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <BrowserWindow url={`yomita.omlify.de · ${role.name}`}>
        <div className="mkt-studio" aria-hidden="true">
          <div className="mkt-navlist">
            {role.items.map((item) => (
              <div key={item.label} className={`mkt-navitem${item.on ? ' on' : ''}`}>
                <span className="mkt-navdot" />
                {item.label}
              </div>
            ))}
          </div>
        </div>
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
        <BookingPreview />
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
