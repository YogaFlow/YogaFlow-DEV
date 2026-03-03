import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Users, FileText, Save, ArrowLeft, AlertCircle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { DatePicker, TimePicker } from '../components/DateTimePicker';

interface CourseLeader {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const EditCourse: React.FC = () => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [courseLeaders, setCourseLeaders] = useState<CourseLeader[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [seriesCount, setSeriesCount] = useState(0);
  const [updateScope, setUpdateScope] = useState<'single' | 'series'>('single');
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
    fetchCourseLeaders();
  }, [courseId]);

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

      if (data.teacher_id !== userProfile.id && !userProfile.roles?.includes('admin')) {
        setError('Sie haben keine Berechtigung, diesen Kurs zu bearbeiten.');
        setLoading(false);
        return;
      }

      setCourse(data);
      setSelectedTeacherId(data.teacher_id);
      setSelectedDate(stringToDate(data.date));
      setSelectedTime(stringToTime(data.time));
      setSelectedEndTime(stringToTime(data.end_time || ''));
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
        const { count } = await supabase
          .from('courses')
          .select('*', { count: 'exact', head: true })
          .eq('series_id', data.series_id);

        setSeriesCount(count || 0);
      }
    } catch (err: any) {
      console.error('Error fetching course:', err);
      setError('Fehler beim Laden des Kurses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseLeaders = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .contains('roles', ['course_leader'])
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
      return 'Bitte wählen Sie einen Kursleiter aus.';
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
      const updateData = {
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

      if (updateScope === 'series' && course.series_id) {
        const seriesUpdateData = { ...updateData };
        delete seriesUpdateData.date;

        const { error: updateError } = await supabase
          .from('courses')
          .update(seriesUpdateData)
          .eq('series_id', course.series_id);

        if (updateError) throw updateError;

        navigate('/my-courses', {
          state: { message: `Alle ${seriesCount} Kurse der Serie wurden erfolgreich aktualisiert!` }
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
      setError('Fehler beim Aktualisieren des Kurses. Bitte versuchen Sie es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const hasPermission = userProfile && userProfile.roles && (
    userProfile.roles.includes('course_leader') || userProfile.roles.includes('admin')
  );

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Keine Berechtigung</h2>
        <p className="text-gray-600">Sie haben keine Berechtigung, Kurse zu bearbeiten.</p>
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

  if (error && !course) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Fehler</h2>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => navigate('/my-courses')}
          className="mt-4 text-teal-600 hover:text-teal-700"
        >
          Zurück zu meinen Kursen
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/my-courses')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Kurs bearbeiten</h1>
        <p className="text-gray-600">Bearbeiten Sie die Details Ihres Yoga-Kurses.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Kurstitel *
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="z.B. Hatha Yoga für Anfänger"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Beschreibung *
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Beschreiben Sie den Kurs, Zielgruppe, Schwierigkeitsgrad..."
              required
            />
          </div>

          <div>
            <label htmlFor="teacher_id" className="block text-sm font-medium text-gray-700 mb-2">
              Kursleiter *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <select
                id="teacher_id"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none bg-white"
                required
              >
                <option value="">Bitte wählen Sie einen Kursleiter</option>
                {courseLeaders.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.first_name} {leader.last_name} ({leader.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {course?.series_id && seriesCount > 1 && (
            <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
              <div className="flex items-start mb-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-amber-900 mb-1">
                    Serientermin bearbeiten
                  </h3>
                  <p className="text-sm text-amber-700">
                    Dieser Kurs ist Teil einer Serie mit {seriesCount} Terminen.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center p-3 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
                  <input
                    type="radio"
                    value="single"
                    checked={updateScope === 'single'}
                    onChange={(e) => setUpdateScope(e.target.value as 'single' | 'series')}
                    className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-900">
                    Nur diesen Termin ändern
                  </span>
                </label>

                <label className="flex items-center p-3 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
                  <input
                    type="radio"
                    value="series"
                    checked={updateScope === 'series'}
                    onChange={(e) => setUpdateScope(e.target.value as 'single' | 'series')}
                    className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-900">
                    Alle {seriesCount} Termine der Serie ändern
                  </span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Datum *
            </label>
            <DatePicker
              id="date"
              selected={selectedDate}
              onChange={handleDateChange}
              disabled={updateScope === 'series' && course?.series_id !== null}
              required
              placeholder="Datum wählen"
            />
            {updateScope === 'series' && course?.series_id && (
              <p className="mt-1 text-xs text-amber-600">
                Bei Serienänderungen bleiben die individuellen Daten aller Termine erhalten.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-2">
                Kursbeginn *
              </label>
              <TimePicker
                id="time"
                selected={selectedTime}
                onChange={handleTimeChange}
                required
                placeholder="Zeit wählen"
              />
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="z.B. 60"
              />
            </div>

            <div>
              <label htmlFor="end_time" className="block text-sm font-medium text-gray-700 mb-2">
                Kursende
              </label>
              <TimePicker
                id="end_time"
                selected={selectedEndTime}
                onChange={handleEndTimeChange}
                placeholder="Zeit wählen"
              />
            </div>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              Ort *
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="location"
                name="location"
                type="text"
                value={formData.location}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="z.B. Yoga-Studio Mitte, Raum 1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="max_participants" className="block text-sm font-medium text-gray-700 mb-2">
                Max. Teilnehmer *
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  id="max_participants"
                  name="max_participants"
                  type="number"
                  min="1"
                  max="50"
                  value={formData.max_participants}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="z.B. 12"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
                Preis (EUR) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-400 font-semibold">€</span>
                <input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="z.B. 25.00"
                  required
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/my-courses')}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
