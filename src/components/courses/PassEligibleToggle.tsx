type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
};

/** Owner/Admin only — parent decides visibility (active pass products). */
export default function PassEligibleToggle({ checked, onChange, id = 'pass-eligible' }: Props) {
  return (
    <div className="rounded-md border border-border bg-surfaceSunken p-3.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
        />
        <div>
          <label htmlFor={id} className="block text-[15px] font-medium text-text">
            Mit Karte buchbar
          </label>
          <p className="mt-1 text-sm text-textMuted">Z. B. für Workshops ausschalten.</p>
        </div>
      </div>
    </div>
  );
}
