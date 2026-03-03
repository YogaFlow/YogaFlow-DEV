import React from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { de } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { Clock } from 'lucide-react';

registerLocale('de', de);

interface TimePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

const TimePicker: React.FC<TimePickerProps> = ({
  selected,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Zeit wählen',
  id
}) => {
  return (
    <div className="relative">
      <Clock className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none z-10" />
      <ReactDatePicker
        id={id}
        selected={selected}
        onChange={onChange}
        disabled={disabled}
        required={required}
        showTimeSelect
        showTimeSelectOnly
        timeIntervals={15}
        timeCaption="Zeit"
        dateFormat="HH:mm"
        timeFormat="HH:mm"
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

export default TimePicker;
