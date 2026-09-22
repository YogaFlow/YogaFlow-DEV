import React from 'react';
import { Check } from 'lucide-react';
import type { Course, Registration } from '../../types';
import { formatTimeRange, formatTodayOrTomorrow } from '../../lib/format';
import { formatStaffName } from '../../lib/staffNames';
import AccentPill from '../ui/AccentPill';
import CourseRow from './CourseRow';

interface EnrollmentCardsProps {
  registrations: Registration[];
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({ registrations }) => (
  <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
    {registrations.map((registration) => {
      const course = registration.course as Course | undefined;
      if (!course) return null;

      const isWaitlist = registration.is_waitlist;
      const teacherName = formatStaffName(course.teacher);
      const meta = [
        formatTodayOrTomorrow(course.date),
        formatTimeRange(course.time, course.end_time),
        teacherName,
        course.location,
      ]
        .filter(Boolean)
        .join(' · ');

      const status = isWaitlist ? (
        <AccentPill>
          {registration.waitlist_position
            ? `Warteliste (Pos. ${registration.waitlist_position})`
            : 'Warteliste'}
        </AccentPill>
      ) : (
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
          <Check className="h-4 w-4" aria-hidden />
          Angemeldet
        </span>
      );

      return (
        <CourseRow
          key={registration.id}
          course={course}
          href={`/course/${course.id}`}
          leading="date"
          meta={meta}
          status={status}
        />
      );
    })}
  </div>
);

export default EnrollmentCards;
