import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  displayReceiptTaxText,
  formatLegalCents,
  RECEIPT_HEADING,
  RECEIPT_PRINT_LABEL,
  refundReceiptHeading,
} from '../lib/legalCheckoutTexts';
import { loadReceipt, type ReceiptRecord } from '../lib/receipts';
import { formatNumericDate } from '../lib/format';
import { berlinIsoFromInstant } from '../lib/courseDateTime';

function issuedDate(iso: string): string {
  return formatNumericDate(berlinIsoFromInstant(iso)) || iso;
}

function ReceiptBody({ receipt }: { receipt: ReceiptRecord }) {
  const snap = receipt.snapshot;
  const heading =
    receipt.kind === 'refund_receipt' && snap.original_number
      ? refundReceiptHeading(snap.original_number)
      : RECEIPT_HEADING;
  const seller = [
    snap.legal_name,
    `${snap.street ?? ''} ${snap.house_number ?? ''}`.trim(),
    `${snap.postal_code ?? ''} ${snap.city ?? ''}`.trim(),
    snap.contact_email,
    snap.phone,
  ].filter(Boolean);

  return (
    <article className="mx-auto max-w-lg rounded-md border border-border bg-surface p-5 print:border-0 print:p-0">
      <h1 className="text-[22px] font-medium text-text">{heading}</h1>
      <dl className="mt-4 space-y-2 text-[15px] text-text">
        <div className="flex justify-between gap-3">
          <dt className="text-textMuted">Belegnummer</dt>
          <dd className="tabular-nums">{receipt.number}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-textMuted">Datum</dt>
          <dd className="tabular-nums">{issuedDate(receipt.issued_at)}</dd>
        </div>
      </dl>
      <section className="mt-5">
        <h2 className="text-[13px] font-medium text-textMuted">Verkäuferin</h2>
        <p className="mt-1 whitespace-pre-line text-[15px] leading-6 text-text">{seller.join('\n')}</p>
      </section>
      <section className="mt-5">
        <h2 className="text-[13px] font-medium text-textMuted">Leistung</h2>
        <p className="mt-1 text-[15px] leading-6 text-text">{snap.service_text ?? 'Yogakurs'}</p>
        <p className="mt-1 text-[13px] text-textMuted">Menge 1</p>
      </section>
      <p className="mt-5 text-[22px] font-medium tabular-nums text-text">
        {formatLegalCents(receipt.amount_cents)}
      </p>
      <p className="mt-1 text-[15px] text-text">
        {displayReceiptTaxText(snap.regime, snap.tax_text)}
      </p>
    </article>
  );
}

export default function Receipt() {
  const { receiptId } = useParams<{ receiptId: string }>();
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    if (!receiptId) {
      setMissing(true);
      setLoading(false);
      return;
    }
    void loadReceipt(receiptId).then((row) => {
      if (!active) return;
      setReceipt(row);
      setMissing(row == null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [receiptId]);

  return (
    <div className="mx-auto max-w-lg space-y-4 print:max-w-none">
      <style>{`@media print { nav, header, footer, .no-print { display: none !important; } }`}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to="/my-registrations" className="text-[15px] font-medium text-brand">
          Zurück
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center rounded-full border border-borderStrong px-4 text-[15px] font-medium text-text active:bg-surfaceSunken"
        >
          {RECEIPT_PRINT_LABEL}
        </button>
      </div>
      {loading ? <p className="text-[15px] text-textMuted">Wird geladen…</p> : null}
      {missing ? (
        <p role="alert" className="text-[15px] text-text">
          Der Beleg ist nicht verfügbar.
        </p>
      ) : null}
      {receipt ? <ReceiptBody receipt={receipt} /> : null}
    </div>
  );
}
