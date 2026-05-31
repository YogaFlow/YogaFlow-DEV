import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration, User } from '../types';
import { isCourseManagerRole, isStudioAdmin, isTeacherOnly } from '../lib/userRoles';
import { Calendar, Clock, Users, Mail, Phone, Search, Filter, Download, UserMinus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import { isCourseUpcoming } from '../lib/courseDateTime';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { formatUserAddress } from '../lib/userAddress';

interface ParticipantWithDetails extends Registration {
  user: User;
  course: Course;
}

const Participants: React.FC = () => {
  const { courseId } = useParams<{ courseId?: string }>();
  const { userProfile } = useAuth();
  const [participants, setParticipants] = useState<ParticipantWithDetails[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      setSelectedCourse(courseId);
    }
  }, [courseId]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!userProfile) return;

      try {
        await runPastRegistrationCleanup();
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .order('date', { ascending: true });

        if (coursesError) throw coursesError;
        const upcomingCourses = (coursesData || []).filter((course) => isCourseUpcoming(course));
        if (!isMounted) return;
        setCourses(upcomingCourses);

        const { data: registrationsData, error: registrationsError } = await supabase
          .from('registrations')
          .select(`
            *,
            user:users(*),
            course:courses(*)
          `)
          .order('registered_at', { ascending: false });

        if (registrationsError) throw registrationsError;
        if (isMounted) {
          const upcomingParticipants = (registrationsData || []).filter(
            (registration: any) =>
              registration.course &&
              isCourseUpcoming(registration.course) &&
              registration.cancellation_timestamp == null
          );
          setParticipants(upcomingParticipants);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const isActiveRegistration = (participant: ParticipantWithDetails) =>
    participant.status === 'registered' && !participant.is_waitlist;

  const canUnregisterParticipant = (participant: ParticipantWithDetails): boolean => {
    if (!userProfile) return false;
    if (isStudioAdmin(userProfile)) return true;
    if (isTeacherOnly(userProfile)) {
      return (
        participant.course.teacher_id === userProfile.id &&
        isActiveRegistration(participant)
      );
    }
    return false;
  };

  const handleUnregister = async (participant: ParticipantWithDetails) => {
    const name = `${participant.user.first_name} ${participant.user.last_name}`.trim();
    const courseTitle = participant.course.title;
    if (
      !window.confirm(
        `Möchten Sie ${name || 'diesen Teilnehmer'} wirklich vom Kurs „${courseTitle}" abmelden?`
      )
    ) {
      return;
    }

    setUnregisteringId(participant.id);
    try {
      const { data, error } = await supabase.rpc('admin_unregister_user_from_course', {
        p_user_id: participant.user_id,
        p_course_id: participant.course_id,
      });

      if (error) throw error;

      type RpcResult = { success: boolean; error?: string; message?: string };
      const result = data as RpcResult;

      if (!result.success) {
        if (result.error === 'not_registered') {
          setFeedbackDialog({
            title: 'Hinweis',
            message: 'Für diesen Kurs liegt keine aktive Anmeldung vor.',
            type: 'info',
          });
        } else if (result.error === 'Teachers can only unregister active participants from their own courses') {
          setFeedbackDialog({
            title: 'Keine Berechtigung',
            message: 'Lehrer können nur aktive Teilnehmer bei eigenen Kursen abmelden.',
            type: 'error',
          });
        } else {
          throw new Error(result.error || 'Abmeldung fehlgeschlagen.');
        }
        return;
      }

      setParticipants(prev => prev.filter(p => p.id !== participant.id));
      setFeedbackDialog({
        title: 'Abgemeldet',
        message: result.message || 'Teilnehmer wurde erfolgreich abgemeldet.',
        type: 'success',
      });
    } catch (error) {
      console.error('Error unregistering participant:', error);
      setFeedbackDialog({
        title: 'Abmeldung fehlgeschlagen',
        message: error instanceof Error ? error.message : 'Fehler beim Abmelden. Bitte versuchen Sie es erneut.',
        type: 'error',
      });
    } finally {
      setUnregisteringId(null);
    }
  };

  const formatRegistrationDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return dateString;
    }
  };

  const exportParticipants = () => {
    const csvContent = [
      ['Kurs', 'Datum', 'Teilnehmer', 'E-Mail', 'Telefon', 'Status', 'Anmeldedatum'].join(','),
      ...filteredParticipants.map(p => [
        `"${p.course?.title || ''}"`,
        p.course?.date || '',
        `"${p.user?.first_name || ''} ${p.user?.last_name || ''}"`,
        p.user?.email || '',
        p.user?.phone || '',
        p.status === 'registered'
          ? 'Angemeldet'
          : p.waitlist_position
            ? `Warteliste (Pos. ${p.waitlist_position})`
            : 'Warteliste',
        formatRegistrationDate(p.registered_at)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `teilnehmer_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredParticipants = participants.filter(participant => {
    if (!participant.user || !participant.course) return false;

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (participant.user.first_name || '').toLowerCase().includes(searchLower) ||
      (participant.user.last_name || '').toLowerCase().includes(searchLower) ||
      (participant.user.email || '').toLowerCase().includes(searchLower) ||
      (participant.course.title || '').toLowerCase().includes(searchLower);

    const matchesCourse = !selectedCourse || participant.course_id === selectedCourse;
    const matchesStatus = !selectedStatus || participant.status === selectedStatus;

    return matchesSearch && matchesCourse && matchesStatus;
  });

  const showActionsColumn = filteredParticipants.some(canUnregisterParticipant);

  const hasPermission = isCourseManagerRole(userProfile);

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Keine Berechtigung</h2>
        <p className="text-gray-600">Sie haben keine Berechtigung, diese Seite zu sehen.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teilnehmer</h1>
          <p className="text-gray-600">
            {userProfile && userProfile.role === 'teacher'
              ? 'Alle Studio-Anmeldungen für kommende Kurse'
              : 'Verwalten Sie Kursteilnehmer und Anmeldungen'}
          </p>
        </div>
        
        {filteredParticipants.length > 0 && (
          <button
            onClick={exportParticipants}
            className="mt-4 sm:mt-0 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Teilnehmer suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none"
            >
              <option value="">Alle Kurse</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.title} – {format(parseISO(course.date), 'dd.MM.yyyy', { locale: de })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="">Alle Status</option>
              <option value="registered">Angemeldet</option>
              <option value="waitlist">Warteliste</option>
            </select>
          </div>

          <div className="text-sm text-gray-600 flex items-center">
            <Users className="w-4 h-4 mr-2" />
            {filteredParticipants.length} Teilnehmer
          </div>
        </div>
      </div>

      {/* Participants List */}
      {filteredParticipants.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Teilnehmer gefunden</h3>
          <p className="text-gray-600">
            {searchTerm || selectedCourse || selectedStatus 
              ? 'Versuchen Sie andere Filterkriterien.' 
              : 'Es sind noch keine Teilnehmer angemeldet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-3">
            {filteredParticipants.map((participant) => (
              <div key={participant.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {participant.user.first_name} {participant.user.last_name}
                    </div>
                    {formatUserAddress(participant.user) && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {formatUserAddress(participant.user)}
                      </div>
                    )}
                  </div>
                  <span className={`flex-shrink-0 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    participant.status === 'registered'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {participant.status === 'registered'
                      ? 'Angemeldet'
                      : participant.waitlist_position
                        ? `WL ${participant.waitlist_position}`
                        : 'Warteliste'}
                  </span>
                </div>

                <div className="text-sm font-medium text-gray-800 mb-1">{participant.course.title}</div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(participant.course.date), 'dd.MM.yyyy', { locale: de })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {participant.course.time}{participant.course.end_time && ` – ${participant.course.end_time}`}
                  </span>
                </div>

                <div className="space-y-1 text-xs mb-3">
                  <a href={`mailto:${participant.user.email}`} className="flex items-center gap-1.5 text-gray-600 hover:text-teal-600">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{participant.user.email}</span>
                  </a>
                  {participant.user.phone && (
                    <a href={`tel:${participant.user.phone}`} className="flex items-center gap-1.5 text-gray-600 hover:text-teal-600">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      {participant.user.phone}
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {format(parseISO(participant.registered_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </span>
                  {canUnregisterParticipant(participant) && (
                    <button
                      type="button"
                      onClick={() => handleUnregister(participant)}
                      disabled={unregisteringId === participant.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {unregisteringId === participant.id ? (
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                      ) : (
                        <UserMinus className="w-3 h-3" />
                      )}
                      Abmelden
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Teilnehmer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kurs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kontakt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Angemeldet
                    </th>
                    {showActionsColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aktionen
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredParticipants.map((participant) => (
                    <tr key={participant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {participant.user.first_name} {participant.user.last_name}
                          </div>
                          {formatUserAddress(participant.user) && (
                            <div className="text-sm text-gray-500">
                              {formatUserAddress(participant.user)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {participant.course.title}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {format(parseISO(participant.course.date), 'dd.MM.yyyy', { locale: de })}
                            <Clock className="w-3 h-3 ml-2 mr-1" />
                            {participant.course.time}{participant.course.end_time && ` - ${participant.course.end_time}`}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          <a href={`mailto:${participant.user.email}`} className="hover:text-teal-600">
                            {participant.user.email}
                          </a>
                        </div>
                        <div className="text-sm text-gray-500 flex items-center mt-1">
                          <Phone className="w-3 h-3 mr-1" />
                          <a href={`tel:${participant.user.phone}`} className="hover:text-teal-600">
                            {participant.user.phone}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          participant.status === 'registered'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {participant.status === 'registered'
                            ? 'Angemeldet'
                            : participant.waitlist_position
                              ? `Warteliste (Pos. ${participant.waitlist_position})`
                              : 'Warteliste'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(parseISO(participant.registered_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </td>
                      {showActionsColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {canUnregisterParticipant(participant) ? (
                            <button
                              type="button"
                              onClick={() => handleUnregister(participant)}
                              disabled={unregisteringId === participant.id}
                              className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-700 disabled:opacity-50"
                            >
                              {unregisteringId === participant.id ? (
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                              ) : (
                                <UserMinus className="w-4 h-4" />
                              )}
                              Abmelden
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Participants;