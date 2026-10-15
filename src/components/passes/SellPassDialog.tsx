import React, { useEffect, useState } from 'react';
import type { ManualCheckoutMethod } from '../../lib/courseCheckout';
import {
  fetchSellablePassProducts,
  formatSellableProductLabel,
  sellPass,
  sellPassErrorMessage,
  type SellablePassProduct,
} from '../../lib/passes';
import { formatPassValidity } from '../../lib/passProducts';

const METHODS: { method: ManualCheckoutMethod; label: string; primary?: boolean }[] = [
  { method: 'cash', label: 'Bar', primary: true },
  { method: 'paypal_manual', label: 'PayPal' },
  { method: 'bank_transfer', label: 'Überweisung' },
];

export type SellPassDialogProps = {
  open: boolean;
  memberId: string;
  personName: string;
  onClose: () => void;
  onSold: (result: {
    passId: string;
    paymentId: string;
    validUntil: string;
    productName: string;
    units: number;
    method: ManualCheckoutMethod;
  }) => void;
};

const SellPassDialog: React.FC<SellPassDialogProps> = ({
  open,
  memberId,
  personName,
  onClose,
  onSold,
}) => {
  const [products, setProducts] = useState<SellablePassProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setBusy(false);
    setSelectedId(null);
    void fetchSellablePassProducts().then((list) => {
      if (cancelled) return;
      setProducts(list);
      setSelectedId(list.length === 1 ? list[0].id : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, memberId]);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      const frameId = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frameId);
    }
    setIsVisible(false);
    const timeoutId = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  if (!isMounted) return null;

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const sell = async (method: ManualCheckoutMethod) => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    const result = await sellPass(memberId, selected.id, method);
    setBusy(false);
    if (!result.ok) {
      setError(result.message || sellPassErrorMessage(result.code));
      return;
    }
    onSold({
      passId: result.pass_id,
      paymentId: result.payment_id,
      validUntil: result.valid_until,
      productName: selected.name,
      units: selected.units,
      method,
    });
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-4 transition-opacity duration-200 sm:items-center ${
        isVisible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={busy ? undefined : onClose}
    >
      <div
        className={`max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text">Kurskarte für {personName}</h3>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
          </div>
        ) : products.length === 0 ? (
          <p className="mt-4 text-[15px] text-textMuted">
            Gerade gibt es keine verkaufbaren Kurskarten.
          </p>
        ) : (
          <>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Kurskarte wählen</legend>
              {products.map((product) => {
                const active = selectedId === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedId(product.id)}
                    aria-pressed={active}
                    className={`flex min-h-[4.5rem] w-full flex-col items-start justify-center rounded-md border px-3.5 py-3 text-left transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-brand bg-brandSoft'
                        : 'border-border bg-surface active:bg-surfaceSunken'
                    }`}
                  >
                    <span
                      className={`text-[15px] font-medium tabular-nums ${
                        active ? 'text-brandOnSoft' : 'text-text'
                      }`}
                    >
                      {formatSellableProductLabel(product)}
                    </span>
                    <span
                      className={`mt-0.5 text-xs leading-5 ${
                        active ? 'text-brandOnSoft' : 'text-textMuted'
                      }`}
                    >
                      {formatPassValidity(product.validity_rule, product.validity_value)}
                    </span>
                  </button>
                );
              })}
            </fieldset>

            <div className="mt-5">
              <p className="mb-2 text-[13px] text-textMuted">Zahlart — Tipp verkauft direkt</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {METHODS.map((item) => (
                  <button
                    key={item.method}
                    type="button"
                    disabled={busy || !selected}
                    onClick={() => void sell(item.method)}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-medium disabled:opacity-50 ${
                      item.primary
                        ? 'bg-brand text-onBrand active:bg-brandPressed'
                        : 'border border-border text-text active:bg-surfaceSunken'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-[15px] text-text">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-6 py-2 text-sm font-semibold text-textMuted transition-colors hover:bg-surfaceSunken disabled:opacity-50"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
};

export default SellPassDialog;
