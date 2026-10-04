import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Users, Save, ArrowLeft, AlertCircle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { visibleMembers } from '../lib/visibleScope';
import { futureSeriesCourses, pastCourseEditLocks } from '../lib/courseDateTime';
import { countActivePassProducts } from '../lib/passProducts';
import { Course } from '../types';
import { DatePicker, TimePicker } from '../components/DateTimePicker';
import PassEligibleToggle from '../components/courses/PassEligibleToggle';
import { FormField, FormTextArea } from '../components/ui/FormField';
import { isTeacherOnly, TEACHER_SELF_HINT } from '../lib/userRoles';
import { PRICE_ABOVE_LIMIT_HINT } from '../lib/legalCheckoutTexts';

interface CourseLeader {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

type SeriesSessionRow = {
  id: string;
  date: string;
  time: string;
};

const EditCourse: React.FC = () => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { userProfile, isCourseLeader, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [courseLeaders, setCourseLeaders] = useState<CourseLeader[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [seriesSessions, setSeriesSessions] = useState<SeriesSessionRow[]>([]);
  const [updateScope, setUpdateScope] = useState<'single' | 'series'>('single');
  const [passEligible, setPassEligible] = useState(true);
  const [showPassEligible, setShowPassEligible] = useState(false);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    end_time: '',
    duration: '',
    location: '',
    max_participants: '',
    price: ''
  });

  const timeToMinutes = (time: string): number => {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const stringToDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr + 'T00:00:00');
    return isNaN(date.getTime()) ? null : date;
  };

  const stringToTime = (timeStr: string): Date | null => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const dateToString = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const timeToString = (date: Date | null): string => {
    if (!date) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  useEffect(() => {
    fetchCourse();
  }, [courseId]);

  useEffect(() => {
    void supabase.rpc('get_payment_setup_status').then(({ data }) => {
      setOnlineEnabled(data?.online_payments_enabled === true);
    });
  }, []);

  useEffect(() => {
    if (userProfile) fetchCourseLeaders();
  }, [userProfile]);

  useEffect(() => {
    if (!isAdmin) {
      setShowPassEligible(false);
      return;
    }
    let cancelled = false;
    void countActivePassProducts().then((n) => {
      if (!cancelled) setShowPassEligible(n > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (formData.time && formData.duration) {
      const startMinutes = timeToMinutes(formData.time);
      const durationMinutes = parseInt(formData.duration);
      if (!isNaN(startMinutes) && !isNaN(durationMinutes) && durationMinutes > 0) {
        const calculatedEndTime = minutesToTime(startMinutes + durationMinutes);
        if (formData.end_time !== calculatedEndTime) {
          setFormData(prev => ({ ...prev, end_time: calculatedEndTime }));
        }
      }
    }
  }, [formData.time, formData.duration]);

  const fetchCourse = async () => {
    if (!courseId || !userProfile) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Kurs nicht gefunden.');
        setLoading(false);
        return;
      }

      if (data.teacher_id !== userProfile.id && !isAdmin) {
        setError('Du hast keine Berechtigung, diesen Kurs zu bearbeiten.');
        setLoading(false);
        return;
      }

      setCourse(data);
      setSelectedTeacherId(data.teacher_id);
      setSelectedDate(stringToDate(data.date));
      setSelectedTime(stringToTime(data.time));
      setSelectedEndTime(stringToTime(data.end_time || ''));
      setPassEligible(data.pass_eligible !== false);
      setFormData({
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        end_time: data.end_time || '',
        duration: data.duration ? data.duration.toString() : '60',
        location: data.location,
        max_participants: data.max_participants.toString(),
        price: data.price.toString()
      });

      if (data.series_id) {
        const { data: seriesRows, error: seriesError } = await supabase
          .from('courses')
          .select('id, date, time')
          .eq('series_id', data.series_id);

        if (seriesError) throw seriesError;
        setSeriesSessions(seriesRows ?? []);
      } else {
        setSeriesSessions([]);
      }
    } catch (err: any) {
      console.error('Error fetching course:', err);
      setError('Fehler beim Laden des Kurses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseLeaders = async () => {
    if (!userProfile) return;

    if (userProfile.role === 'teacher') {
      setCourseLeaders([{
        id: userProfile.id,
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
        email: userProfile.email,
      }]);
      return;
    }

    try {
      const { data, error } = await visibleMembers('id, first_name, last_name, email')
        .in('role', ['teacher', 'admin', 'owner'])
        .is('anonymized_at', null)
        .order('last_name', { ascending: true });

      if (error) throw error;
      setCourseLeaders(data || []);
    } catch (error) {
      console.error('Error fetching course leaders:', error);
    }
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    setFormData(prev => ({
      ...prev,
      date: dateToString(date)
    }));
  };

  const handleTimeChange = (time: Date | null) => {
    setSelectedTime(time);
    const timeStr = timeToString(time);
    setFormData(prev => ({ ...prev, time: timeStr }));

    if (timeStr && formData.duration) {
      const startMinutes = timeToMinutes(timeStr);
      const durationMinutes = parseInt(formData.duration);
      if (!isNaN(startMinutes) && !isNaN(durationMinutes)) {
        const endTimeStr = minutesToTime(startMinutes + durationMinutes);
        const endTime = stringToTime(endTimeStr);
        setSelectedEndTime(endTime);
        setFormData(prev => ({ ...prev, end_time: endTimeStr }));
      }
    }
  };

  const handleEndTimeChange = (time: Date | null) => {
    setSelectedEndTime(time);
    const endTimeStr = timeToString(time);
    setFormData(prev => ({ ...prev, end_time: endTimeStr }));

    if (endTimeStr && formData.time) {
      const startMinutes = timeToMinutes(formData.time);
      const endMinutes = timeToMinutes(endTimeStr);
      if (!isNaN(startMinutes) && !isNaN(endMinutes) && endMinutes > startMinutes) {
        setFormData(prev => ({ ...prev, duration: String(endMinutes - startMinutes) }));
      }
    }
  };

  const handleDurationChange = (value: string) => {
    setFormData(prev => ({ ...prev, duration: value }));

    if (value && formData.time) {
      const startMinutes = timeToMinutes(formData.time);
      const durationMinutes = parseInt(value);
      if (!isNaN(startMinutes) && !isNaN(durationMinutes)) {
        const endTimeStr = minutesToTime(startMinutes + durationMinutes);
        const endTime = stringToTime(endTimeStr);
        setSelectedEndTime(endTime);
        setFormData(prev => ({ ...prev, end_time: endTimeStr }));
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'duration') {
      handleDurationChange(value);
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const validateForm = (): string | null => {
    const maxParticipants = parseInt(formData.max_participants);
    const price = parseFloat(formData.price);

    if (!selectedTeacherId) {
      return 'Bitte wähle einen Kursleiter aus.';
    }

    if (formData.title.trim().length < 3) {
      return 'Der Kurstitel muss mindestens 3 Zeichen lang sein.';
    }

    if (formData.title.trim().length > 200) {
      return 'Der Kurstitel darf maximal 200 Zeichen lang sein.';
    }

    if (formData.description.trim().length < 10) {
      return 'Die Beschreibung muss mindestens 10 Zeichen lang sein.';
    }

    if (formData.description.trim().length > 2000) {
      return 'Die Beschreibung darf maximal 2000 Zeichen lang sein.';
    }

    if (formData.location.trim().length === 0) {
      return 'Der Ort darf nicht leer sein.';
    }

    if (isNaN(maxParticipants) || maxParticipants < 1) {
      return 'Die maximale Teilnehmerzahl muss mindestens 1 sein.';
    }

    if (maxParticipants > 50) {
      return 'Die maximale Teilnehmerzahl darf nicht größer als 50 sein.';
    }

    if (isNaN(price) || price < 0) {
      return 'Der Preis muss eine positive Zahl sein.';
    }

    if (price > 1000) {
      return 'Der Preis darf nicht größer als 1000 EUR sein.';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !courseId || !course) return;

    setSaving(true);
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    try {
      const updateData: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        date: formData.date,
        time: formData.time,
        end_time: formData.end_time || null,
        duration: formData.duration ? parseInt(formData.duration) : null,
        location: formData.location.trim(),
        max_participants: parseInt(formData.max_participants),
        price: parseFloat(formData.price),
        teacher_id: selectedTeacherId,
        updated_at: new Date().toISOString()
      };

      if (showPassEligible) {
        updateData.pass_eligible = passEligible;
      }

      const pastLocks = pastCourseEditLocks(course, { isManager: isAdmin });
      if (pastLocks.begun && updateScope === 'single') {
        delete updateData.date;
        delete updateData.time;
        delete updateData.end_time;
        delete updateData.duration;
        delete updateData.price;
        delete updateData.max_participants;
        delete updateData.pass_eligible;
        if (pastLocks.teacherLocked) {
          delete updateData.teacher_id;
        }
      }

      if (updateScope === 'series' && course.series_id) {
        const upcoming = futureSeriesCourses(seriesSessions);
        if (upcoming.length === 0) {
          setError('Diese Serie hat keine kommenden Termine mehr.');
          setSaving(false);
          return;
        }

        const seriesUpdateData: Record<string, unknown> = { ...updateData };
        delete seriesUpdateData.date;

        const upcomingIds = upcoming.map((row) => row.id);
        const { data: updatedRows, error: updateError } = await supabase
          .from('courses')
          .update(seriesUpdateData)
          .in('id', upcomingIds)
          .select('id');

        if (updateError) throw updateError;
        if ((updatedRows?.length ?? 0) !== upcomingIds.length) {
          throw new Error('Serienupdate hat nicht alle kommenden Termine geschrieben.');
        }

        navigate('/my-courses', {
          state: {
            message: `${upcomingIds.length} kommende Termine der Serie wurden aktualisiert.`,
          },
        });
      } else {
        const { error: updateError } = await supabase
          .from('courses')
          .update(updateData)
          .eq('id', courseId);

        if (updateError) throw updateError;

        navigate('/my-courses', {
          state: { message: 'Kurs erfolgreich aktualisiert!' }
        });
      }
    } catch (err: any) {
      console.error('Error updating course:', err);
      setError('Fehler beim Aktualisieren des Kurses. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const hasPermission = isCourseLeader;
  const seriesCount = seriesSessions.length;
  const futureCount = futureSeriesCourses(seriesSessions).length;
  const seriesSaveBlocked = updateScope === 'series' && course?.series_id != null && futureCount === 0;
  const pastLocks = pastCourseEditLocks(course, { isManager: isAdmin });
  const applyPastLocks = pastLocks.begun && !(updateScope === 'series' && futureCount > 0);
  const scheduleMoneyLocked = applyPastLocks && pastLocks.scheduleAndMoneyLocked;
  const teacherFieldLocked = applyPastLocks && pastLocks.teacherLocked;
  const teacherSelfOnly = isTeacherOnly(userProfile);
  const leaderOptions = teacherSelfOnly
    ? courseLeaders.filter((leader) => leader.id === userProfile?.id)
    : courseLeaders;
  const pastHint = 'Der Kurs hat schon stattgefunden.';
  const teacherPastHint = 'Nur ändern, wenn jemand anderes den Kurs gegeben hat.';
  const dateDisabled =
    scheduleMoneyLocked || (updateScope === 'series' && course?.series_id != null);

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-text mb-2">Keine Berechtigung</h2>
        <p className="text-textMuted">Du hast keine Berechtigung, Kurse zu bearbeiten.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  if (error && !course) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-text mb-2">Fehler</h2>
        <p className="text-textMuted">{error}</p>
        <button
          onClick={() => navigate('/my-courses')}
          className="mt-4 text-brand hover:text-brandPressed"
        >
          Zurück zur Kursverwaltung
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/my-courses')}
          className="flex items-center text-textMuted hover:text-text mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </button>
      </div>

      <div className="bg-surface rounded-md border border-border">
        <form onSubmit={handleSubmit} className="p-3.5 space-y-6">
          <FormField
            id="title"
            name="title"
            label="Kurstitel *"
            type="text"
            value={formData.title}
            onChange={handleChange}
            placeholder="z.B. Hatha Yoga für Anfänger"
            error={
              error.includes('Kurstitel')
                ? error
                : null
            }
            required
          />

          <FormTextArea
            id="description"
            name="description"
            label="Beschreibung *"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            placeholder="Beschreibe den Kurs, Zielgruppe, Schwierigkeitsgrad..."
            error={
              error.includes('Beschreibung')
                ? error
                : null
            }
            required
          />

          <div>
            <label htmlFor="teacher_id" className="block text-sm font-medium text-textMuted mb-2">
              Kursleiter *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
              <select
                id="teacher_id"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                disabled={teacherFieldLocked || teacherSelfOnly}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent appearance-none bg-surface disabled:cursor-not-allowed disabled:bg-surfaceSunken disabled:opacity-60"
                required
              >
                <option value="">Bitte wähle einen Kursleiter</option>
                {leaderOptions.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.first_name} {leader.last_name} ({leader.email})
                  </option>
                ))}
              </select>
            </div>
            {applyPastLocks && isAdmin ? (
              <p className="mt-1 text-xs text-textMuted">{teacherPastHint}</p>
            ) : null}
            {teacherFieldLocked ? (
              <p className="mt-1 text-xs text-textMuted">{pastHint}</p>
            ) : teacherSelfOnly ? (
              <p className="mt-1 text-xs text-textMuted">{TEACHER_SELF_HINT}</p>
            ) : null}
            {courseLeaders.length === 0 && (
              <p className="mt-2 text-sm text-text">
                Keine Kursleiter gefunden. Bitte in der Nutzerverwaltung mindestens einen Nutzer als Kursleiter anlegen.
              </p>
            )}
          </div>

          {course?.series_id && seriesCount > 1 && (
            <div className="border border-accent rounded-sm p-4 bg-accentSoft">
              <div className="flex items-start mb-3">
                <AlertCircle className="w-5 h-5 text-accent mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-text mb-1">
                    Serientermin bearbeiten
                  </h3>
                  <p className="text-sm text-text">
                    Dieser Kurs ist Teil einer Serie mit {seriesCount} Terminen.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center p-3 border border-accent rounded-sm cursor-pointer hover:bg-accentSoft transition-colors">
                  <input
                    type="radio"
                    value="single"
                    checked={updateScope === 'single'}
                    onChange={(e) => setUpdateScope(e.target.value as 'single' | 'series')}
                    className="w-4 h-4 text-brand border-border focus:ring-brand"
                  />
                  <span className="ml-3 text-sm font-medium text-text">
                    Nur diesen Termin ändern
                  </span>
                </label>

                <label className="flex items-center p-3 border border-accent rounded-sm cursor-pointer hover:bg-accentSoft transition-colors">
                  <input
                    type="radio"
                    value="series"
                    checked={updateScope === 'series'}
                    onChange={(e) => setUpdateScope(e.target.value as 'single' | 'series')}
                    className="w-4 h-4 text-brand border-border focus:ring-brand"
                  />
                  <span className="ml-3 text-sm font-medium text-text">
                    Serie ändern ({futureCount} kommende Termine)
                  </span>
                </label>
              </div>

              {updateScope === 'series' ? (
                <p className="mt-3 text-sm text-text">
                  {futureCount === 0
                    ? 'Diese Serie hat keine kommenden Termine mehr.'
                    : `Die Änderung gilt für die ${futureCount} kommenden Termine dieser Serie. Vergangene Termine bleiben, wie sie waren.`}
                </p>
              ) : null}
            </div>
          )}

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-textMuted mb-2">
              Datum *
            </label>
            <DatePicker
              id="date"
              selected={selectedDate}
              onChange={handleDateChange}
              disabled={dateDisabled}
              required
              placeholder="Datum wählen"
            />
            {scheduleMoneyLocked ? (
              <p className="mt-1 text-xs text-textMuted">{pastHint}</p>
            ) : null}
            {!scheduleMoneyLocked && updateScope === 'series' && course?.series_id ? (
              <p className="mt-1 text-xs text-text">
                Bei Serienänderungen bleiben die individuellen Daten aller Termine erhalten.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-textMuted mb-2">
                Kursbeginn *
              </label>
              <TimePicker
                id="time"
                selected={selectedTime}
                onChange={handleTimeChange}
                disabled={scheduleMoneyLocked}
                required
                placeholder="Zeit wählen"
              />
              {scheduleMoneyLocked ? (
                <p className="mt-1 text-xs text-textMuted">{pastHint}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-textMuted mb-2">
                Dauer (Min.)
              </label>
              <input
                id="duration"
                name="duration"
                type="number"
                min="15"
                step="15"
                value={formData.duration}
                onChange={handleChange}
                disabled={scheduleMoneyLocked}
                className="w-full px-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent disabled:cursor-not-allowed disabled:bg-surfaceSunken disabled:opacity-60"
                placeholder="z.B. 60"
              />
            </div>

            <div>
              <label htmlFor="end_time" className="block text-sm font-medium text-textMuted mb-2">
                Kursende
              </label>
              <TimePicker
                id="end_time"
                selected={selectedEndTime}
                onChange={handleEndTimeChange}
                disabled={scheduleMoneyLocked}
                placeholder="Zeit wählen"
              />
            </div>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-textMuted mb-2">
              Ort *
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
              <input
                id="location"
                name="location"
                type="text"
                value={formData.location}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="z.B. Yoga-Studio Mitte, Raum 1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="max_participants" className="block text-sm font-medium text-textMuted mb-2">
                Max. Teilnehmer *
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-3 h-5 w-5 text-textSubtle" />
                <input
                  id="max_participants"
                  name="max_participants"
                  type="number"
                  min="1"
                  max="50"
                  value={formData.max_participants}
                  onChange={handleChange}
                  disabled={scheduleMoneyLocked}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent disabled:cursor-not-allowed disabled:bg-surfaceSunken disabled:opacity-60"
                  placeholder="z.B. 12"
                  required
                />
              </div>
              {scheduleMoneyLocked ? (
                <p className="mt-1 text-xs text-textMuted">{pastHint}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="price" className="block text-sm font-medium text-textMuted mb-2">
                Preis (EUR) *
              </label>
              <div className="relative">
                <input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={handleChange}
                  disabled={scheduleMoneyLocked}
                  className="w-full pl-4 pr-10 py-3 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent disabled:cursor-not-allowed disabled:bg-surfaceSunken disabled:opacity-60"
                  placeholder="z.B. 25.00"
                  required
                />
                <span className="absolute right-3 top-3 text-textSubtle font-semibold">€</span>
              </div>
              {scheduleMoneyLocked ? (
                <p className="mt-1 text-xs text-textMuted">{pastHint}</p>
              ) : null}
              {onlineEnabled && Number.parseFloat(formData.price) > 250 ? (
                <p className="mt-2 text-sm text-textMuted">{PRICE_ABOVE_LIMIT_HINT}</p>
              ) : null}
            </div>
          </div>

          {showPassEligible ? (
            <PassEligibleToggle
              checked={passEligible}
              onChange={setPassEligible}
              disabled={scheduleMoneyLocked}
              hint={scheduleMoneyLocked ? pastHint : undefined}
            />
          ) : null}

          {error && !error.includes('Kurstitel') && !error.includes('Beschreibung') ? (
            <div className="p-3 bg-dangerSoft border border-danger rounded-sm">
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-border">
            <button
              type="button"
              onClick={() => navigate('/my-courses')}
              className="px-4 py-2 text-textMuted bg-surfaceSunken hover:bg-borderStrong rounded-sm transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving || seriesSaveBlocked}
              className="flex items-center px-6 py-2 bg-brand text-onBrand rounded-sm hover:bg-brandPressed focus:ring-4 focus:ring-brandSoft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCourse;
