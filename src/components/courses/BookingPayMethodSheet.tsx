import { CreditCard, MapPin, Ticket } from 'lucide-react';
import ModalBackdrop from '../ui/ModalBackdrop';
import type { BookingPayMethod, BookingPayMethodOption } from '../../lib/bookingPaymentOptions';
import {
  methodChoiceHint,
  methodChoiceTitle,
} from '../../lib/bookingMethodTexts';

type Props = {
  open: boolean;
  methods: BookingPayMethodOption[];
  selected: BookingPayMethod;
  onSelect: (method: BookingPayMethod) => void;
  onClose: () => void;
};

function IconFor({ method }: { method: BookingPayMethod }) {
  if (method === 'pass') return <Ticket className="h-5 w-5" aria-hidden />;
  if (method === 'online') return <CreditCard className="h-5 w-5" aria-hidden />;
  return <MapPin className="h-5 w-5" aria-hidden />;
}

export default function BookingPayMethodSheet({
  open,
  methods,
  selected,
  onSelect,
  onClose,
}: Props) {
  return (
    <ModalBackdrop
      open={open}
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-md"
      labelledBy="booking-pay-method-title"
    >
      <div className="px-4 pb-6 pt-4">
        <h2 id="booking-pay-method-title" className="text-[17px] font-medium text-text">
          Anders bezahlen
        </h2>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Zahlungsweg</legend>
          {methods.map((opt) => {
            const active = opt.method === selected;
            const title =
              opt.method === 'pass' && opt.label
                ? opt.label
                : methodChoiceTitle(opt.method);
            return (
              <label
                key={opt.method}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-3 ${
                  active ? 'border-brand bg-brandSoft/40' : 'border-border bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="booking-pay-method"
                  className="sr-only"
                  checked={active}
                  onChange={() => {
                    onSelect(opt.method);
                    onClose();
                  }}
                />
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    active ? 'bg-brand text-onBrand' : 'bg-surfaceSunken text-textMuted'
                  }`}
                >
                  <IconFor method={opt.method} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-text">{title}</span>
                  <span className="block text-[13px] text-textMuted">
                    {methodChoiceHint(opt.method)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </ModalBackdrop>
  );
}
