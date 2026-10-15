type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  disabled?: boolean;
  hint?: string;
};

/** Owner/Admin only — parent decides visibility (active pass products). */
export default function PassEligibleToggle({
  checked,
  onChange,
  id = 'pass-eligible',
  disabled = false,
  hint,
}: Props) {
  return (
    <div className="rounded-md border border-border bg-surfaceSunken p-3.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded-sm border-border text-brand focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div>
          <label
            htmlFor={id}
            className={`block text-[15px] font-medium ${disabled ? 'text-textSubtle' : 'text-text'}`}
          >
            Mit Kurskarte buchbar
          </label>
          <p className="mt-1 text-sm text-textMuted">
            {hint ?? 'Z. B. für Workshops ausschalten.'}
          </p>
        </div>
      </div>
    </div>
  );
}
