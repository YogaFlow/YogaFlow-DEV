import React from 'react';
import DatePicker from './DatePicker';
import { civilIsoToLocalDate, localDateToCivilIso } from '../../lib/courseDateTime';

interface CivilDatePickerProps {
  /** YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
  id?: string;
}

/** Deutscher Datumswähler (TT.MM.JJJJ) für Kalendertage als YYYY-MM-DD. */
const CivilDatePicker: React.FC<CivilDatePickerProps> = ({ value, onChange, min, max, disabled, id }) => (
  <DatePicker
    id={id}
    selected={civilIsoToLocalDate(value)}
    onChange={(date) => onChange(localDateToCivilIso(date))}
    minDate={civilIsoToLocalDate(min) ?? undefined}
    maxDate={civilIsoToLocalDate(max) ?? undefined}
    disabled={disabled}
    portalId="omlify-datepicker-portal"
  />
);

export default CivilDatePicker;
