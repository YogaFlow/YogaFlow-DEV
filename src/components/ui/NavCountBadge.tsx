import { openPaymentsBadge } from '../../lib/paymentsTabs';

type NavCountBadgeProps = {
  count: number;
  /** aria-label, z. B. „3 ungelesene Neuigkeiten" */
  label: string;
  /** Aktiv-Zustand des NavLink (hell auf Brand). */
  active?: boolean;
};

/**
 * Zähler rechts neben dem Menütext — Zahlungen und „Neu für dich" teilen dasselbe Design.
 */
export default function NavCountBadge({ count, label, active = false }: NavCountBadgeProps) {
  const text = openPaymentsBadge(count);
  if (!text) return null;
  return (
    <span
      aria-label={label}
      className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums ${
        active ? 'bg-onBrand/15 text-onBrand' : 'bg-brand text-onBrand'
      }`}
    >
      {text}
    </span>
  );
}
