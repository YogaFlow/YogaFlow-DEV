import React, { useCallback, useState } from 'react';
import ReactDatePicker, { registerLocale } from 'react-datepicker';
import { de } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import { Clock } from 'lucide-react';
import PickerInput from './PickerInput';

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
  id,
}) => {
  const [open, setOpen] = useState(false);

  const handleChange = useCallback(
    (date: Date | null) => {
      onChange(date);
      setOpen(false);
    },
    [onChange]
  );

  const handleInputClick = useCallback(() => {
    if (!disabled) {
      setOpen(true);
    }
  }, [disabled]);

  return (
    <div className="relative">
      <Clock className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none z-10" />
      <ReactDatePicker
        id={id}
        selected={selected}
        onChange={handleChange}
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
        customInput={<PickerInput />}
        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        calendarClassName="rounded-lg border border-gray-200 bg-white shadow-xl"
        wrapperClassName="w-full"
        showPopperArrow={false}
        popperPlacement="bottom-start"
        popperClassName="yogaflow-timepicker-popper"
        open={open}
        onInputClick={handleInputClick}
        onClickOutside={() => setOpen(false)}
      />
    </div>
  );
};

export default TimePicker;
