import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { FieldError, FormField } from '../ui/FormField';

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
        const normalizedMessage = (error.message || '').toLowerCase();
        const isInvalidCredentials =
          normalizedMessage === 'invalid login credentials' ||
          normalizedMessage === 'e-mail oder passwort ist falsch.';

        if (isInvalidCredentials) {
          setError('E-Mail oder Passwort ist falsch. Bitte überprüfe deine Eingaben.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Bitte bestätige deine E-Mail-Adresse über den Link in deiner E-Mail. Du kannst unten „Bestätigungsmail erneut senden“ nutzen.');
        } else {
          setError(`Anmeldung fehlgeschlagen: ${error.message}`);
        }
      }
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setVerificationEmailMessage('Bitte gib oben deine E-Mail-Adresse ein.');
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
        setVerificationEmailMessage('Falls ein Konto mit dieser E-Mail existiert, wurde eine Bestätigungsmail gesendet. Bitte prüfe dein Postfach und ggf. den Spam-Ordner.');
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
        <FormField
          id="email"
          label="E-Mail-Adresse"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.de"
          required
        />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-[13px] text-textMuted">
              Passwort
            </label>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-sm text-brand hover:text-brandPressed"
            >
              Passwort vergessen?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-textSubtle" aria-hidden />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-form-error' : undefined}
              className={`h-11 w-full rounded-md border bg-surface pl-10 pr-12 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                error ? 'border-danger' : 'border-border'
              }`}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-textSubtle hover:text-textMuted"
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {error ? <FieldError id="login-form-error" message={error} /> : null}
          {error.includes('E-Mail oder Passwort ist falsch') ? (
            <p className="mt-1 text-[13px] text-danger">
              Hinweis: Stell sicher, dass du ein registriertes Konto hast.
            </p>
          ) : null}
          <p className="mt-2 text-sm text-textMuted">
            Bestätigungsmail nicht erhalten?{' '}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={verificationEmailLoading}
              className="text-brand hover:text-brandPressed underline disabled:opacity-50"
            >
              {verificationEmailLoading ? 'Wird gesendet...' : 'Erneut senden'}
            </button>
          </p>
        </div>

        {verificationEmailMessage && (
          <div className={`p-3 rounded-sm text-sm ${verificationEmailMessage.includes('gesendet') ? 'bg-successSoft border border-successSoft text-text' : 'bg-accentSoft border border-accent text-text'}`}>
            {verificationEmailMessage}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-onBrand py-3 px-4 rounded-sm hover:bg-brandPressed focus:ring-4 focus:ring-brandSoft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Anmeldung läuft...' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
