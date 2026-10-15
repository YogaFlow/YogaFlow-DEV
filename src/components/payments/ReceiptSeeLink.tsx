import React from 'react';
import { Link } from 'react-router-dom';
import { PAYMENT_RECEIPT_LINK_LABEL } from '../../lib/paymentTexts';

/** Link „Beleg ansehen“ plus die Nummer als Text. */
const ReceiptSeeLink: React.FC<{ receiptId: string; number: string }> = ({
  receiptId,
  number,
}) => (
  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
    <Link
      to={`/receipts/${receiptId}`}
      data-testid="receipt-link"
      className="inline-flex h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[13px] font-medium text-brand active:bg-surfaceSunken"
    >
      {PAYMENT_RECEIPT_LINK_LABEL}
    </Link>
    <span className="text-[13px] tabular-nums text-textMuted" data-testid="receipt-number">
      Beleg {number}
    </span>
  </span>
);

export default ReceiptSeeLink;
