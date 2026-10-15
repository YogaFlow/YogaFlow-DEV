import React from 'react';

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

type SegmentControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  'aria-label'?: string;
  className?: string;
};

function SegmentControl<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  className = '',
}: SegmentControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex w-full rounded-sm bg-surfaceSunken p-1 ${className}`}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-sm px-3 text-[15px] font-medium ${
              selected ? 'bg-surface text-text' : 'text-textMuted active:bg-surface/60'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentControl;
