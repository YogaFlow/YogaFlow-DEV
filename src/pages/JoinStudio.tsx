import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTenant, withDevTenant } from '../context/TenantContext';

type JoinResult = {
  success?: boolean;
  already_member?: boolean;
  error?: string;
  member_id?: string;
};

const JoinStudio: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshProfile, signOut } = useAuth();
  const { tenant } = useTenant();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const [firstName, setFirstName] = useState(
    typeof meta.first_name === 'string' ? meta.first_name : '',
  );
  const [lastName, setLastName] = useState(
    typeof meta.last_name === 'string' ? meta.last_name : '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('join_tenant', {
        p_first_name: firstName,
        p_last_name: lastName,
      });

      if (rpcError) {
        setError(rpcError.message || 'Beitritt fehlgeschlagen. Bitte versuche es erneut.');
        return;
      }

      const result = (data ?? {}) as JoinResult;

      if (result.success || result.already_member) {
        await refreshProfile();
        navigate(withDevTenant('/dashboard'), { replace: true });
        return;
      }

      const code = result.error;
      if (code === 'no_studio_context') {
        setError(
          'Kein Studio erkannt. Bitte öffne die Seite über die Studio-Adresse und versuche es erneut.',
        );
      } else if (code === 'studio_not_found') {
        setError('Dieses Studio wurde nicht gefunden. Prüfe die Adresse oder wende dich an den Support.');
      } else if (code === 'not_authenticated') {
        setError('Du bist nicht angemeldet. Bitte melde dich erneut an und tritt dann bei.');
      } else {
        setError('Beitritt fehlgeschlagen. Bitte versuche es erneut.');
      }
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand rounded-full mb-4">
            <Heart className="w-8 h-8 text-onBrand" />
          </div>
          <h1 className="text-3xl font-bold text-text mb-2">{tenant?.name ?? 'Studio'}</h1>
          <p className="text-textMuted">Tritt diesem Studio mit deinem bestehenden Konto bei.</p>
        </div>

        <div className="bg-surface rounded-md border border-border p-6">
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="join_first_name" className="block text-sm font-medium text-textMuted mb-1">
                  Vorname *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="join_first_name"
                    name="first_name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="join_last_name" className="block text-sm font-medium text-textMuted mb-1">
                  Nachname *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                  <input
                    id="join_last_name"
                    name="last_name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-dangerSoft border border-danger rounded-sm">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-brand text-onBrand py-3 px-4 rounded-sm hover:bg-brandPressed focus:ring-4 focus:ring-brandSoft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Beitritt läuft…' : 'Beitreten'}
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full min-h-[44px] text-sm text-brand hover:text-brandPressed font-medium"
            >
              Anderes Konto verwenden
            </button>
          </form>
        </div>

        <div className="text-center mt-8 text-sm text-textMuted">
          <p>© {new Date().getFullYear()} Omlify · Kursverwaltung für Yogastudios</p>
        </div>
      </div>
    </div>
  );
};

export default JoinStudio;
