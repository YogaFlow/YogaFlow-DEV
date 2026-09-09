import React from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Course, Registration } from '../../types';

const formatDate = (dateString: string) => {
  try {
    const date = parseISO(dateString);
    if (isToday(date)) return 'Heute';
    if (isTomorrow(date)) return 'Morgen';
    return format(date, 'dd.MM.yyyy', { locale: de });
  } catch {
    return dateString;
  }
};

interface EnrollmentCardsProps {
  registrations: Registration[];
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({ registrations }) => (
  <div className="space-y-4">
    {registrations.map((registration) => {
      const course = registration.course as Course | undefined;
      if (!course) return null;

      const isWaitlist = registration.is_waitlist;

      return (
        <div
          key={registration.id}
          className="flex items-center rounded-lg border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex-1">
            <h3 className="font-medium text-text">{course.title}</h3>
            <div className="mt-1 flex items-center text-sm text-textMuted">
              <Calendar className="mr-1 h-4 w-4" />
              {formatDate(course.date)}
              <Clock className="ml-3 mr-1 h-4 w-4" />
              {course.time}
              {course.end_time && ` - ${course.end_time}`}
            </div>
            <div className="mt-1 flex items-center text-sm text-textMuted">
              <MapPin className="mr-1 h-4 w-4" />
              {course.location}
            </div>
            {course.teacher && (
              <p className="mt-1 text-xs text-textMuted">
                Lehrer: {course.teacher.first_name} {course.teacher.last_name}
              </p>
            )}
            <div
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isWaitlist
                  ? 'bg-yellow-50 text-yellow-700'
                  : 'bg-sage-100 text-brand'
              }`}
            >
              {isWaitlist
                ? registration.waitlist_position
                  ? `Warteliste (Pos. ${registration.waitlist_position})`
                  : 'Warteliste'
                : 'Angemeldet'}
            </div>
          </div>
          <div className="text-right">
            {course.price != null && (
              <p className="text-lg font-semibold text-brand">€{course.price}</p>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

export default EnrollmentCards;
