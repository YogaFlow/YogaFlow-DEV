import React, { useRef, useState } from 'react';
import { Calendar, Search } from 'lucide-react';
import FilterChip from './FilterChip';
import CourseFilterDatePicker from './CourseFilterDatePicker';
import {
  CourseDateFilterState,
  DateFilterPreset,
  clearDateFilter,
  formatFilterDateLabel,
  selectCustomDate,
  selectPreset,
} from '../../lib/courseDateFilter';

interface CourseFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterState: CourseDateFilterState;
  onFilterChange: (state: CourseDateFilterState) => void;
}

const QUICK_PRESETS: { id: Exclude<DateFilterPreset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Heute' },
  { id: 'tomorrow', label: 'Morgen' },
  { id: 'thisWeek', label: 'Diese Woche' },
];

const CourseFilterBar: React.FC<CourseFilterBarProps> = ({
  searchTerm,
  onSearchChange,
  filterState,
  onFilterChange,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVariant, setPickerVariant] = useState<'popover' | 'modal'>('popover');
  const dateChipRef = useRef<HTMLDivElement>(null);

  const isCustom = filterState.preset === 'custom' && filterState.customDate;

  const handlePresetClick = (preset: Exclude<DateFilterPreset, 'custom'>) => {
    setPickerOpen(false);
    onFilterChange(selectPreset(filterState, preset));
  };

  const openPicker = (variant: 'popover' | 'modal') => {
    setPickerVariant(variant);
    setPickerOpen(true);
  };

  const handleDateChipClick = () => {
    if (isCustom) return;
    if (pickerOpen && pickerVariant === 'popover') {
      setPickerOpen(false);
    } else {
      openPicker('popover');
    }
  };

  const handleCalendarClick = () => {
    openPicker('modal');
  };

  const handleCustomSelect = (isoDate: string) => {
    onFilterChange(selectCustomDate(isoDate));
    setPickerOpen(false);
  };

  const handleCustomClear = () => {
    onFilterChange(clearDateFilter());
    setPickerOpen(false);
  };

  const renderPresetChips = (compact: boolean) => {
    return QUICK_PRESETS.map(({ id, label }) => (
      <FilterChip
        key={id}
        label={label}
        active={filterState.preset === id}
        compact={compact}
        onClick={() => handlePresetClick(id)}
      />
    ));
  };

  const customChip = isCustom && filterState.customDate && (
    <FilterChip
      label={formatFilterDateLabel(filterState.customDate)}
      active
      compact={false}
      onClick={() => {}}
      onClear={() => onFilterChange(clearDateFilter())}
    />
  );

  const dateChooseChip = !isCustom && (
    <div ref={dateChipRef} className="relative hidden shrink-0 md:block">
      <FilterChip
        label="Datum wählen"
        active={pickerOpen && pickerVariant === 'popover'}
        compact
        onClick={handleDateChipClick}
      />
      {pickerOpen && pickerVariant === 'popover' && (
        <CourseFilterDatePicker
          isOpen
          variant="popover"
          anchorRef={dateChipRef}
          selectedIso={filterState.customDate}
          onSelect={handleCustomSelect}
          onClear={handleCustomClear}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-start md:gap-3">
        {/* Search */}
        <div className="relative w-full md:w-52 md:shrink-0 lg:w-60">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Kurse suchen..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Desktop: chips */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {isCustom && filterState.customDate ? (
            <FilterChip
              label={formatFilterDateLabel(filterState.customDate)}
              active
              compact
              onClick={() => {}}
              onClear={() => onFilterChange(clearDateFilter())}
            />
          ) : null}
          {renderPresetChips(true)}
          {dateChooseChip}
        </div>

        {/* Mobile: scrollable chips */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="-mx-1 flex flex-1 items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
            {customChip}
            {renderPresetChips(false)}
          </div>
          <button
            type="button"
            onClick={handleCalendarClick}
            aria-label="Datum auswählen"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <Calendar className="h-5 w-5" />
          </button>
        </div>
      </div>

      {pickerOpen && pickerVariant === 'modal' && (
        <CourseFilterDatePicker
          isOpen
          variant="modal"
          selectedIso={filterState.customDate}
          onSelect={handleCustomSelect}
          onClear={handleCustomClear}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default CourseFilterBar;
