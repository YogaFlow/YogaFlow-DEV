import { AlertTriangle } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const baseControl =
  'w-full rounded-md border bg-surface px-3 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50';

function fieldControlClass(invalid: boolean, extra = ''): string {
  return `${baseControl} ${invalid ? 'border-danger' : 'border-border'} ${extra}`.trim();
}

export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className="mt-1 flex items-start gap-1.5 text-[13px] text-danger" role="alert">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </span>
  );
}

type FormFieldProps = {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'children'>;

/** Pflichtfeld mit Fehlerrand, Icon und aria-invalid (UX-1-Muster). */
export function FormField({
  id,
  label,
  error,
  hint,
  className = '',
  ...inputProps
}: FormFieldProps) {
  const invalid = Boolean(error);
  const errorId = `${id}-error`;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-[13px] text-textMuted">{label}</span>
      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={fieldControlClass(invalid, `h-11 ${className}`)}
        {...inputProps}
      />
      {invalid ? <FieldError id={errorId} message={error!} /> : null}
      {!invalid && hint ? <span className="mt-1 block text-[13px] text-textMuted">{hint}</span> : null}
    </label>
  );
}

type FormTextAreaProps = {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

export function FormTextArea({
  id,
  label,
  error,
  hint,
  className = '',
  ...textareaProps
}: FormTextAreaProps) {
  const invalid = Boolean(error);
  const errorId = `${id}-error`;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-[13px] text-textMuted">{label}</span>
      <textarea
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={fieldControlClass(invalid, `py-2 ${className}`)}
        {...textareaProps}
      />
      {invalid ? <FieldError id={errorId} message={error!} /> : null}
      {!invalid && hint ? <span className="mt-1 block text-[13px] text-textMuted">{hint}</span> : null}
    </label>
  );
}
