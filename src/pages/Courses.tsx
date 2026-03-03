import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, Users, Plus, Search, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';

const Courses: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, { registered: number; waitlist: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('courses')
          .select(`
            *,
            teacher:users!courses_teacher_id_fkey(first_name, last_name)
          `)
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (isMounted) {
          setCourses(data || []);

          if (data && data.length > 0) {
            const courseIds = data.map(c => c.id);
            const { data: countsData, error: countsError } = await supabase.rpc(
              'get_course_participant_counts',
              { p_course_ids: courseIds }
            );

            if (!countsError && countsData && isMounted) {
              const countsMap: Record<string, { registered: number; waitlist: number }> = {};
              countsData.forEach((c: { course_id: string; registered_count: number; waitlist_count: number }) => {
                countsMap[c.course_id] = {
                  registered: c.registered_count,
                  waitlist: c.waitlist_count
                };
              });
              setParticipantCounts(countsMap);
            }
          }
        }

        if (userProfile?.roles?.includes('participant')) {
          const { data: regData, error: regError } = await supabase
            .from('registrations')
            .select('course_id, status, is_waitlist, waitlist_position')
            .eq('user_id', userProfile.id);

          if (!regError && isMounted) {
            setRegistrations(regData || []);
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          teacher:users!courses_teacher_id_fkey(first_name, last_name)
        `)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      setCourses(data || []);

      if (data && data.length > 0) {
        const courseIds = data.map(c => c.id);
        const { data: countsData, error: countsError } = await supabase.rpc(
          'get_course_participant_counts',
          { p_course_ids: courseIds }
        );

        if (!countsError && countsData) {
          const countsMap: Record<string, { registered: number; waitlist: number }> = {};
          countsData.forEach((c: { course_id: string; registered_count: number; waitlist_count: number }) => {
            countsMap[c.course_id] = {
              registered: c.registered_count,
              waitlist: c.waitlist_count
            };
          });
          setParticipantCounts(countsMap);
        }
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRegistrations = async () => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('course_id, status, is_waitlist, waitlist_position')
        .eq('user_id', userProfile.id);

      if (error) throw error;
      setRegistrations(data || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
    }
  };

  const handleRegister = async (courseId: string) => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase.rpc('register_for_course', {
        p_course_id: courseId,
        p_user_id: userProfile.id
      });

      if (error) throw error;

      if (data && !data.success) {
        alert(data.message || 'Fehler bei der Anmeldung.');
        return;
      }

      fetchCourses();
      fetchUserRegistrations();

      if (data.waitlist_position) {
        alert(`Sie wurden auf die Warteliste gesetzt (Position ${data.waitlist_position}). Sie werden benachrichtigt, wenn ein Platz frei wird.`);
      } else {
        alert(data.message || 'Erfolgreich angemeldet!');
      }
    } catch (error) {
      console.error('Error registering for course:', error);
      alert('Fehler bei der Anmeldung. Bitte versuchen Sie es erneut.');
    }
  };

  const handleUnregister = async (courseId: string) => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase.rpc('unregister_from_course', {
        p_course_id: courseId,
        p_user_id: userProfile.id
      });

      if (error) throw error;

      if (data && !data.success) {
        alert(data.message || 'Fehler bei der Abmeldung.');
        return;
      }

      fetchCourses();
      fetchUserRegistrations();

      alert(data.message || 'Erfolgreich abgemeldet!');
    } catch (error) {
      console.error('Error unregistering from course:', error);
      alert('Fehler bei der Abmeldung. Bitte versuchen Sie es erneut.');
    }
  };

  const isUserRegistered = (courseId: string) => {
    return registrations.some(reg => reg.course_id === courseId);
  };

  const getUserRegistrationStatus = (courseId: string) => {
    const reg = registrations.find(reg => reg.course_id === courseId);
    return reg?.status || null;
  };

  const getUserWaitlistPosition = (courseId: string) => {
    const reg = registrations.find(reg => reg.course_id === courseId);
    return reg?.waitlist_position || null;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      if (isToday(date)) {
        return 'Heute';
      } else if (isTomorrow(date)) {
        return 'Morgen';
      }
      return format(date, 'dd.MM.yyyy', { locale: de });
    } catch {
      return dateString;
    }
  };

  const isCourseInPast = (course: Course) => {
    try {
      const now = new Date();
      const courseDate = parseISO(course.date);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const courseDateOnly = new Date(courseDate.getFullYear(), courseDate.getMonth(), courseDate.getDate());

      if (courseDateOnly < today) {
        return true;
      }

      if (courseDateOnly.getTime() === today.getTime() && course.time) {
        const [hours, minutes] = course.time.split(':').map(Number);
        const courseDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours || 0, minutes || 0);
        return courseDateTime < now;
      }

      return false;
    } catch {
      return false;
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          course.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !filterDate || course.date === filterDate;

    const isParticipantOnly = !isAdmin && !isCourseLeader;
    if (isParticipantOnly && isCourseInPast(course)) {
      return false;
    }

    return matchesSearch && matchesDate;
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Kurse</h1>
          <p className="text-gray-600">Entdecken Sie unsere Yoga-Kurse</p>
        </div>
        
        {(isAdmin || isCourseLeader) && (
          <button
            onClick={() => navigate('/create-course')}
            className="mt-4 sm:mt-0 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Neuer Kurs
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Kurse suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('grid')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                view === 'grid' 
                  ? 'bg-white text-teal-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Raster
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                view === 'list' 
                  ? 'bg-white text-teal-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Liste
            </button>
          </div>
        </div>
      </div>

      {/* Courses Grid/List */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Kurse gefunden</h3>
          <p className="text-gray-600">
            {searchTerm || filterDate 
              ? 'Versuchen Sie andere Suchkriterien.' 
              : 'Derzeit sind keine Kurse verfügbar.'}
          </p>
        </div>
      ) : (
        <div className={view === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
          : 'space-y-4'
        }>
          {filteredCourses.map((course) => {
            const registeredCount = participantCounts[course.id]?.registered || 0;
            const isRegistered = isUserRegistered(course.id);
            const registrationStatus = getUserRegistrationStatus(course.id);
            const waitlistPosition = getUserWaitlistPosition(course.id);
            const isFull = registeredCount >= course.max_participants;

            return (
              <div key={course.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow ${
                view === 'list' ? 'flex' : ''
              }`}>
                {view === 'grid' ? (
                  <>
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                        <span className="text-xl font-bold text-teal-600">€{course.price}</span>
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          {formatDate(course.date)}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="w-4 h-4 mr-2" />
                          {course.time}{course.end_time && ` - ${course.end_time}`}
                          {course.duration && ` (${course.duration} Min.)`}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-2" />
                          {course.location}
                        </div>
                        {(isAdmin || isCourseLeader) && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Users className="w-4 h-4 mr-2" />
                            {registeredCount}/{course.max_participants} Teilnehmer
                          </div>
                        )}
                      </div>

                      {course.teacher && (
                        <p className="text-xs text-gray-500 mb-4">
                          Lehrer: {course.teacher.first_name} {course.teacher.last_name}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${
                            isFull ? 'bg-red-500' : (course.max_participants - registeredCount <= 2 ? 'bg-yellow-500' : 'bg-green-500')
                          }`}></div>
                          <span className="text-xs text-gray-600">
                            {isFull ? 'Leider schon ausgebucht' : (course.max_participants - registeredCount <= 2 ? `noch ${course.max_participants - registeredCount} ${course.max_participants - registeredCount === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                          </span>
                        </div>

                        {course.status === 'active' && course.teacher_id !== userProfile?.id && (
                          <div>
                            {isRegistered ? (
                              <div className="flex flex-col items-end gap-2">
                                <div className={`px-2 py-1 text-xs rounded-full ${
                                  registrationStatus === 'registered'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {registrationStatus === 'registered'
                                    ? 'Angemeldet'
                                    : waitlistPosition
                                      ? `Warteliste (Pos. ${waitlistPosition})`
                                      : 'Warteliste'}
                                </div>
                                <button
                                  onClick={() => handleUnregister(course.id)}
                                  className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors whitespace-nowrap flex-shrink-0"
                                >
                                  Abmelden
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRegister(course.id)}
                                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                                  isFull
                                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                    : 'bg-teal-600 text-white hover:bg-teal-700'
                                }`}
                              >
                                {isFull ? 'Warteliste' : 'Anmelden'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                          <p className="text-gray-600 text-sm mt-1">{course.description}</p>
                          
                          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              {formatDate(course.date)}
                            </div>
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              {course.time}{course.end_time && ` - ${course.end_time}`}
                              {course.duration && ` (${course.duration} Min.)`}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-1" />
                              {course.location}
                            </div>
                            {(isAdmin || isCourseLeader) && (
                              <div className="flex items-center">
                                <Users className="w-4 h-4 mr-1" />
                                {registeredCount}/{course.max_participants} Teilnehmer
                              </div>
                            )}
                          </div>

                          {course.teacher && (
                            <p className="text-xs text-gray-500 mt-2">
                              Lehrer: {course.teacher.first_name} {course.teacher.last_name}
                            </p>
                          )}

                          <div className="flex items-center mt-3">
                            <div className={`w-3 h-3 rounded-full mr-2 ${
                              isFull ? 'bg-red-500' : (course.max_participants - registeredCount <= 2 ? 'bg-yellow-500' : 'bg-green-500')
                            }`}></div>
                            <span className="text-xs text-gray-600">
                              {isFull ? 'Leider schon ausgebucht' : (course.max_participants - registeredCount <= 2 ? `noch ${course.max_participants - registeredCount} ${course.max_participants - registeredCount === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                            </span>
                          </div>
                        </div>

                        <div className="ml-6 text-right">
                          <span className="text-xl font-bold text-teal-600">€{course.price}</span>

                          {course.status === 'active' && course.teacher_id !== userProfile?.id && (
                              <div className="mt-4">
                                {isRegistered ? (
                                  <div className="flex flex-col items-start gap-2">
                                    <div className={`px-2 py-1 text-xs rounded-full ${
                                      registrationStatus === 'registered'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {registrationStatus === 'registered'
                                        ? 'Angemeldet'
                                        : waitlistPosition
                                          ? `Warteliste (Pos. ${waitlistPosition})`
                                          : 'Warteliste'}
                                    </div>
                                    <button
                                      onClick={() => handleUnregister(course.id)}
                                      className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors whitespace-nowrap flex-shrink-0"
                                    >
                                      Abmelden
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleRegister(course.id)}
                                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                                      isFull
                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                        : 'bg-teal-600 text-white hover:bg-teal-700'
                                    }`}
                                  >
                                    {isFull ? 'Warteliste' : 'Anmelden'}
                                  </button>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Courses;