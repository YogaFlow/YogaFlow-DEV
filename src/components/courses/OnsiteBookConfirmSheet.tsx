import ModalBackdrop from '../ui/ModalBackdrop';
import { BINDING_BOOK_LABEL } from '../../lib/legalCheckoutTexts';
import { formatPrice } from '../../lib/format';

type Props = {
  open: boolean;
  busy?: boolean;
  courseTitle: string;
  courseWhen: string;
  price: number;
  cancelDeadlineLine: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

export default function OnsiteBookConfirmSheet({
  open,
  busy = false,
  courseTitle,
  courseWhen,
  price,
  cancelDeadlineLine,
  onConfirm,
  onClose,
}: Props) {
  return (
    <ModalBackdrop
      open={open}
      onDismiss={busy ? undefined : onClose}
      canDismiss={!busy}
      variant="sheet"
      panelClassName="max-w-md"
      labelledBy="onsite-book-confirm-title"
    >
      <div className="px-4 pb-6 pt-4" data-testid="onsite-book-confirm">
        <h2 id="onsite-book-confirm-title" className="text-[17px] font-medium text-text">
          Buchung bestätigen
        </h2>
        <div className="mt-4 space-y-2 text-[15px] leading-snug text-text">
          <p className="font-medium">{courseTitle}</p>
          <p className="text-textMuted">{courseWhen}</p>
          <p className="tabular-nums">{formatPrice(price)}</p>
          {cancelDeadlineLine ? (
            <p className="text-[13px] text-textMuted">{cancelDeadlineLine}</p>
          ) : null}
          <p className="text-[13px] text-textMuted">Du bezahlst vor Ort.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          data-testid="onsite-binding-book"
          className="mt-5 flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        >
          {BINDING_BOOK_LABEL}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-borderStrong bg-surface px-4 text-[15px] text-text active:bg-surfaceSunken disabled:opacity-50"
        >
          Abbrechen
        </button>
      </div>
    </ModalBackdrop>
  );
}
