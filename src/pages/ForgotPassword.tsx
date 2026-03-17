import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      setError('Dienst vorübergehend nicht erreichbar. Bitte später erneut versuchen.');
      setLoading(false);
      return;
    }

    // In Entwicklung über Vite-Proxy anfragen, um CORS zu vermeiden
    const apiBase = import.meta.env.DEV ? '/api-supabase' : supabaseUrl;

    try {
      const response = await fetch(
        `${apiBase}/functions/v1/request-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email }),
        }
      );

      const contentType = response.headers.get('Content-Type') ?? '';
      const isJson = contentType.includes('application/json');
      let text: string;
      try {
        text = await response.text();
      } catch (readErr) {
        console.error('Password reset: response body read failed', { status: response.status }, readErr);
        setError('Serverfehler. Bitte später erneut versuchen.');
        setLoading(false);
        return;
      }

      let data: { error?: string; success?: boolean; message?: string } = {};
      if (isJson && text) {
        try {
          data = JSON.parse(text);
        } catch {
          console.error('Password reset: invalid JSON', { status: response.status, body: text.slice(0, 200) });
          setError('Die Anfrage konnte nicht verarbeitet werden. Bitte prüfen Sie Ihre Verbindung.');
          return;
        }
      }

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error ?? 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isNetworkError = err instanceof TypeError;
      console.error('Password reset request error:', message, isNetworkError ? '(network/CORS?)' : '', err);
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut. Details stehen in der Browser-Konsole (F12).');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              E-Mail versendet
            </h1>
            <p className="text-gray-600 mb-6">
              Wenn ein Konto mit dieser E-Mail-Adresse existiert, haben wir Ihnen eine E-Mail zum Zurücksetzen des Passworts geschickt.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Bitte überprüfen Sie Ihr E-Mail-Postfach und folgen Sie den Anweisungen.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition-colors"
            >
              Zur Anmeldung
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <button
          onClick={() => navigate('/auth')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Anmeldung
        </button>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Passwort vergessen?
          </h1>
          <p className="text-gray-600">
            Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
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
                placeholder="ihre.email@beispiel.de"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Wird gesendet...' : 'Zurücksetzungs-Link senden'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
