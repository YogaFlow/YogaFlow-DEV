import React from 'react';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  onClear?: () => void;
  compact?: boolean;
  className?: string;
  'aria-label'?: string;
}

const FilterChip: React.FC<FilterChipProps> = ({
  label,
  active = false,
  onClick,
  onClear,
  compact = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const sizeClasses = compact
    ? 'px-3 py-1.5 text-sm min-h-0'
    : 'min-h-[44px] px-4 text-sm md:min-h-0 md:px-3 md:py-1.5';

  if (onClear && active) {
    return (
      <span
        className={`inline-flex shrink-0 items-center overflow-hidden rounded-full border font-medium ${sizeClasses} border-brand bg-brand text-white ${className}`}
      >
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          aria-label={ariaLabel ?? label}
          className="px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset md:px-3 md:py-1.5"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Datumsfilter entfernen"
          className="flex h-full items-center px-2 hover:bg-brandPressed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel ?? label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${sizeClasses} ${
        active
          ? 'border-brand bg-brand text-white'
          : 'border-border bg-white text-textMuted hover:bg-surfaceSunken'
      } ${className}`}
    >
      {label}
    </button>
  );
};

export default FilterChip;
