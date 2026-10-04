import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { FieldError, FormField } from '../ui/FormField';

type RegisterFormProps = {
  onSwitchToLogin?: () => void;
};

const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSentOnSignup, setEmailSentOnSignup] = useState(true);

  const { signUp, signOut } = useAuth();
  const { tenant } = useTenant();

  const handleChange = (e: React.FormEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      setLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      setLoading(false);
      return;
    }
    if (!tenant) {
      setError('Kein Studio-Kontext gefunden. Bitte öffne die Seite über deine Studio-URL.');
      setLoading(false);
      return;
    }

    const duplicateJoinHint =
      `Diese E-Mail hat bereits ein Omlify-Konto. Melde dich an, um ${tenant?.name ?? 'diesem Studio'} beizutreten.`;

    try {
      const { data, error: signUpError } = await signUp(formData.email, formData.password, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        tenant_id: tenant.id,
      });

      if (signUpError) {
        const msg = (signUpError as { message?: string }).message ?? '';
        if (/already registered|already exists|already in use/i.test(msg)) {
          setError(duplicateJoinHint);
          onSwitchToLogin?.();
        } else if (/rate limit exceeded/i.test(msg)) {
          setError(
            'Zu viele Registrierungsversuche. Bitte warte etwa eine Stunde und versuche es erneut.',
          );
        } else {
          setError(`Registrierung fehlgeschlagen.${msg ? ` (${msg})` : ''}`);
        }
        return;
      }

      const identities = (data?.user as { identities?: unknown[] })?.identities;
      if (data?.user && Array.isArray(identities) && identities.length === 0) {
        setError(duplicateJoinHint);
        onSwitchToLogin?.();
        return;
      }

      if (data?.user) {
        let emailSent = false;
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                userId: data.user.id,
                email: formData.email,
                studio_slug: tenant.slug,
              }),
            },
          );
          emailSent = res.ok;
        } catch {
          // Verification email failure is non-fatal
        }
        setEmailSentOnSignup(emailSent);
        setSuccess(true);
        await signOut();
      }
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="p-3.5 bg-successSoft border border-successSoft rounded-md">
          <h3 className="text-lg font-semibold text-text mb-2">Registrierung erfolgreich!</h3>
          {emailSentOnSignup ? (
            <p className="text-sm text-text">
              Wir haben eine Bestätigungsmail an <strong>{formData.email}</strong> gesendet.
              Bitte klicke auf den Link in der E-Mail, um dein Konto zu aktivieren.
              Danach kannst du dich hier anmelden.
            </p>
          ) : (
            <p className="text-sm text-text">
              Dein Konto wurde erstellt. Nutze auf der Anmeldeseite
              „Bestätigungsmail erneut senden", um den Bestätigungslink zu erhalten.
            </p>
          )}
        </div>
      </div>
    );
  }

  const passwordMismatch = error === 'Die Passwörter stimmen nicht überein.';
  const passwordTooShort = error === 'Das Passwort muss mindestens 6 Zeichen lang sein.';
  const formError = error && !passwordMismatch && !passwordTooShort ? error : '';

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            id="first_name"
            name="first_name"
            label="Vorname *"
            type="text"
            value={formData.first_name}
            onChange={handleChange}
            required
          />
          <FormField
            id="last_name"
            name="last_name"
            label="Nachname *"
            type="text"
            value={formData.last_name}
            onChange={handleChange}
            required
          />
        </div>

        <FormField
          id="email"
          name="email"
          label="E-Mail-Adresse *"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <div>
          <label htmlFor="password" className="block">
            <span className="mb-1 block text-[13px] text-textMuted">Passwort *</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-textSubtle" aria-hidden />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                placeholder="Mindestens 6 Zeichen"
                aria-invalid={passwordTooShort || undefined}
                aria-describedby={passwordTooShort ? 'password-error' : undefined}
                className={`h-11 w-full rounded-md border bg-surface pl-10 pr-12 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  passwordTooShort ? 'border-danger' : 'border-border'
                }`}
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
          </label>
          {passwordTooShort ? <FieldError id="password-error" message={error} /> : null}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block">
            <span className="mb-1 block text-[13px] text-textMuted">Passwort bestätigen *</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-textSubtle" aria-hidden />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                aria-invalid={passwordMismatch || undefined}
                aria-describedby={passwordMismatch ? 'confirmPassword-error' : undefined}
                className={`h-11 w-full rounded-md border bg-surface pl-10 pr-12 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  passwordMismatch ? 'border-danger' : 'border-border'
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-textSubtle hover:text-textMuted"
                aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>
          {passwordMismatch ? <FieldError id="confirmPassword-error" message={error} /> : null}
        </div>

        {formError ? <FieldError id="register-form-error" message={formError} /> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-onBrand py-3 px-4 rounded-sm hover:bg-brandPressed focus:ring-4 focus:ring-brandSoft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Registrierung läuft…' : 'Registrieren'}
        </button>
      </form>
    </div>
  );
};

export default RegisterForm;
