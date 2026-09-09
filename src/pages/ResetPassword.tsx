import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Kein gültiger Token gefunden.');
      return;
    }

    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token, newPassword: password }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
        setTimeout(() => navigate('/auth'), 3000);
      } else {
        setError(data.error || 'Fehler beim Zurücksetzen des Passworts.');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-[var(--radius-md)] border border-border p-3.5">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text mb-2">
              Ungültiger Link
            </h1>
            <p className="text-textMuted mb-6">
              Dieser Link ist ungültig oder abgelaufen.
            </p>
            <button
              onClick={() => navigate('/forgot-password')}
              className="w-full bg-brand text-onBrand py-3 rounded-[var(--radius-sm)] hover:bg-brandPressed transition-colors"
            >
              Neuen Link anfordern
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-[var(--radius-md)] border border-border p-3.5">
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-brand mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-text mb-2">
              Passwort erfolgreich zurückgesetzt
            </h1>
            <p className="text-textMuted mb-6">
              Ihr Passwort wurde erfolgreich geändert. Sie können sich jetzt mit Ihrem neuen Passwort anmelden.
            </p>
            <p className="text-sm text-textMuted">
              Sie werden in Kürze zur Anmeldeseite weitergeleitet...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-[var(--radius-md)] border border-border p-3.5">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text mb-2">
            Neues Passwort erstellen
          </h1>
          <p className="text-textMuted">
            Bitte geben Sie Ihr neues Passwort ein.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-dangerSoft border border-danger rounded-[var(--radius-sm)]">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-textMuted mb-2">
              Neues Passwort
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="Mindestens 8 Zeichen"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-textSubtle hover:text-textMuted"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-textMuted mb-2">
              Passwort bestätigen
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="Passwort wiederholen"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-textSubtle hover:text-textMuted"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-onBrand py-3 rounded-[var(--radius-sm)] hover:bg-brandPressed focus:ring-4 focus:ring-sage-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Wird gespeichert...' : 'Passwort zurücksetzen'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
