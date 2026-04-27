import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ChevronRight, ChevronLeft, Check, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const BASE_DOMAIN = import.meta.env.VITE_APP_BASE_DOMAIN as string || 'omlify.de';

const STEPS = ['Studio-Name', 'Studio-URL', 'Dein Name', 'Zugangsdaten', 'Zusammenfassung'];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const OnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const [step, setStep] = useState(1);

  const [studioName, setStudioName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [slugTouched, setSlugTouched] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [agbAccepted, setAgbAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-suggest slug from studio name (only before user has touched the slug field)
  useEffect(() => {
    if (studioName && !slugTouched) {
      setSlug(slugify(studioName));
    }
  }, [studioName, slugTouched]);

  // Slug live-check
  useEffect(() => {
    if (!slug) {
      setSlugStatus('idle');
      return;
    }
    if (!/^[a-z0-9]{3,30}$/.test(slug)) {
      setSlugStatus('invalid');
      return;
    }

    setSlugStatus('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_slug_available', { p_slug: slug });
      if (error) { setSlugStatus('idle'); return; }
      setSlugStatus(data ? 'available' : 'taken');
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [slug]);

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return studioName.trim().length >= 2;
      case 2: return slugStatus === 'available';
      case 3: return firstName.trim().length >= 1 && lastName.trim().length >= 1;
      case 4:
        return (
          email.includes('@') &&
          password.length >= 8 &&
          password === passwordConfirm
        );
      case 5: return agbAccepted;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // 1. Tenant anlegen
    const { data: rpcResult, error: rpcError } = await supabase.rpc('begin_tenant_onboarding', {
      p_name: studioName.trim(),
      p_slug: slug,
    });

    if (rpcError || !rpcResult?.success) {
      setSubmitError(rpcResult?.message ?? 'Studio konnte nicht angelegt werden.');
      setIsSubmitting(false);
      return;
    }

    const tenantId: string = rpcResult.tenant_id;

    // 2. Auth-Nutzer anlegen (Trigger liest role aus Metadata und setzt 'owner')
    const emailRedirectTo = import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.host}/?tenant=${slug}`
      : `https://${slug}.${BASE_DOMAIN}/dashboard`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          tenant_id: tenantId,
          role: 'owner',
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });

    if (signUpError) {
      // Kompensation: Tenant löschen wenn noch kein User existiert
      await supabase.rpc('cancel_tenant_onboarding', { p_tenant_id: tenantId });
      setSubmitError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    setSuccess(true);
    setIsSubmitting(false);
  };

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <LogOut className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Du bist bereits angemeldet</h2>
          <p className="text-gray-600 mb-6">
            Du bist aktuell als <strong>{userProfile?.email ?? user.email}</strong> eingeloggt.
            Um ein neues Studio anzulegen, melde dich zuerst ab.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-teal-600 text-white py-3 rounded-xl hover:bg-teal-700 transition-colors"
            >
              Zurück zum Dashboard
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.replace('/onboarding'); }}
              className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Abmelden und neues Studio anlegen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Fast geschafft!</h2>
          <p className="text-gray-600 mb-4">
            Wir haben eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet.
          </p>
          <p className="text-gray-500 text-sm">
            Bitte bestätige deine E-Mail-Adresse, um dein Studio freizuschalten. Danach
            kannst du dich unter{' '}
            <span className="font-mono text-teal-700">
              {slug}.{BASE_DOMAIN}
            </span>{' '}
            einloggen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo + Fortschritt */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-teal-600 rounded-full mb-4">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Studio einrichten</h1>
          <p className="text-gray-500 text-sm mt-1">
            Schritt {step} von {STEPS.length}: {STEPS[step - 1]}
          </p>
        </div>

        {/* Progress-Bar */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-teal-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wie heißt dein Studio?
              </label>
              <input
                type="text"
                value={studioName}
                onChange={e => setStudioName(e.target.value)}
                placeholder="z.B. Sonnenstudio München"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                Dieser Name ist für deine Teilnehmer sichtbar.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deine Studio-URL
              </label>
              <div className="flex items-stretch border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
                <input
                  type="text"
                  value={slug}
                  onChange={e => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="mein-studio"
                  className="flex-1 px-4 py-3 focus:outline-none"
                  autoFocus
                />
                <span className="px-3 flex items-center text-gray-400 text-sm bg-gray-50 border-l border-gray-300">
                  .{BASE_DOMAIN}
                </span>
              </div>

              <div className="mt-2 min-h-[16px] text-xs flex items-center gap-1.5">
                {slugStatus === 'checking' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                    <span className="text-gray-500">Wird geprüft…</span>
                  </>
                )}
                {slugStatus === 'available' && (
                  <>
                    <Check className="w-3 h-3 text-teal-600" />
                    <span className="text-teal-600">Verfügbar</span>
                  </>
                )}
                {slugStatus === 'taken' && (
                  <span className="text-red-500">
                    Bereits vergeben – bitte wähle einen anderen Namen.
                  </span>
                )}
                {slugStatus === 'invalid' && (
                  <span className="text-red-500">
                    Nur Kleinbuchstaben und Ziffern, 3–30 Zeichen.
                  </span>
                )}
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Dein Studio wird erreichbar sein unter:{' '}
                <span className="font-mono text-teal-700">
                  {slug || '…'}.{BASE_DOMAIN}
                </span>
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vorname</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nachname</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Passwort bestätigen
                </label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    passwordConfirm && password !== passwordConfirm
                      ? 'border-red-300'
                      : 'border-gray-300'
                  }`}
                />
                {passwordConfirm && password !== passwordConfirm && (
                  <p className="mt-1 text-xs text-red-500">
                    Passwörter stimmen nicht überein.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2 text-sm">
                {[
                  { label: 'Studio-Name', value: studioName },
                  { label: 'Studio-URL', value: `${slug}.${BASE_DOMAIN}`, mono: true },
                  { label: 'Name', value: `${firstName} ${lastName}` },
                  { label: 'E-Mail', value: email },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">{label}</span>
                    <span
                      className={`font-medium truncate ${
                        mono ? 'font-mono text-teal-700' : 'text-gray-900'
                      }`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">
                  Ich akzeptiere die{' '}
                  <a
                    href="/legal/agb"
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    AGB
                  </a>{' '}
                  und die{' '}
                  <a
                    href="/legal/datenschutz"
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    Datenschutzerklärung
                  </a>
                  .
                </span>
              </label>

              {submitError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : navigate('/'))}
            className="flex items-center gap-1.5 px-5 py-2.5 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Zurück zur Startseite' : 'Zurück'}
          </button>

          {step < STEPS.length ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance()}
              className="flex items-center gap-1.5 bg-teal-600 text-white px-6 py-2.5 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Weiter
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canAdvance() || isSubmitting}
              className="flex items-center gap-1.5 bg-teal-600 text-white px-6 py-2.5 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird erstellt…
                </>
              ) : (
                <>
                  Studio einrichten
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
