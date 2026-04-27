import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showVerifiedMessage, setShowVerifiedMessage] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, isEmailConfirmed } = useAuth();
  const { tenantSlug } = useTenant();
  const navigate = useNavigate();

  // Nur bestätigte Nutzer weiterleiten – auf Subdomain zum Dashboard, auf Apex zur Landing Page
  useEffect(() => {
    if (!loading && user && isEmailConfirmed) {
      navigate(tenantSlug ? '/dashboard' : '/', { replace: true });
    }
  }, [user, loading, isEmailConfirmed, tenantSlug, navigate]);

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
          <div className="flex border-b border-gray-200">
            <button
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

          {showVerifiedMessage && (
            <div className="mx-8 mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center text-green-800 text-sm">
              E-Mail bestätigt. Sie können sich jetzt anmelden.
            </div>
          )}
          <div className="p-8 flex justify-center">
            {isLogin ? <LoginForm /> : <RegisterForm />}
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