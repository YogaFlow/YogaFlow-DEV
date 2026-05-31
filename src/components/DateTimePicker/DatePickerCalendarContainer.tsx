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
    <div className="yogaflow-datepicker-footer flex items-center border-t border-gray-100 px-3 py-2">
      <button
        type="button"
        onClick={onToday}
        disabled={todayDisabled}
        className="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Heute
      </button>
    </div>
  </div>
);

export default DatePickerCalendarContainer;
