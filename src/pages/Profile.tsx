import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Mail, Phone, MapPin, Home, Save, Edit, Lock, Eye, EyeOff } from 'lucide-react';

const Profile: React.FC = () => {
  const { userProfile, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const profileSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  });
  const [formData, setFormData] = useState({
    first_name: userProfile?.first_name || '',
    last_name: userProfile?.last_name || '',
    email: userProfile?.email || '',
    phone: userProfile?.phone || '',
    street: userProfile?.street || '',
    house_number: userProfile?.house_number || '',
    postal_code: userProfile?.postal_code || '',
    city: userProfile?.city || ''
  });

  useEffect(() => {
    if (userProfile) {
      setFormData({
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        email: userProfile.email || '',
        phone: userProfile.phone || '',
        street: userProfile.street || '',
        house_number: userProfile.house_number || '',
        postal_code: userProfile.postal_code || '',
        city: userProfile.city || ''
      });
    }
  }, [userProfile]);

  useEffect(() => {
    return () => {
      if (profileSuccessTimeoutRef.current) {
        clearTimeout(profileSuccessTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    setLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update(formData)
        .eq('id', userProfile.id);

      if (updateError) throw updateError;

      setProfileSuccess('Profil erfolgreich aktualisiert!');
      setEditing(false);

      if (profileSuccessTimeoutRef.current) {
        clearTimeout(profileSuccessTimeoutRef.current);
      }
      profileSuccessTimeoutRef.current = setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setProfileError('Fehler beim Aktualisieren des Profils. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      first_name: userProfile?.first_name || '',
      last_name: userProfile?.last_name || '',
      email: userProfile?.email || '',
      phone: userProfile?.phone || '',
      street: userProfile?.street || '',
      house_number: userProfile?.house_number || '',
      postal_code: userProfile?.postal_code || '',
      city: userProfile?.city || ''
    });
    setEditing(false);
    setProfileError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordError('Bitte füllen Sie alle Passwortfelder aus.');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Neues Passwort und Wiederholung stimmen nicht überein.');
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError('Das neue Passwort darf nicht dem aktuellen Passwort entsprechen.');
      return;
    }

    setPasswordLoading(true);
    const { error } = await changePassword(passwordData.currentPassword, passwordData.newPassword);
    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message || 'Passwort konnte nicht geändert werden.');
      return;
    }

    setPasswordSuccess('Passwort erfolgreich geändert.');
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  };

  const switchToTab = (tab: 'profile' | 'password') => {
    setActiveTab(tab);
    setProfileError('');
    setPasswordError('');
    setPasswordSuccess('');
  };

  const togglePasswordVisibility = (field: 'currentPassword' | 'newPassword' | 'confirmPassword') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-[var(--radius-full)] h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Mein Profil</h1>
        <p className="text-textMuted">Verwalten Sie Ihre persönlichen Informationen</p>
      </div>

      <div className="bg-surface rounded-[var(--radius-md)] border border-border p-2 flex gap-2">
        <button
          onClick={() => switchToTab('profile')}
          className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
            activeTab === 'profile'
              ? 'bg-brand text-onBrand'
              : 'text-textMuted hover:bg-surfaceSunken'
          }`}
        >
          Persönliche Daten
        </button>
        <button
          onClick={() => switchToTab('password')}
          className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
            activeTab === 'password'
              ? 'bg-brand text-onBrand'
              : 'text-textMuted hover:bg-surfaceSunken'
          }`}
        >
          Passwort ändern
        </button>
      </div>

      {activeTab === 'profile' && profileSuccess && (
        <div className="p-4 bg-sage-100 border border-sage-200 rounded-[var(--radius-sm)]">
          <p className="text-sm text-brand">{profileSuccess}</p>
        </div>
      )}

      {activeTab === 'profile' && profileError && (
        <div className="p-4 bg-dangerSoft border border-danger rounded-[var(--radius-sm)]">
          <p className="text-sm text-danger">{profileError}</p>
        </div>
      )}

      {activeTab === 'profile' ? (
        <div className="bg-surface rounded-[var(--radius-md)] border border-border">
          <div className="p-3.5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-16 h-16 bg-sage-100 rounded-[var(--radius-full)] flex items-center justify-center">
                  <User className="w-8 h-8 text-brand" />
                </div>
                <div className="ml-4">
                  <h2 className="text-xl font-semibold text-text">
                    {userProfile.first_name} {userProfile.last_name}
                  </h2>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {userProfile.role === 'owner' && (
                      <span className="inline-block px-2 py-1 text-xs rounded-[var(--radius-full)] bg-surfaceSunken text-textMuted">
                        Inhaber
                      </span>
                    )}
                    {userProfile.role === 'admin' && (
                      <span className="inline-block px-2 py-1 text-xs rounded-[var(--radius-full)] bg-surfaceSunken text-textMuted">
                        Administrator
                      </span>
                    )}
                    {userProfile.role === 'teacher' && (
                      <span className="inline-block px-2 py-1 text-xs rounded-[var(--radius-full)] bg-surfaceSunken text-textMuted">
                        Kursleiter
                      </span>
                    )}
                    {userProfile.role === 'user' && (
                      <span className="inline-block px-2 py-1 text-xs rounded-[var(--radius-full)] bg-sage-100 text-sage-800">
                        Teilnehmer
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center px-4 py-2 bg-brand text-onBrand rounded-[var(--radius-sm)] hover:bg-brandPressed transition-colors"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Bearbeiten
                </button>
              )}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="p-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-textMuted mb-2">
                  Vorname
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="first_name"
                    name="first_name"
                    type="text"
                    value={formData.first_name}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-textMuted mb-2">
                  Nachname
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="last_name"
                    name="last_name"
                    type="text"
                    value={formData.last_name}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-textMuted mb-2">
                  E-Mail-Adresse
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-textMuted mb-2">
                  Telefonnummer
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="street" className="block text-sm font-medium text-textMuted mb-2">
                  Straße
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="street"
                    name="street"
                    type="text"
                    value={formData.street}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="house_number" className="block text-sm font-medium text-textMuted mb-2">
                  Hausnummer
                </label>
                <div className="relative">
                  <Home className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="house_number"
                    name="house_number"
                    type="text"
                    value={formData.house_number}
                    onChange={handleChange}
                    disabled={!editing}
                    className={`w-full pl-10 pr-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                      !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="postal_code" className="block text-sm font-medium text-textMuted mb-2">
                  Postleitzahl
                </label>
                <input
                  id="postal_code"
                  name="postal_code"
                  type="text"
                  value={formData.postal_code}
                  onChange={handleChange}
                  disabled={!editing}
                  className={`w-full px-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                    !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div>
                <label htmlFor="city" className="block text-sm font-medium text-textMuted mb-2">
                  Stadt
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  value={formData.city}
                  onChange={handleChange}
                  disabled={!editing}
                  className={`w-full px-4 py-3 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent ${
                    !editing ? 'bg-surfaceSunken cursor-not-allowed' : ''
                  }`}
                />
              </div>
            </div>

            {editing && (
              <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-textMuted bg-surfaceSunken hover:bg-borderStrong rounded-[var(--radius-sm)] transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center px-6 py-2 bg-brand text-onBrand rounded-[var(--radius-sm)] hover:bg-brandPressed focus:ring-4 focus:ring-sage-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            )}
          </form>
        </div>
      ) : (
        <div className="bg-surface rounded-[var(--radius-md)] border border-border p-3.5">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 bg-sage-100 rounded-[var(--radius-full)] flex items-center justify-center">
              <Lock className="w-6 h-6 text-brand" />
            </div>
            <div className="ml-3">
              <h2 className="text-lg font-semibold text-text">Passwort ändern</h2>
              <p className="text-sm text-textMuted">Aktualisieren Sie Ihr Passwort sicher.</p>
            </div>
          </div>

          {passwordSuccess && (
            <div className="p-4 mb-4 bg-sage-100 border border-sage-200 rounded-[var(--radius-sm)]">
              <p className="text-sm text-brand">{passwordSuccess}</p>
            </div>
          )}

          {passwordError && (
            <div className="p-4 mb-4 bg-dangerSoft border border-danger rounded-[var(--radius-sm)]">
              <p className="text-sm text-danger">{passwordError}</p>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-textMuted mb-2">
                Aktuelles Passwort
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type={showPasswords.currentPassword ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 pr-12 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('currentPassword')}
                  className="absolute inset-y-0 right-0 px-4 text-textMuted hover:text-textMuted"
                  aria-label={showPasswords.currentPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPasswords.currentPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-textMuted mb-2">
                Neues Passwort
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPasswords.newPassword ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 pr-12 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('newPassword')}
                  className="absolute inset-y-0 right-0 px-4 text-textMuted hover:text-textMuted"
                  aria-label={showPasswords.newPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPasswords.newPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-textMuted mb-2">
                Neues Passwort wiederholen
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPasswords.confirmPassword ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 pr-12 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('confirmPassword')}
                  className="absolute inset-y-0 right-0 px-4 text-textMuted hover:text-textMuted"
                  aria-label={showPasswords.confirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPasswords.confirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordLoading}
                className="flex items-center px-6 py-2 bg-brand text-onBrand rounded-[var(--radius-sm)] hover:bg-brandPressed focus:ring-4 focus:ring-sage-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {passwordLoading ? 'Wird gespeichert...' : 'Passwort speichern'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Profile;