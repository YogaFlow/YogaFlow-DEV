import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Users, BookOpen, Star } from 'lucide-react';
import { APP_BASE_DOMAIN, buildStudioAuthHref } from '../context/TenantContext';

/** Aus Freitext (inkl. URL) den Studio-Slug für die Anmeldung ermitteln. */
function parseStudioSlugInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  const escapedBase = APP_BASE_DOMAIN.replace(/\./g, '\\.');
  s = s.replace(new RegExp(`\\.${escapedBase}(/.*)?$`), '');
  s = s.replace(/[^a-z0-9]/g, '');
  return s.slice(0, 30);
}

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Kursverwaltung',
    desc: 'Einzel- und Serientermine, automatische Wartelisten und Teilnehmerbenachrichtigungen.',
  },
  {
    icon: Users,
    title: 'Team & Rollen',
    desc: 'Owner, Admins, Lehrer und Teilnehmer – jeder sieht genau das, was er braucht.',
  },
  {
    icon: Star,
    title: 'Eigene Subdomain',
    desc: `Dein Studio unter eigenem Namen: studio.${APP_BASE_DOMAIN} – professionell vom ersten Tag an.`,
  },
];

const SLUG_PATTERN = /^[a-z0-9]{3,30}$/;

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [slugInput, setSlugInput] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const goToStudioLogin = () => {
    const slug = parseStudioSlugInput(slugInput);
    if (!SLUG_PATTERN.test(slug)) {
      setSlugError('Bitte gib den Namen deiner Studio-Webadresse ein (3–30 Zeichen, nur Kleinbuchstaben und Zahlen).');
      return;
    }
    setSlugError(null);
    window.location.href = buildStudioAuthHref(slug);
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugInput(e.target.value);
    if (slugError) setSlugError(null);
  };

  const handleSlugKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToStudioLogin();
    }
  };

  return (
    <div className="min-h-screen bg-sand">
      <header className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center">
              <Heart className="w-5 h-5 text-onBrand" />
            </div>
            <span className="font-bold text-text text-lg">Omlify</span>
          </div>

          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <label htmlFor="landing-studio-slug" className="sr-only">
              Studio-Webadresse
            </label>
            <div className="flex items-center gap-2">
              <input
                id="landing-studio-slug"
                type="text"
                value={slugInput}
                onChange={handleSlugChange}
                onKeyDown={handleSlugKeyDown}
                autoComplete="off"
                placeholder="dein-studio"
                className="w-44 px-3 py-2 text-sm border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <span className="text-xs text-textMuted">.{APP_BASE_DOMAIN}</span>
            </div>
            <button
              type="button"
              onClick={goToStudioLogin}
              className="text-sm font-medium text-onBrand bg-brand hover:bg-brandPressed px-4 py-2 rounded-sm transition-colors whitespace-nowrap"
            >
              Zum Studio-Login
            </button>
          </div>
        </div>

        <div className="mt-4 sm:hidden">
          <label htmlFor="landing-studio-slug-mobile" className="block text-xs font-medium text-textMuted mb-1.5">
            Studio-Webadresse
          </label>
          <div className="flex gap-2">
            <div className="flex flex-1 min-w-0 items-center rounded-sm border border-border bg-surface focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent">
              <input
                id="landing-studio-slug-mobile"
                type="text"
                value={slugInput}
                onChange={handleSlugChange}
                onKeyDown={handleSlugKeyDown}
                autoComplete="off"
                placeholder="dein-studio"
                className="min-w-0 flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none"
              />
              <span className="shrink-0 border-l border-border px-2.5 py-2.5 text-xs text-textMuted">
                .{APP_BASE_DOMAIN}
              </span>
            </div>
            <button
              type="button"
              onClick={goToStudioLogin}
              className="shrink-0 text-sm font-medium text-onBrand bg-brand hover:bg-brandPressed px-4 py-2.5 rounded-sm transition-colors"
            >
              Login
            </button>
          </div>
          {slugError && (
            <p className="mt-2 text-xs text-danger leading-snug">{slugError}</p>
          )}
        </div>

        {slugError && (
          <p className="hidden sm:block mt-2 text-xs text-danger text-right leading-snug">{slugError}</p>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-10 lg:gap-12 xl:gap-14 items-center">
          <div className="text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-text leading-tight tracking-tight">
              Finden Sie Ihre Balance mit{' '}
              <span className="text-brand">Omlify</span>
            </h1>
            <p className="mt-6 text-lg text-textMuted leading-relaxed max-w-xl">
              Die intuitive Management-Plattform für moderne Yoga-Studios. Verwalten Sie Kurse,
              Teams und Ihre eigene Marke an einem zentralen Ort.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => navigate('/onboarding?newStudio=1')}
                className="bg-brand text-onBrand px-8 py-3.5 rounded-sm text-base font-semibold hover:bg-brandPressed transition-colors"
              >
                Jetzt kostenlos starten
              </button>
              <p className="mt-4 text-sm text-textMuted">
                Keine Kreditkarte nötig · Jederzeit kündbar
              </p>
            </div>
          </div>
          <div className="relative w-full max-w-3xl mx-auto lg:mx-0 lg:max-w-none xl:min-w-[min(100%,720px)]">
            <div className="bg-surface rounded-md border border-border p-1">
              <img
                src="/hero-dashboard.png"
                srcSet="/hero-dashboard.png 971w, /hero-dashboard@2x.png 1942w"
                sizes="(min-width: 1280px) 720px, (min-width: 1024px) 55vw, 100vw"
                width={971}
                height={578}
                alt="Omlify Dashboard – Kursübersicht und Studio-Verwaltung"
                className="w-full h-auto rounded-md [image-rendering:-webkit-optimize-contrast]"
                fetchpriority="high"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </main>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-surface rounded-md p-3.5 border border-border">
            <div className="w-12 h-12 bg-sage-100 rounded-sm flex items-center justify-center mb-4">
              <Icon className="w-6 h-6 text-brand" />
            </div>
            <h3 className="font-semibold text-text text-lg mb-2">{title}</h3>
            <p className="text-textMuted text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-textMuted">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a href="/legal/agb" className="hover:text-textMuted">AGB</a>
          <a href="/legal/datenschutz" className="hover:text-textMuted">Datenschutz</a>
        </div>
        <p>© 2026 Omlify – Professionelles Studio-Management</p>
      </footer>
    </div>
  );
};

export default LandingPage;
