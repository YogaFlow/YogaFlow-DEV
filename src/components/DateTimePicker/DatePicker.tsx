import React from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { de } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';

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
  id
}) => {
  return (
    <div className="relative">
      <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none z-10" />
      <ReactDatePicker
        id={id}
        selected={selected}
        onChange={onChange}
        minDate={minDate}
        maxDate={maxDate}
        disabled={disabled}
        required={required}
        dateFormat="dd.MM.yyyy"
        locale="de"
        placeholderText={placeholder}
        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        calendarClassName="shadow-lg border border-gray-200"
        wrapperClassName="w-full"
        showPopperArrow={false}
      />
    </div>
  );
};

export default DatePicker;
