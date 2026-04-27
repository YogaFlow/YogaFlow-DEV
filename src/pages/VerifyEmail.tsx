import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Kein Verifizierungstoken gefunden.');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ token }),
          }
        );

        let data: { success?: boolean; error?: string } = {};
        try {
          data = await response.json();
        } catch {
          setStatus('error');
          setMessage('Ungültige Antwort vom Server. Bitte versuchen Sie es erneut.');
          return;
        }

        if (response.ok && data.success) {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // Session kann fehlen (z. B. nach signOut nach Registrierung) — unkritisch
          }
          try {
            sessionStorage.removeItem('yogaflow_onboarding_slug');
          } catch {
            /* ignore */
          }
          setStatus('success');
          setMessage('Ihre E-Mail-Adresse wurde erfolgreich bestätigt!');
          setTimeout(() => navigate('/auth?verified=1'), 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Fehler bei der Verifizierung.');
        }
      } catch (error) {
        console.error('Verification error:', error);
        setStatus('error');
        setMessage('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <Loader className="w-16 h-16 text-teal-600 mx-auto mb-4 animate-spin" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                E-Mail wird verifiziert...
              </h1>
              <p className="text-gray-600">
                Bitte warten Sie einen Moment.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Erfolgreich verifiziert!
              </h1>
              <p className="text-gray-600 mb-6">
                {message}
              </p>
              <p className="text-sm text-gray-500">
                Sie werden in Kürze zur Anmeldeseite weitergeleitet...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verifizierung fehlgeschlagen
              </h1>
              <p className="text-gray-600 mb-6">
                {message}
              </p>
              <button
                onClick={() => navigate('/auth')}
                className="w-full bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition-colors"
              >
                Zur Anmeldung
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
