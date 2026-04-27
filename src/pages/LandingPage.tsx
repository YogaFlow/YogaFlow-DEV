import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Users, BookOpen, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildStudioEntryHref } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

const BASE_DOMAIN = import.meta.env.VITE_APP_BASE_DOMAIN as string || 'omlify.de';

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
    desc: `Dein Studio unter eigenem Namen: studio.${BASE_DOMAIN} – professionell vom ersten Tag an.`,
  },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isEmailConfirmed, userProfile, signOut, loading: authLoading } = useAuth();
  const [studioSlug, setStudioSlug] = useState<string | null>(null);
  const [slugLoading, setSlugLoading] = useState(false);

  useEffect(() => {
    if (!user || !isEmailConfirmed || !userProfile?.tenant_id) {
      setStudioSlug(null);
      return;
    }
    let cancelled = false;
    setSlugLoading(true);
    supabase
      .from('tenants')
      .select('slug')
      .eq('id', userProfile.tenant_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('LandingPage: tenant slug', error);
        setStudioSlug(data?.slug ?? null);
      })
      .finally(() => {
        if (!cancelled) setSlugLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isEmailConfirmed, userProfile?.tenant_id]);

  const showStudioCta = !!user && isEmailConfirmed && !!userProfile?.tenant_id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">YogaFlow</span>
        </div>
        <div className="flex items-center gap-4">
          {authLoading ? (
            <span className="text-sm text-gray-400">…</span>
          ) : showStudioCta ? (
            <>
              {studioSlug && !slugLoading ? (
                <a
                  href={buildStudioEntryHref(studioSlug)}
                  className="text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Mein Studio öffnen
                </a>
              ) : slugLoading ? (
                <span className="text-sm text-gray-500">Studio wird geladen…</span>
              ) : (
                <span className="text-xs text-amber-800 max-w-[200px] text-right leading-snug">
                  Studio-Adresse konnte nicht geladen werden.
                </span>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
              >
                Abmelden
              </button>
            </>
          ) : (
            <a href="/auth" className="text-sm text-teal-600 hover:underline font-medium">
              Anmelden
            </a>
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
