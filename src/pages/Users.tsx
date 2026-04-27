import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { Trash2, Mail } from 'lucide-react';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'owner',   label: 'Owner' },
  { value: 'admin',   label: 'Admin' },
  { value: 'teacher', label: 'Lehrer' },
  { value: 'user',    label: 'Teilnehmer' },
];

const ROLE_COLORS: Record<UserRole, string> = {
  owner:   'bg-purple-100 text-purple-800',
  admin:   'bg-red-100 text-red-800',
  teacher: 'bg-blue-100 text-blue-800',
  user:    'bg-green-100 text-green-800',
};

export default function Users() {
  const { isOwner, userProfile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) fetchUsers();
  }, [isOwner]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (userId === userProfile?.id && newRole !== 'owner') {
      if (!confirm('Du änderst deine eigene Rolle. Du verlierst danach den Owner-Zugang. Fortfahren?')) return;
    }
    setSavingId(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      alert('Fehler beim Ändern der Rolle: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === userProfile?.id) {
      alert('Du kannst dich nicht selbst löschen.');
      return;
    }
    if (!confirm('Diesen Nutzer wirklich löschen?')) return;

    setDeletingId(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Nicht authentifiziert.');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ userId }),
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (result as { details?: string; error?: string }).details
            || (result as { details?: string; error?: string }).error
            || `HTTP ${response.status}`,
        );
      }

      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      alert('Fehler beim Löschen: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Zugriff verweigert. Diese Seite ist nur für Studio-Owner zugänglich.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Nutzerverwaltung</h1>
        <p className="text-gray-500 mt-1">
          Neue Nutzer registrieren sich selbst über die Studio-URL. Hier kannst du Rollen
          anpassen und Nutzer entfernen.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                E-Mail
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rolle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className={user.id === userProfile?.id ? 'bg-teal-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {user.first_name} {user.last_name}
                    {user.id === userProfile?.id && (
                      <span className="ml-2 text-xs text-teal-600">(du)</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Mail size={14} />
                    {user.email}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${ROLE_COLORS[user.role]}`}
                    >
                      {ROLE_OPTIONS.find(r => r.value === user.role)?.label ?? user.role}
                    </span>
                    <select
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
                      disabled={savingId === user.id}
                      className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {savingId === user.id && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-teal-600" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleDelete(user.id)}
                    disabled={deletingId === user.id || user.id === userProfile?.id}
                    className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={user.id === userProfile?.id ? 'Dich selbst kannst du nicht löschen' : 'Nutzer löschen'}
                  >
                    {deletingId === user.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Noch keine Nutzer gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
