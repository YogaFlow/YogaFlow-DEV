import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Users, FileText, Save, ArrowLeft, Repeat, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { DatePicker, TimePicker } from '../components/DateTimePicker';

interface CourseLeader {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const CreateCourse: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseLeaders, setCourseLeaders] = useState<CourseLeader[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [selectedEndTime, setSelectedEndTime] = useState<Date | null>(null);
  const [selectedRecurringEndDate, setSelectedRecurringEndDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    end_time: '',
    duration: '60',
    location: '',
    max_participants: '',
    price: ''
  });
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState<'daily' | 'weekly'>('weekly');
  const [recurringEndDate, setRecurringEndDate] = useState('');

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

  const getMaxEndDate = (): Date | null => {
    if (!selectedDate) return null;
    const maxDate = new Date(selectedDate);
    maxDate.setMonth(maxDate.getMonth() + 12);
    return maxDate;
  };

  useEffect(() => {
    fetchDefaultSettings();
    fetchCourseLeaders();
  }, []);

  useEffect(() => {
    if (userProfile && courseLeaders.length > 0) {
      if (userProfile.roles?.includes('course_leader')) {
        setSelectedTeacherId(userProfile.id);
      }
    }
  }, [userProfile, courseLeaders]);

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

  const fetchDefaultSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .eq('key', 'default_max_participants')
        .maybeSingle();

      if (error) {
        console.error('Error fetching default settings:', error);
        return;
      }

      if (data?.value) {
        setFormData(prev => ({
          ...prev,
          max_participants: String(data.value)
        }));
      }
    } catch (error) {
      console.error('Error fetching default settings:', error);
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

  const handleRecurringEndDateChange = (date: Date | null) => {
    setSelectedRecurringEndDate(date);
    setRecurringEndDate(dateToString(date));
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
    const courseDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    if (courseDate < today) {
      return 'Das Kursdatum muss in der Zukunft liegen.';
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

    if (isRecurring) {
      if (!recurringEndDate) {
        return 'Bitte geben Sie ein Enddatum für die wiederkehrenden Kurse an.';
      }

      const endDate = new Date(recurringEndDate);
      const maxEndDate = new Date(courseDate);
      maxEndDate.setMonth(maxEndDate.getMonth() + 12);

      if (endDate <= courseDate) {
        return 'Das Enddatum muss nach dem Startdatum liegen.';
      }

      if (endDate > maxEndDate) {
        return 'Das Enddatum darf maximal 12 Monate nach dem Startdatum liegen.';
      }

      const dates = generateRecurringDates();
      if (dates.length > 100) {
        return 'Es können maximal 100 Kurstermine auf einmal erstellt werden. Bitte passen Sie das Enddatum oder den Wiederholungstyp an.';
      }

      if (dates.length === 0) {
        return 'Es konnten keine gültigen Kurstermine generiert werden. Bitte überprüfen Sie Ihre Eingaben.';
      }
    }

    return null;
  };

  const generateRecurringDates = (): string[] => {
    if (!formData.date || !recurringEndDate) return [];

    const startDate = new Date(formData.date);
    const endDate = new Date(recurringEndDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

    const dates: string[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);

      if (recurringType === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 7);
      }
    }

    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    setLoading(true);
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    try {
      const coursesToCreate = [];
      const seriesId = isRecurring ? crypto.randomUUID() : null;

      if (isRecurring) {
        const dates = generateRecurringDates();

        if (dates.length === 0) {
          setError('Es konnten keine gültigen Kurstermine generiert werden.');
          setLoading(false);
          return;
        }

        for (const date of dates) {
          coursesToCreate.push({
            title: formData.title.trim(),
            description: formData.description.trim(),
            date: date,
            time: formData.time,
            end_time: formData.end_time || null,
            duration: formData.duration ? parseInt(formData.duration) : null,
            location: formData.location.trim(),
            max_participants: parseInt(formData.max_participants),
            price: parseFloat(formData.price),
            teacher_id: selectedTeacherId,
            series_id: seriesId
          });
        }
      } else {
        coursesToCreate.push({
          title: formData.title.trim(),
          description: formData.description.trim(),
          date: formData.date,
          time: formData.time,
          end_time: formData.end_time || null,
          duration: formData.duration ? parseInt(formData.duration) : null,
          location: formData.location.trim(),
          max_participants: parseInt(formData.max_participants),
          price: parseFloat(formData.price),
          teacher_id: selectedTeacherId
        });
      }

      if (coursesToCreate.length === 0) {
        setError('Keine Kurse zum Erstellen vorhanden.');
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('courses')
        .insert(coursesToCreate);

      if (insertError) throw insertError;

      const message = isRecurring
        ? `${coursesToCreate.length} Kurse erfolgreich erstellt!`
        : 'Kurs erfolgreich erstellt!';

      navigate('/my-courses', {
        state: { message }
      });
    } catch (err: any) {
      console.error('Error creating course:', err);
      const errorMessage = err?.message || 'Fehler beim Erstellen des Kurses. Bitte versuchen Sie es erneut.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Check if user has permission to create courses
  const hasPermission = userProfile && userProfile.roles && (
    userProfile.roles.includes('course_leader') || userProfile.roles.includes('admin')
  );

  if (!hasPermission) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Keine Berechtigung</h2>
        <p className="text-gray-600">Sie haben keine Berechtigung, Kurse zu erstellen.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Neuen Kurs erstellen</h1>
        <p className="text-gray-600">Erstellen Sie einen neuen Yoga-Kurs für Ihre Teilnehmer.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
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

          {/* Description */}
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

          {/* Course Leader Selection */}
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

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              {isRecurring ? 'Startdatum *' : 'Datum *'}
            </label>
            <DatePicker
              id="date"
              selected={selectedDate}
              onChange={handleDateChange}
              minDate={new Date()}
              required
              placeholder="Datum wählen"
            />
          </div>

          {/* Recurring Options */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center mb-4">
              <input
                id="isRecurring"
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <label htmlFor="isRecurring" className="ml-2 flex items-center text-sm font-medium text-gray-700">
                <Repeat className="w-4 h-4 mr-1" />
                Wiederkehrender Kurs
              </label>
            </div>

            {isRecurring && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Wiederholung *
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="weekly"
                        checked={recurringType === 'weekly'}
                        onChange={(e) => setRecurringType(e.target.value as 'daily' | 'weekly')}
                        className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Wöchentlich</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="daily"
                        checked={recurringType === 'daily'}
                        onChange={(e) => setRecurringType(e.target.value as 'daily' | 'weekly')}
                        className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Täglich</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="recurringEndDate" className="block text-sm font-medium text-gray-700 mb-2">
                    Enddatum (max. 12 Monate) *
                  </label>
                  <DatePicker
                    id="recurringEndDate"
                    selected={selectedRecurringEndDate}
                    onChange={handleRecurringEndDateChange}
                    minDate={selectedDate || new Date()}
                    maxDate={getMaxEndDate() || undefined}
                    required={isRecurring}
                    placeholder="Enddatum wählen"
                  />
                  {recurringEndDate && formData.date && (
                    <p className="mt-2 text-xs text-gray-500">
                      {generateRecurringDates().length} Kurse werden erstellt
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Start Time */}
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

            {/* Duration */}
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

            {/* End Time */}
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

          {/* Location */}
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
            {/* Max Participants */}
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

            {/* Price */}
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
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:ring-4 focus:ring-teal-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Wird erstellt...' : 'Kurs erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCourse;