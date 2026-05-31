import React from 'react';

type PickerInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  value?: string;
};

const PickerInput = React.forwardRef<HTMLInputElement, PickerInputProps>(
  ({ value, className, ...props }, ref) => (
    <input
      {...props}
      ref={ref}
      value={value ?? ''}
      readOnly
      autoComplete="off"
      className={className}
    />
  )
);

PickerInput.displayName = 'PickerInput';

export default PickerInput;
