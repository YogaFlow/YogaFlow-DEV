import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant, APP_BASE_DOMAIN } from '../context/TenantContext';

type AccessNotice = 'wrong_studio' | 'profile_missing' | null;

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loginFormKey, setLoginFormKey] = useState(0);
  const [showVerifiedMessage, setShowVerifiedMessage] = useState(false);
  const [accessNotice, setAccessNotice] = useState<AccessNotice>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userProfile, loading, isEmailConfirmed, signOut } = useAuth();
  const { tenantSlug, tenant, loading: tenantLoading, notFound, lookupError } = useTenant();
  const navigate = useNavigate();

  const isApexAuth = !tenantSlug;

  // Auf der Marketing-Domain nur Anmeldung (Registrierung läuft über /onboarding).
  useEffect(() => {
    if (isApexAuth) setIsLogin(true);
  }, [isApexAuth]);

  // Subdomain: während Tenant aus DB lädt nur Login (Registrierung braucht tenant)
  const tenantPending = !!tenantSlug && tenantLoading && !notFound;
  useEffect(() => {
    if (tenantPending) setIsLogin(true);
  }, [tenantPending]);

  // Query-Flags von geschützten Routen (falscher Mandant / kein public.users-Profil)
  useEffect(() => {
    if (loading) return;
    const wrong = searchParams.get('wrong_studio') === '1';
    const missing = searchParams.get('profile_missing') === '1';
    if (!wrong && !missing) return;
    setAccessNotice(missing ? 'profile_missing' : 'wrong_studio');
    setSearchParams({}, { replace: true });
    if (user) void signOut();
  }, [loading, user, searchParams, setSearchParams, signOut]);

  // Direkt /auth auf falscher Subdomain (ohne Query): Session gehört zu anderem Tenant
  useEffect(() => {
    if (loading || tenantLoading || notFound || !tenantSlug || !tenant || !user || !isEmailConfirmed || !userProfile) {
      return;
    }
    if (userProfile.tenant_id === tenant.id) return;
    setAccessNotice('wrong_studio');
    void signOut();
  }, [
    loading,
    tenantLoading,
    notFound,
    tenantSlug,
    tenant,
    user,
    isEmailConfirmed,
    userProfile,
    signOut,
  ]);

  // Nur bei passendem Mandant: Subdomain → Dashboard, Apex → Landing
  useEffect(() => {
    if (loading) return;
    if (!user || !isEmailConfirmed) return;
    if (!tenantSlug) {
      navigate('/', { replace: true });
      return;
    }
    if (tenantLoading || notFound || !tenant) return;
    if (!userProfile || userProfile.tenant_id !== tenant.id) return;
    navigate('/dashboard', { replace: true });
  }, [
    loading,
    user,
    isEmailConfirmed,
    userProfile,
    tenantSlug,
    tenantLoading,
    notFound,
    tenant,
    navigate,
  ]);

  // Falls der Passwort-Reset-Link versehentlich auf /auth zeigt: zur Reset-Seite weiterleiten
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      navigate(`/reset-password?token=${encodeURIComponent(token)}`, { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      setShowVerifiedMessage(true);
      setLoginFormKey((k) => k + 1);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (tenantSlug && lookupError) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Studio konnte nicht geladen werden</h1>
        <p className="text-gray-600 text-sm max-w-lg leading-relaxed">{lookupError}</p>
        <p className="text-gray-500 text-xs max-w-md mt-3">
          Wenn der Eintrag in Supabase sichtbar ist: Live-Build muss dieselbe Supabase-URL und denselben Anon-Key
          nutzen (Cloudflare Pages → Environment variables).
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-teal-600 text-white px-4 py-2 text-sm font-medium hover:bg-teal-700"
        >
          Neu laden
        </button>
        <a href={`https://${APP_BASE_DOMAIN}`} className="mt-3 text-teal-600 hover:underline text-sm font-medium">
          Zur Startseite
        </a>
      </div>
    );
  }

  if (tenantSlug && notFound) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Studio nicht gefunden</h1>
        <p className="text-gray-500 max-w-md">
          Unter der Adresse <span className="font-mono">{tenantSlug}</span> ist in der von der App angesprochenen
          Datenbank kein Studio eingetragen.
        </p>
        <a
          href={`https://${APP_BASE_DOMAIN}`}
          className="mt-6 text-teal-600 hover:underline font-medium"
        >
          Zur Startseite
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-full mb-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Yoga Kursverwaltung
          </h1>
          <p className="text-gray-600">
            Verwalten Sie Ihre Yoga-Kurse professionell und einfach
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {isApexAuth ? (
            <div className="border-b border-gray-200 py-4 px-6 text-center">
              <h2 className="text-lg font-semibold text-gray-900">Anmelden</h2>
              <p className="text-sm text-gray-500 mt-1">
                Neues Studio?{' '}
                <a href="/onboarding" className="text-teal-600 hover:text-teal-700 font-medium">
                  Jetzt kostenlos starten
                </a>
              </p>
            </div>
          ) : tenantPending ? (
            <div className="border-b border-gray-200 py-4 px-6 text-center">
              <h2 className="text-lg font-semibold text-gray-900">Anmelden</h2>
              <p className="text-sm text-gray-500 mt-1">Studio wird geladen …</p>
            </div>
          ) : (
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  isLogin
                    ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Anmelden
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  !isLogin
                    ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Registrieren
              </button>
            </div>
          )}

          {showVerifiedMessage && (
            <div className="mx-8 mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center text-green-800 text-sm">
              E-Mail bestätigt. Sie können sich jetzt anmelden.
            </div>
          )}
          {accessNotice === 'wrong_studio' && (
            <div className="mx-8 mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
              <p className="font-medium mb-1">Falsche Studio-Adresse</p>
              <p>
                Dieses Konto ist nicht für die Studio-URL{' '}
                {tenantSlug ? <span className="font-mono">{tenantSlug}</span> : ''} registriert. Bitte nutze die
                Subdomain des Studios, zu dem dein Konto gehört, oder ein anderes Konto.
              </p>
              <button
                type="button"
                onClick={() => setAccessNotice(null)}
                className="mt-3 text-teal-700 font-medium hover:underline"
              >
                Hinweis schließen
              </button>
            </div>
          )}
          {accessNotice === 'profile_missing' && (
            <div className="mx-8 mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
              <p className="font-medium mb-1">Profil unvollständig</p>
              <p>
                Für dein Konto existiert kein Eintrag in der Studio-Datenbank (z.&nbsp;B. abgebrochene Registrierung).
                Bitte lege dein Studio über die Startseite (Jetzt kostenlos starten) erneut an oder wende dich an den
                Support.
              </p>
              <button
                type="button"
                onClick={() => setAccessNotice(null)}
                className="mt-3 text-teal-700 font-medium hover:underline"
              >
                Hinweis schließen
              </button>
            </div>
          )}
          <div className="p-8 flex justify-center">
            {isLogin || tenantPending ? <LoginForm key={loginFormKey} /> : <RegisterForm />}
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>© 2025 Yoga Kursverwaltung - Professionelle Lösung für Yoga-Lehrer</p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;