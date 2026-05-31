import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { de } from 'date-fns/locale';
import { startOfDay } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';
import DatePickerCalendarContainer from './DatePickerCalendarContainer';
import { useIsMobile } from './useIsMobile';
import PickerInput from './PickerInput';

registerLocale('de', de);

interface DatePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({
  selected,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  required = false,
  placeholder = 'Datum wählen',
  id,
}) => {
  const isMobile = useIsMobile();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  const todayInRange = useMemo(() => {
    const min = minDate ? startOfDay(minDate) : null;
    const max = maxDate ? startOfDay(maxDate) : null;
    return (!min || today >= min) && (!max || today <= max);
  }, [minDate, maxDate, today]);

  const handleToday = useCallback(() => {
    onChange(new Date());
    setDesktopOpen(false);
    setMobileOpen(false);
  }, [onChange]);

  const handleChange = useCallback(
    (date: Date | null) => {
      onChange(date);
      setDesktopOpen(false);
      if (isMobile) {
        setMobileOpen(false);
      }
    },
    [onChange, isMobile]
  );

  const handleInputClick = useCallback(() => {
    if (disabled) return;
    if (isMobile) {
      setMobileOpen(true);
      return;
    }
    setDesktopOpen(true);
  }, [disabled, isMobile]);

  const CalendarContainerWrapper = useCallback(
    ({ className, children }: { className?: string; children?: React.ReactNode }) => (
      <DatePickerCalendarContainer
        className={className}
        onToday={handleToday}
        todayDisabled={!todayInRange}
      >
        {children}
      </DatePickerCalendarContainer>
    ),
    [handleToday, todayInRange]
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const sharedPickerProps = {
    selected,
    onChange: handleChange,
    minDate,
    maxDate,
    disabled,
    locale: 'de' as const,
    calendarClassName: 'yogaflow-datepicker-calendar',
    calendarContainer: CalendarContainerWrapper,
  };

  return (
    <div className="relative">
      <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none z-10" />
      <ReactDatePicker
        id={id}
        {...sharedPickerProps}
        required={required}
        dateFormat="dd.MM.yyyy"
        placeholderText={placeholder}
        customInput={<PickerInput />}
        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        wrapperClassName="w-full"
        showPopperArrow={false}
        popperPlacement="bottom-start"
        popperClassName="yogaflow-datepicker-popper"
        open={isMobile ? false : desktopOpen}
        onInputClick={handleInputClick}
        onClickOutside={() => setDesktopOpen(false)}
      />
      {isMobile && mobileOpen && !disabled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Datum auswählen"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            aria-label="Schließen"
            onClick={() => setMobileOpen(false)}
          />
          <div className="yogaflow-datepicker-modal relative z-10 w-[min(calc(100vw-2rem),23rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <ReactDatePicker inline {...sharedPickerProps} />
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
