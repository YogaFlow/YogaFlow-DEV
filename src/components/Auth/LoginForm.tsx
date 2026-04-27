import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ONBOARDING_SLUG_KEY = 'yogaflow_onboarding_slug';
const SLUG_BODY = /^[a-z0-9]{3,30}$/;

type LoginFormProps = {
  /** Nach erfolgreicher E-Mail-Verifizierung: alte Login-Fehler ausblenden */
  emailJustVerified?: boolean;
};

const LoginForm: React.FC<LoginFormProps> = ({ emailJustVerified = false }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationEmailLoading, setVerificationEmailLoading] = useState(false);
  const [verificationEmailMessage, setVerificationEmailMessage] = useState('');

  const { signIn } = useAuth();
  const { tenantSlug } = useTenant();

  useEffect(() => {
    if (emailJustVerified) setError('');
  }, [emailJustVerified]);

  const studioSlugHint = (): string | null => {
    const fromHost = tenantSlug?.trim().toLowerCase() ?? '';
    if (fromHost && SLUG_BODY.test(fromHost)) return fromHost;
    try {
      const s = sessionStorage.getItem(ONBOARDING_SLUG_KEY)?.trim().toLowerCase() ?? '';
      if (s && SLUG_BODY.test(s)) return s;
    } catch {
      /* sessionStorage nicht verfügbar */
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerificationEmailMessage('');

    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message === 'Invalid login credentials') {
          setError('E-Mail oder Passwort ist falsch. Bitte überprüfen Sie Ihre Eingaben.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Bitte bestätigen Sie Ihre E-Mail-Adresse über den Link in Ihrer E-Mail. Sie können unten „Bestätigungsmail erneut senden“ nutzen.');
        } else {
          setError(`Anmeldung fehlgeschlagen: ${error.message}`);
        }
      }
    } catch (err) {
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setVerificationEmailMessage('Bitte geben Sie oben Ihre E-Mail-Adresse ein.');
      return;
    }
    setVerificationEmailLoading(true);
    setVerificationEmailMessage('');
    setError('');
    const slugHint = studioSlugHint();
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-verification-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: email.trim(),
            ...(slugHint ? { studio_slug: slugHint } : {}),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVerificationEmailMessage('Falls ein Konto mit dieser E-Mail existiert, wurde eine Bestätigungsmail gesendet. Bitte prüfen Sie Ihr Postfach.');
      } else {
        setVerificationEmailMessage(data?.error || 'Bestätigungsmail konnte nicht gesendet werden.');
      }
    } catch {
      setVerificationEmailMessage('Verbindungsfehler. Bitte später erneut versuchen.');
    } finally {
      setVerificationEmailLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            E-Mail-Adresse
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="ihre@email.de"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Passwort
            </label>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              Passwort vergessen?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Bestätigungsmail nicht erhalten?{' '}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={verificationEmailLoading}
              className="text-teal-600 hover:text-teal-700 underline disabled:opacity-50"
            >
              {verificationEmailLoading ? 'Wird gesendet...' : 'Erneut senden'}
            </button>
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
           {error.includes('E-Mail oder Passwort ist falsch') && (
             <p className="text-xs text-red-500 mt-1">
               Hinweis: Stellen Sie sicher, dass Sie ein registriertes Konto haben.
             </p>
           )}
          </div>
        )}
        {verificationEmailMessage && (
          <div className={`p-3 rounded-lg text-sm ${verificationEmailMessage.includes('gesendet') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
            {verificationEmailMessage}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Anmeldung läuft...' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;