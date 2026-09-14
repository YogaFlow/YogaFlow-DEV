import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin } from 'lucide-react';
import type { Course, Registration } from '../../types';
import { formatDateBlock, formatDayLabel, formatPrice, formatTimeRange } from '../../lib/format';

interface EnrollmentCardsProps {
  registrations: Registration[];
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({ registrations }) => (
  <div className="space-y-4">
    {registrations.map((registration) => {
      const course = registration.course as Course | undefined;
      if (!course) return null;

      const isWaitlist = registration.is_waitlist;
      const dateBlock = formatDateBlock(course.date);

      return (
        <Link
          key={registration.id}
          to={`/course/${course.id}`}
          className="flex items-start gap-3 rounded-md border border-border bg-surface p-3.5 no-underline text-inherit active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {dateBlock ? (
            <div className="shrink-0">
              <div
                className="flex w-12 flex-col items-center justify-center rounded-sm bg-brandSoft py-1 text-center leading-tight text-brandOnSoft tabular-nums"
                aria-hidden
              >
                <span className="text-[12px] font-normal">{dateBlock.weekday}</span>
                <span className="text-[19px] font-medium">{dateBlock.day}</span>
                <span className="text-[12px] font-normal">{dateBlock.month}</span>
              </div>
              <span className="sr-only">{formatDayLabel(course.date)}</span>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-text">{course.title}</h3>
            <div className="mt-1 flex items-center text-sm text-textMuted">
              <Clock className="mr-1 h-4 w-4" />
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
                  ? 'bg-accentSoft text-accentText'
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
              <p className="text-lg font-medium text-brand tabular-nums">{formatPrice(course.price)}</p>
            )}
          </div>
        </Link>
      );
    })}
  </div>
);

export default EnrollmentCards;
