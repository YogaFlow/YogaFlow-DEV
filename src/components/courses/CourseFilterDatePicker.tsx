import React, { useCallback, useEffect, useRef } from 'react';
import ReactDatePicker, { registerLocale, CalendarContainer } from 'react-datepicker';
import { de } from 'date-fns/locale';
import { parseISO } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';
import { toIsoDate } from '../../lib/courseDateFilter';

registerLocale('de', de);

interface CourseFilterDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIso: string | null;
  onSelect: (isoDate: string) => void;
  onClear: () => void;
  variant: 'popover' | 'modal';
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const CourseFilterDatePicker: React.FC<CourseFilterDatePickerProps> = ({
  isOpen,
  onClose,
  selectedIso,
  onSelect,
  onClear,
  variant,
  anchorRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = selectedIso ? parseISO(selectedIso) : null;

  const handleSelect = useCallback(
    (date: Date | null) => {
      if (date) {
        onSelect(toIsoDate(date));
        onClose();
      }
    },
    [onSelect, onClose]
  );

  const handleToday = useCallback(() => {
    onSelect(toIsoDate(new Date()));
    onClose();
  }, [onSelect, onClose]);

  const handleClear = useCallback(() => {
    onClear();
    onClose();
  }, [onClear, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || variant !== 'popover') return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen, onClose, variant, anchorRef]);

  const CustomContainer: React.FC<{
    className?: string;
    children?: React.ReactNode;
  }> = ({ className, children }) => (
    <div className="course-filter-datepicker">
      <CalendarContainer className={className}>{children}</CalendarContainer>
      <div className="course-filter-datepicker-footer flex items-center justify-between border-t border-gray-100 px-3 py-2">
        <button
          type="button"
          onClick={handleToday}
          className="text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          Heute
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Löschen
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  const calendar = (
    <ReactDatePicker
      inline
      selected={selected}
      onChange={handleSelect}
      minDate={today}
      locale="de"
      calendarClassName="course-filter-datepicker-calendar"
      calendarContainer={CustomContainer}
    />
  );

  if (variant === 'modal') {
    return (
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
          onClick={onClose}
        />
        <div
          ref={containerRef}
          className="course-filter-datepicker-modal relative z-10 w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        >
          {calendar}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute left-0 top-full z-50 mt-2">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
        {calendar}
      </div>
    </div>
  );
};

export default CourseFilterDatePicker;
