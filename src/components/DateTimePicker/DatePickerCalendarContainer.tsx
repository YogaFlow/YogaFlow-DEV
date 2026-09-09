import React from 'react';
import { CalendarContainer } from 'react-datepicker';

interface DatePickerCalendarContainerProps {
  className?: string;
  children?: React.ReactNode;
  onToday: () => void;
  todayDisabled?: boolean;
}

const DatePickerCalendarContainer: React.FC<DatePickerCalendarContainerProps> = ({
  className,
  children,
  onToday,
  todayDisabled = false,
}) => (
  <div className="yogaflow-datepicker">
    <CalendarContainer className={className}>{children}</CalendarContainer>
    <div className="yogaflow-datepicker-footer flex items-center border-t border-border px-3 py-2">
      <button
        type="button"
        onClick={onToday}
        disabled={todayDisabled}
        className="text-sm font-medium text-brand hover:text-brandPressed disabled:cursor-not-allowed disabled:opacity-40"
      >
        Heute
      </button>
    </div>
  </div>
);

export default DatePickerCalendarContainer;
