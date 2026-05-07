import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole, Course } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Trash2, Mail, ChevronDown, ChevronUp, Save, Plus,
  Eye, EyeOff, UserCheck,
} from 'lucide-react';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface EditFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  new_password: string;
}

interface RegWithCourse {
  id: string;
  course_id: string;
  status: string;
  is_waitlist: boolean;
  waitlist_position?: number;
  courses: { id: string; title: string; date: string } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

function getRoleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;
}

function getRoleChangeErrorMessage(error: unknown): string {
  const extract = (val: unknown): string => {
    if (val instanceof Error) return val.message ?? '';
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') {
      const r = val as Record<string, unknown>;
      const parts = [r.message, r.details, r.error, r.hint, r.code]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (parts.length > 0) return parts.join(' | ');
      try { return JSON.stringify(r); } catch { return ''; }
    }
    return String(val ?? '');
  };
  const msg = extract(error).toUpperCase();
  if (msg.includes('LAST_OWNER_REQUIRED'))
    return 'Du bist aktuell der einzige Owner. Ernenne zuerst eine weitere Person zum Owner.';
  if (msg.includes('OWNER_ASSIGNMENT_FORBIDDEN'))
    return 'Nur bestehende Owner dürfen die Owner-Rolle vergeben.';
  if (msg.includes('OWNER_ROLE_CHANGE_FORBIDDEN'))
    return 'Nur Owner dürfen Owner-Rollen ändern.';
  if (msg.includes('ROLE_CHANGE_FORBIDDEN'))
    return 'Du hast keine Berechtigung für diesen Rollenwechsel.';
  return 'Die Rolle konnte nicht geändert werden. Bitte versuche es erneut.';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Users() {
  const { isCourseLeader, isOwner, isAdmin, userProfile } = useAuth();
  const isTeacher = userProfile?.role === 'teacher';

  // Actor's available role options (owner can set all; admin cannot set owner)
  const roleOptionsForActor = isOwner
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(r => r.value !== 'owner');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [users, setUsers]                       = useState<User[]>([]);
  const [courses, setCourses]                   = useState<Course[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [expandedId, setExpandedId]             = useState<string | null>(null);
  const [editForm, setEditForm]                 = useState<EditFormData | null>(null);
  const [showPassword, setShowPassword]         = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<RegWithCourse[]>([]);
  const [regsLoading, setRegsLoading]           = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [savingProfile, setSavingProfile]       = useState(false);
  const [addingCourse, setAddingCourse]         = useState(false);
  const [savingRoleId, setSavingRoleId]         = useState<string | null>(null);
  const [deletingId, setDeletingId]             = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog]     = useState<FeedbackDialogState | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isCourseLeader) return;
    fetchUsers();
    fetchCourses();
  }, [isCourseLeader]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (isTeacher) {
        // Teacher: only participants of their own courses
        const { data: teacherCourses, error: coursesErr } = await supabase
          .from('courses')
          .select('id')
          .eq('teacher_id', userProfile!.id);
        if (coursesErr) throw coursesErr;

        if (!teacherCourses || teacherCourses.length === 0) {
          setUsers([]);
          return;
        }

        const courseIds = teacherCourses.map(c => c.id);
        const { data: regs, error: regsErr } = await supabase
          .from('registrations')
          .select('user_id, users(*)')
          .in('course_id', courseIds)
          .is('cancellation_timestamp', null);
        if (regsErr) throw regsErr;

        const seen = new Set<string>();
        const uniqueUsers: User[] = [];
        for (const reg of regs ?? []) {
          const u = (reg as unknown as { users: User }).users;
          if (u && u.role === 'user' && !seen.has(u.id)) {
            seen.add(u.id);
            uniqueUsers.push(u);
          }
        }
        uniqueUsers.sort((a, b) =>
          `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`, 'de'),
        );
        setUsers(uniqueUsers);
      } else {
        // Admin/Owner: all users in tenant
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('last_name', { ascending: true });
        if (error) throw error;
        setUsers(data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setFeedbackDialog({ title: 'Fehler', message: 'Nutzer konnten nicht geladen werden.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      let query = supabase
        .from('courses')
        .select('id, title, date, status, tenant_id, teacher_id, description, location, max_participants, price, frequency, created_at, updated_at')
        .neq('status', 'canceled')
        .order('date', { ascending: true });

      if (isTeacher) {
        query = query.eq('teacher_id', userProfile!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCourses((data as unknown as Course[]) || []);
    } catch (err) {
      console.error('Error fetching courses:', err);
    }
  };

  const fetchUserRegistrations = useCallback(async (userId: string): Promise<RegWithCourse[]> => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('id, course_id, status, is_waitlist, waitlist_position, courses(id, title, date)')
        .eq('user_id', userId)
        .is('cancellation_timestamp', null)
        .order('registered_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as RegWithCourse[]) || [];
    } catch {
      return [];
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Expand / Collapse
  // ---------------------------------------------------------------------------

  const handleToggleExpand = async (user: User) => {
    if (expandedId === user.id) {
      setExpandedId(null);
      setEditForm(null);
      setUserRegistrations([]);
      setSelectedCourseId('');
      setShowPassword(false);
      return;
    }
    setExpandedId(user.id);
    setEditForm({
      first_name:   user.first_name   || '',
      last_name:    user.last_name    || '',
      email:        user.email        || '',
      phone:        user.phone        || '',
      street:       user.street       || '',
      house_number: user.house_number || '',
      postal_code:  user.postal_code  || '',
      city:         user.city         || '',
      new_password: '',
    });
    setSelectedCourseId('');
    setShowPassword(false);
    setRegsLoading(true);
    const regs = await fetchUserRegistrations(user.id);
    setUserRegistrations(regs);
    setRegsLoading(false);
  };

  // ---------------------------------------------------------------------------
  // Save profile + password
  // ---------------------------------------------------------------------------

  const handleSaveProfile = async (userId: string) => {
    if (!editForm) return;
    setSavingProfile(true);
    try {
      const payload: Record<string, string> = {
        userId,
        first_name:   editForm.first_name,
        last_name:    editForm.last_name,
        email:        editForm.email,
        phone:        editForm.phone,
        street:       editForm.street,
        house_number: editForm.house_number,
        postal_code:  editForm.postal_code,
        city:         editForm.city,
      };
      if (editForm.new_password) payload.new_password = editForm.new_password;

      const { error: fnError } = await supabase.functions.invoke('update-user', {
        body: payload,
      });

      if (fnError) {
        throw new Error(
          (fnError as unknown as { details?: string }).details
            || fnError.message
            || 'Unbekannter Fehler',
        );
      }

      // Reflect changes in local state
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        first_name:   editForm.first_name,
        last_name:    editForm.last_name,
        email:        editForm.email,
        phone:        editForm.phone,
        street:       editForm.street,
        house_number: editForm.house_number,
        postal_code:  editForm.postal_code,
        city:         editForm.city,
      } : u));
      setEditForm(prev => prev ? { ...prev, new_password: '' } : prev);
      setFeedbackDialog({ title: 'Gespeichert', message: 'Nutzerdaten wurden erfolgreich aktualisiert.', type: 'success' });
    } catch (err: unknown) {
      setFeedbackDialog({
        title: 'Fehler',
        message: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.',
        type: 'error',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add to course
  // ---------------------------------------------------------------------------

  const handleAddToCourse = async (userId: string) => {
    if (!selectedCourseId) return;
    setAddingCourse(true);
    try {
      const { data, error } = await supabase.rpc('admin_register_user_for_course', {
        p_user_id:   userId,
        p_course_id: selectedCourseId,
      });
      if (error) throw error;

      type RpcResult = { success: boolean; error?: string; on_waitlist?: boolean; waitlist_position?: number };
      const result = data as RpcResult;

      if (!result.success) {
        if (result.error === 'already_registered') {
          setFeedbackDialog({ title: 'Hinweis', message: 'Der Nutzer ist bereits in diesem Kurs angemeldet.', type: 'info' });
        } else {
          throw new Error(result.error);
        }
      } else {
        const onWaitlist = !!result.on_waitlist;
        setFeedbackDialog({
          title:   onWaitlist ? 'Auf Warteliste' : 'Hinzugefügt',
          message: onWaitlist
            ? `Der Kurs ist ausgebucht. Der Nutzer wurde auf die Warteliste gesetzt (Platz ${result.waitlist_position}).`
            : 'Nutzer wurde erfolgreich zum Kurs hinzugefügt.',
          type: onWaitlist ? 'info' : 'success',
        });
        setSelectedCourseId('');
        const regs = await fetchUserRegistrations(userId);
        setUserRegistrations(regs);
      }
    } catch (err: unknown) {
      setFeedbackDialog({
        title: 'Fehler',
        message: err instanceof Error ? err.message : 'Hinzufügen fehlgeschlagen.',
        type: 'error',
      });
    } finally {
      setAddingCourse(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Role change (Admin/Owner only)
  // ---------------------------------------------------------------------------

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const targetUser = users.find(u => u.id === userId);
    const ownerCount = users.filter(u => u.role === 'owner').length;

    if (targetUser?.role === 'owner' && newRole !== 'owner' && ownerCount <= 1) {
      setFeedbackDialog({
        title:   'Owner-Rolle erforderlich',
        message: 'Die letzte Owner-Rolle kann nicht entfernt werden. Ernennen Sie zuerst einen weiteren Owner.',
        type: 'error',
      });
      return;
    }

    setSavingRoleId(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      setFeedbackDialog({
        title:   'Rolle kann nicht geändert werden',
        message: getRoleChangeErrorMessage(err),
        type: 'error',
      });
    } finally {
      setSavingRoleId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete user (Admin/Owner only)
  // ---------------------------------------------------------------------------

  const handleDelete = async (userId: string) => {
    if (userId === userProfile?.id) {
      setFeedbackDialog({ title: 'Hinweis', message: 'Du kannst dich nicht selbst löschen.', type: 'info' });
      return;
    }
    if (!confirm('Diesen Nutzer wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;

    setDeletingId(userId);
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (fnError) {
        throw new Error(
          (fnError as unknown as { details?: string }).details
            || fnError.message
            || 'Löschen fehlgeschlagen',
        );
      }

      setUsers(prev => prev.filter(u => u.id !== userId));
      if (expandedId === userId) setExpandedId(null);
    } catch (err: unknown) {
      setFeedbackDialog({
        title:   'Löschen fehlgeschlagen',
        message: 'Fehler: ' + (err instanceof Error ? err.message : String(err)),
        type: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Access guard
  // ---------------------------------------------------------------------------

  if (!isCourseLeader) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Zugriff verweigert. Diese Seite ist nur für Lehrer, Admins und Studio-Owner zugänglich.
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-8">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Nutzerverwaltung</h1>
        <p className="text-gray-500 mt-1">
          {isTeacher
            ? 'Teilnehmer deiner Kurse – Stammdaten und Passwörter bearbeiten, Kurse zuweisen.'
            : 'Alle Studio-Nutzer verwalten – Stammdaten, Passwörter, Rollen und Kursbelegung.'}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 w-8" />
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-Mail</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rolle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  {isTeacher
                    ? 'Keine Teilnehmer in deinen Kursen gefunden.'
                    : 'Noch keine Nutzer gefunden.'}
                </td>
              </tr>
            )}

            {users.map(user => {
              const isExpanded = expandedId === user.id;
              const isSelf = user.id === userProfile?.id;

              // Courses the user is already registered in (for dropdown filtering)
              const alreadyRegisteredIds = new Set(userRegistrations.map(r => r.course_id));
              const availableCoursesToAdd = courses.filter(c => !alreadyRegisteredIds.has(c.id));

              return (
                <React.Fragment key={user.id}>
                  {/* ── Main row ── */}
                  <tr className={`${isSelf ? 'bg-teal-50' : ''} ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'} transition-colors`}>
                    {/* Toggle button */}
                    <td className="px-3 py-4 text-center">
                      <button
                        onClick={() => handleToggleExpand(user)}
                        className="text-gray-400 hover:text-teal-600 transition-colors"
                        title={isExpanded ? 'Schließen' : 'Bearbeiten'}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </td>

                    {/* Name */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                        {isSelf && <span className="ml-2 text-xs text-teal-600 font-normal">(du)</span>}
                      </div>
                    </td>

                    {/* E-Mail */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Mail size={14} className="flex-shrink-0" />
                        {user.email}
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                          {getRoleLabel(user.role)}
                        </span>
                        {/* Role dropdown: only for Admin/Owner, not for self */}
                        {isAdmin && !isSelf && (
                          <>
                            <select
                              value={user.role}
                              onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
                              disabled={savingRoleId === user.id}
                              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                            >
                              {roleOptionsForActor.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {savingRoleId === user.id && (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-teal-600" />
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleExpand(user)}
                          className="text-teal-600 hover:text-teal-800 text-sm font-medium"
                        >
                          {isExpanded ? 'Schließen' : 'Bearbeiten'}
                        </button>
                        {/* Delete: only Admin/Owner, not self, not owner targets */}
                        {isAdmin && !isSelf && user.role !== 'owner' && (
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deletingId === user.id}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30 transition-colors"
                            title="Nutzer löschen"
                          >
                            {deletingId === user.id
                              ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                              : <Trash2 size={16} />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded edit panel ── */}
                  {isExpanded && editForm && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50 border-b border-gray-100 px-0 py-0">
                        <div className="px-8 py-6">
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

                            {/* ── Left: Stammdaten + Passwort ── */}
                            <div className="lg:col-span-2 space-y-4">
                              <h3 className="text-sm font-semibold text-gray-700">Stammdaten</h3>

                              <div className="grid grid-cols-2 gap-3">
                                {/* Vorname */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Vorname</label>
                                  <input
                                    type="text"
                                    value={editForm.first_name}
                                    onChange={e => setEditForm(f => f ? { ...f, first_name: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* Nachname */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Nachname</label>
                                  <input
                                    type="text"
                                    value={editForm.last_name}
                                    onChange={e => setEditForm(f => f ? { ...f, last_name: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* E-Mail */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">E-Mail</label>
                                  <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={e => setEditForm(f => f ? { ...f, email: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* Telefon */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Telefon</label>
                                  <input
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={e => setEditForm(f => f ? { ...f, phone: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* Straße */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Straße</label>
                                  <input
                                    type="text"
                                    value={editForm.street}
                                    onChange={e => setEditForm(f => f ? { ...f, street: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* Hausnummer */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Hausnummer</label>
                                  <input
                                    type="text"
                                    value={editForm.house_number}
                                    onChange={e => setEditForm(f => f ? { ...f, house_number: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* PLZ */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">PLZ</label>
                                  <input
                                    type="text"
                                    value={editForm.postal_code}
                                    onChange={e => setEditForm(f => f ? { ...f, postal_code: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                                {/* Stadt */}
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Stadt</label>
                                  <input
                                    type="text"
                                    value={editForm.city}
                                    onChange={e => setEditForm(f => f ? { ...f, city: e.target.value } : f)}
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                </div>
                              </div>

                              {/* Passwort */}
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Neues Passwort <span className="text-gray-400">(optional – leer lassen = nicht ändern)</span>
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={editForm.new_password}
                                    onChange={e => setEditForm(f => f ? { ...f, new_password: e.target.value } : f)}
                                    placeholder="Neues Passwort eingeben…"
                                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    className="px-3 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg"
                                  >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                  </button>
                                </div>
                              </div>

                              {/* Save button */}
                              <button
                                onClick={() => handleSaveProfile(user.id)}
                                disabled={savingProfile}
                                className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                              >
                                {savingProfile
                                  ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                  : <Save size={16} />
                                }
                                Speichern
                              </button>
                            </div>

                            {/* ── Right: Kurse ── */}
                            <div>
                              <h3 className="text-sm font-semibold text-gray-700 mb-3">Kurs zuweisen</h3>

                              <div className="flex gap-2 mb-5">
                                <select
                                  value={selectedCourseId}
                                  onChange={e => setSelectedCourseId(e.target.value)}
                                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                >
                                  <option value="">Kurs auswählen…</option>
                                  {availableCoursesToAdd.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.title}
                                      {c.date ? ` (${new Date(c.date).toLocaleDateString('de-DE')})` : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleAddToCourse(user.id)}
                                  disabled={!selectedCourseId || addingCourse}
                                  title="Hinzufügen"
                                  className="flex items-center justify-center px-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                                >
                                  {addingCourse
                                    ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    : <Plus size={18} />
                                  }
                                </button>
                              </div>

                              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                                Aktuelle Buchungen
                              </h4>
                              {regsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-teal-500" />
                                  Lade…
                                </div>
                              ) : userRegistrations.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Keine aktiven Buchungen.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {userRegistrations.map(reg => (
                                    <li key={reg.id} className="flex items-start gap-2 text-xs text-gray-600">
                                      <UserCheck size={13} className="text-teal-500 flex-shrink-0 mt-0.5" />
                                      <span>
                                        {reg.courses?.title ?? '—'}
                                        {reg.courses?.date && (
                                          <span className="text-gray-400">
                                            {' '}({new Date(reg.courses.date).toLocaleDateString('de-DE')})
                                          </span>
                                        )}
                                        {reg.is_waitlist && (
                                          <span className="ml-1 text-orange-500 font-medium">
                                            Warteliste #{reg.waitlist_position}
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
