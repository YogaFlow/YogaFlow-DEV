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

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">YogaFlow</span>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <label htmlFor="landing-studio-slug" className="text-xs text-gray-500 sm:sr-only">
              Studio-Webadresse
            </label>
            <div className="flex items-center gap-2">
              <input
                id="landing-studio-slug"
                type="text"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  if (slugError) setSlugError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    goToStudioLogin();
                  }
                }}
                autoComplete="off"
                placeholder="dein-studio"
                className="w-36 sm:w-44 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <span className="text-xs text-gray-500 hidden sm:inline">.{APP_BASE_DOMAIN}</span>
            </div>
            <button
              type="button"
              onClick={goToStudioLogin}
              className="text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              Zum Studio-Login
            </button>
          </div>
          {slugError && (
            <p className="text-xs text-red-600 max-w-[min(100vw-3rem,20rem)] text-right leading-snug">{slugError}</p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          Yoga-Studio-Management,<br />das einfach funktioniert
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Kurse verwalten, Teilnehmer buchen, Team koordinieren – alles an einem Ort.
          Starte kostenlos in unter 5 Minuten.
        </p>
        <button
          onClick={() => navigate('/onboarding')}
          className="bg-teal-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-teal-700 transition-colors shadow-lg"
        >
          Jetzt kostenlos starten
        </button>
        <p className="mt-4 text-sm text-gray-500">Keine Kreditkarte nötig · Jederzeit kündbar</p>
      </main>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center mb-4">
              <Icon className="w-6 h-6 text-teal-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">{title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a href="/legal/agb" className="hover:text-gray-700">AGB</a>
          <a href="/legal/datenschutz" className="hover:text-gray-700">Datenschutz</a>
        </div>
        <p>© 2026 YogaFlow – Professionelles Studio-Management</p>
      </footer>
    </div>
  );
};

export default LandingPage;
