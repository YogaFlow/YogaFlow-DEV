import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration, User } from '../types';
import { Calendar, Clock, MapPin, Users, Mail, Phone, Search, Filter, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

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
        let coursesQuery = supabase.from('courses').select('*');

        if (userProfile.roles?.includes('course_leader') && !userProfile.roles?.includes('admin')) {
          coursesQuery = coursesQuery.eq('teacher_id', userProfile.id);
        }

        const { data: coursesData, error: coursesError } = await coursesQuery
          .order('date', { ascending: true });

        if (coursesError) throw coursesError;
        if (!isMounted) return;
        setCourses(coursesData || []);

        let registrationsQuery = supabase
          .from('registrations')
          .select(`
            *,
            user:users(*),
            course:courses(*)
          `);

        if (userProfile.roles?.includes('course_leader') && !userProfile.roles?.includes('admin')) {
          const courseIds = coursesData?.map(c => c.id) || [];
          if (courseIds.length > 0) {
            registrationsQuery = registrationsQuery.in('course_id', courseIds);
          } else {
            if (isMounted) {
              setParticipants([]);
              setLoading(false);
            }
            return;
          }
        }

        const { data: registrationsData, error: registrationsError } = await registrationsQuery
          .order('registered_at', { ascending: false });

        if (registrationsError) throw registrationsError;
        if (isMounted) {
          setParticipants(registrationsData || []);
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

  const handleStatusChange = async (registrationId: string, newStatus: 'registered' | 'waitlist') => {
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: newStatus })
        .eq('id', registrationId);

      if (error) throw error;

      // Update local state
      setParticipants(prev => 
        prev.map(p => 
          p.id === registrationId 
            ? { ...p, status: newStatus }
            : p
        )
      );
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Fehler beim Aktualisieren des Status. Bitte versuchen Sie es erneut.');
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

  // Check permissions
  const hasPermission = userProfile && userProfile.roles && (
    userProfile.roles.includes('course_leader') || userProfile.roles.includes('admin')
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teilnehmer</h1>
          <p className="text-gray-600">Verwalten Sie Kursteilnehmer und Anmeldungen</p>
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
                  {course.title}
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                  {userProfile.roles?.includes('admin') && (
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
                        <div className="text-sm text-gray-500">
                          {participant.user.street} {participant.user.house_number}, {participant.user.postal_code} {participant.user.city}
                        </div>
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
                    {userProfile.roles?.includes('admin') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <select
                          value={participant.status}
                          onChange={(e) => handleStatusChange(participant.id, e.target.value as 'registered' | 'waitlist')}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        >
                          <option value="registered">Angemeldet</option>
                          <option value="waitlist">Warteliste</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Participants;