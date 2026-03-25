import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Edit2, Trash2, Mail, Phone } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';

export default function Users() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    phone: '',
    roles: ['participant'] as UserRole[]
  });

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.first_name,
            last_name: formData.last_name
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('users')
          .upsert([{
            id: authData.user.id,
            email: formData.email,
            first_name: formData.first_name,
            last_name: formData.last_name,
            street: formData.street,
            house_number: formData.house_number,
            postal_code: formData.postal_code,
            city: formData.city,
            phone: formData.phone,
            roles: formData.roles,
            gdpr_consent: true,
            gdpr_consent_date: new Date().toISOString()
          }]);

        if (profileError) throw profileError;

        alert('Benutzer erfolgreich erstellt.');
        setShowModal(false);
        resetForm();
        fetchUsers();
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert('Fehler beim Erstellen des Benutzers: ' + error.message);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          street: formData.street,
          house_number: formData.house_number,
          postal_code: formData.postal_code,
          city: formData.city,
          phone: formData.phone,
          roles: formData.roles
        })
        .eq('id', editingUser.id);

      if (error) throw error;

      alert('Benutzer erfolgreich aktualisiert');
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      alert('Fehler beim Aktualisieren des Benutzers: ' + error.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (deletingUserId) return;
    if (!confirm('Möchten Sie diesen Benutzer wirklich löschen?')) return;

    try {
      setDeletingUserId(userId);
      const { data: { session } } = await supabase.auth.getSession();
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run4',hypothesisId:'H6',location:'src/pages/Users.tsx:132',message:'delete-user session check',data:{hasSession:Boolean(session)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!session?.access_token) {
        throw new Error('Nicht authentifiziert. Bitte neu anmelden.');
      }

      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run4',hypothesisId:'H1',location:'src/pages/Users.tsx:140',message:'delete-user invoke start',data:{userIdPresent:Boolean(userId),tokenLength:session.access_token.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const { data, error } = await supabase.functions.invoke('delete-user', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { userId },
      });

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const responseText = await error.context.text().catch(() => '');
          let parsedError = '';
          try {
            const parsed = responseText ? JSON.parse(responseText) : null;
            parsedError = parsed?.details || parsed?.error || '';
          } catch {
            parsedError = responseText;
          }
          // #region agent log
          fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run2',hypothesisId:'H2',location:'src/pages/Users.tsx:150',message:'delete-user http error details',data:{status:error.context.status,statusText:error.context.statusText,hasBody:Boolean(responseText),hasParsedError:Boolean(parsedError)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (error.context.status === 401) {
            // #region agent log
            fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run5',hypothesisId:'H7',location:'src/pages/Users.tsx:158',message:'invoke returned 401, trying direct fetch fallback',data:{},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const fallbackResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ userId }),
              }
            );
            const fallbackText = await fallbackResponse.text().catch(() => '');
            let fallbackParsed = '';
            try {
              const parsed = fallbackText ? JSON.parse(fallbackText) : null;
              fallbackParsed = parsed?.details || parsed?.error || '';
            } catch {
              fallbackParsed = fallbackText;
            }
            // #region agent log
            fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run5',hypothesisId:'H7',location:'src/pages/Users.tsx:182',message:'direct fetch fallback result',data:{status:fallbackResponse.status,ok:fallbackResponse.ok,hasBody:Boolean(fallbackText),hasParsedError:Boolean(fallbackParsed)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (fallbackResponse.ok) {
              alert('Benutzer erfolgreich gelöscht');
              fetchUsers();
              return;
            }
            throw new Error(fallbackParsed || `HTTP ${fallbackResponse.status}`);
          }
          throw new Error(parsedError || `HTTP ${error.context.status} ${error.context.statusText}`);
        }
        // #region agent log
        fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H2',location:'src/pages/Users.tsx:139',message:'delete-user invoke returned error',data:{errorMessage:error.message,dataType:typeof data},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const details = (data as { details?: string; error?: string } | null)?.details
          || (data as { details?: string; error?: string } | null)?.error
          || error.message;
        throw new Error(details || 'Fehler beim Löschen');
      }

      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H1',location:'src/pages/Users.tsx:148',message:'delete-user invoke success',data:{hasData:Boolean(data)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      alert('Benutzer erfolgreich gelöscht');
      fetchUsers();
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H5',location:'src/pages/Users.tsx:153',message:'delete-user catch',data:{errorMessage:error?.message ?? 'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('Error deleting user:', error);
      alert('Fehler beim Löschen des Benutzers: ' + error.message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      street: '',
      house_number: '',
      postal_code: '',
      city: '',
      phone: '',
      roles: ['participant']
    });
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      first_name: user.first_name,
      last_name: user.last_name,
      street: user.street,
      house_number: user.house_number,
      postal_code: user.postal_code,
      city: user.city,
      phone: user.phone,
      roles: user.roles || ['participant']
    });
    setShowModal(true);
  };

  const toggleRole = (role: UserRole) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
    }));
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Zugriff verweigert. Administratorrechte erforderlich.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Benutzerverwaltung</h1>
        <button
          onClick={() => {
            setEditingUser(null);
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <UserPlus size={20} />
          Benutzer erstellen
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Kontakt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rollen
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {user.first_name} {user.last_name}
                  </div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1 text-sm text-gray-900">
                    <Phone size={14} />
                    {user.phone}
                  </div>
                  <div className="text-sm text-gray-500">
                    {user.street} {user.house_number}, {user.postal_code} {user.city}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    {(user.roles || []).map((role) => (
                      <span
                        key={role}
                        className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => openEditModal(user)}
                    className="text-gray-600 hover:text-gray-900 mr-3"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={deletingUserId === user.id}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingUserId === user.id ? 'Löschen...' : <Trash2 size={18} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingUser ? 'Benutzer bearbeiten' : 'Neuen Benutzer erstellen'}
            </h2>
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!!editingUser}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-100"
                    required
                  />
                </div>
                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Passwort
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vorname
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nachname
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Straße
                  </label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hausnr.
                  </label>
                  <input
                    type="text"
                    value={formData.house_number}
                    onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PLZ
                  </label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stadt
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rollen
                </label>
                <div className="flex gap-4">
                  {(['admin', 'course_leader', 'participant'] as UserRole[]).map((role) => (
                    <label key={role} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(role)}
                        onChange={() => toggleRole(role)}
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <span className="text-sm text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-gray-900 text-white py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {editingUser ? 'Benutzer aktualisieren' : 'Benutzer erstellen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-900 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
