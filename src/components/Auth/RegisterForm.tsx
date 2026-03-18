import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, User, Mail, Lock, Phone, MapPin, Home } from 'lucide-react';

const RegisterForm: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    phone: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSentOnSignup, setEmailSentOnSignup] = useState(true);

  const { signUp, signOut } = useAuth();

  const handleChange = (e: React.FormEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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

    const duplicateEmailMessage = 'Ein Benutzer mit dieser E-Mail-Adresse ist bereits registriert. Bitte verwenden Sie eine andere E-Mail-Adresse oder melden Sie sich an.';

    try {
      const { password, confirmPassword, ...userData } = formData;
      const { data, error } = await signUp(formData.email, password, userData);

      if (error) {
        const msg = (error as { message?: string }).message ?? '';
        const isDuplicate = msg === 'User already registered'
          || /already registered/i.test(msg)
          || /already exists/i.test(msg)
          || /already in use/i.test(msg);
        const isRateLimit = /rate limit exceeded/i.test(msg);
        if (isDuplicate) {
          setError(duplicateEmailMessage);
        } else if (isRateLimit) {
          setError('Zu viele Registrierungsversuche. Bitte warten Sie etwa eine Stunde und versuchen Sie es dann erneut. Falls Sie sich bereits registriert haben, nutzen Sie „Anmelden“ oder „Bestätigungsmail erneut senden“ auf der Login-Seite.');
        } else {
          setError(`Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.${msg ? ` (${msg})` : ''}`);
        }
        return;
      }

      // Supabase often returns success with empty identities when email already exists (no error)
      const identities = (data?.user as { identities?: unknown[] })?.identities;
      if (data?.user && Array.isArray(identities) && identities.length === 0) {
        setError(duplicateEmailMessage);
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
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                userId: data.user.id,
                email: formData.email,
              }),
            }
          );
          emailSent = res.ok;
          setSuccess(true);
          setEmailSentOnSignup(emailSent);
          await signOut();
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
        }
      }
    } catch (err) {
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            Registrierung erfolgreich!
          </h3>
          {emailSentOnSignup ? (
            <>
              <p className="text-sm text-green-600 mb-3">
                Wir haben Ihnen eine Bestätigungsmail an <strong>{formData.email}</strong> gesendet.
              </p>
              <p className="text-sm text-green-600 mb-3">
                Bitte klicken Sie auf den Link in der E-Mail, um Ihr Konto zu bestätigen.
                <strong> Anschließend können Sie sich oben unter „Anmelden“ einloggen.</strong>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-green-600 mb-3">
                Ihr Konto wurde erstellt. Die Bestätigungsmail konnte nicht versendet werden.
              </p>
              <p className="text-sm text-green-600">
                Bitte gehen Sie zur <strong>Anmeldeseite</strong> und nutzen Sie dort
                „Bestätigungsmail nicht erhalten? <strong>Erneut senden</strong>“, um den Link zu erhalten.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">
              Vorname *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="first_name"
                name="first_name"
                type="text"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">
              Nachname *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="last_name"
                name="last_name"
                type="text"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail-Adresse *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Telefonnummer *
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-2">
              Straße *
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="street"
                name="street"
                type="text"
                value={formData.street}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="house_number" className="block text-sm font-medium text-gray-700 mb-2">
              Hausnummer *
            </label>
            <div className="relative">
              <Home className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="house_number"
                name="house_number"
                type="text"
                value={formData.house_number}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700 mb-2">
              Postleitzahl *
            </label>
            <input
              id="postal_code"
              name="postal_code"
              type="text"
              value={formData.postal_code}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
              Stadt *
            </label>
            <input
              id="city"
              name="city"
              type="text"
              value={formData.city}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Passwort *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Passwort bestätigen *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p>* Pflichtfelder</p>
          <p className="mt-2">
            Mit der Registrierung stimmen Sie der Verarbeitung Ihrer personenbezogenen Daten zu. 
            Sie können Ihre Daten jederzeit exportieren oder löschen lassen.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-teal-600 text-white py-3 px-4 rounded-lg hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Registrierung läuft...' : 'Registrieren'}
        </button>
      </form>
    </div>
  );
};

export default RegisterForm;