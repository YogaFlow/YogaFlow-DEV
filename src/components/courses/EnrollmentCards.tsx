import React from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import type { Course, Registration } from '../../types';
import { formatDayLabel, formatPrice, formatTimeRange } from '../../lib/format';

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
          className="flex items-center rounded-md border border-border bg-surface p-3.5"
        >
          <div className="flex-1">
            <h3 className="font-medium text-text">{course.title}</h3>
            <div className="mt-1 flex items-center text-sm text-textMuted">
              <Calendar className="mr-1 h-4 w-4" />
              <span className="tabular-nums">{formatDayLabel(course.date)}</span>
              <Clock className="ml-3 mr-1 h-4 w-4" />
              <span className="tabular-nums">{formatTimeRange(course.time, course.end_time)}</span>
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
                  ? 'bg-accentSoft text-accent'
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
              <p className="text-lg font-semibold text-brand tabular-nums">{formatPrice(course.price)}</p>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

export default EnrollmentCards;
