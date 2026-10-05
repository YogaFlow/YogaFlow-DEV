/**
 * K1 — Online-Kartenkauf: Payment Element + Pflicht-Consent + Widerrufsbelehrung.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import { paymentMessageForCode, PAYMENT_RETRY_LABEL } from '../../lib/paymentTexts';
import { checkoutPriceLine, type TaxRegime } from '../../lib/legalCheckoutTexts';
import {
  BINDING_BUY_PASS_LABEL,
  PASS_IMMEDIATE_USE_TEXT,
  PASS_WITHDRAWAL_BELEHRUNG_BODY,
  PASS_WITHDRAWAL_INFO_TEXT,
  passCheckoutSummary,
  passSuccessHeadline,
} from '../../lib/passOnlineTexts';
import { hashLegalText } from '../../lib/passLegalHash';
import type { OnlinePassProduct } from '../../lib/passProducts';
import { supabase } from '../../lib/supabase';
import {
  clearPaymentAttempt,
  storePaymentAttempt,
  usePaymentCheckout,
} from './usePaymentCheckout';
import StripePaymentForm, { handleStripeNextAction } from './StripePaymentForm';
import { PaymentFormPlaceholder } from './PaymentSheetView';

type Props = {
  open: boolean;
  product: OnlinePassProduct | null;
  studioName: string;
  onClose: () => void;
  onFinished: () => void;
};

const PassPurchaseSheet: React.FC<Props> = ({
  open,
  product,
  studioName,
  onClose,
  onFinished,
}) => {
  const navigate = useNavigate();
  const config = useMemo(() => paymentsClientConfig(), []);
  const checkout = usePaymentCheckout();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState(false);
  const [belehrungOpen, setBelehrungOpen] = useState(false);
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('small_business');
  const [vatBp, setVatBp] = useState(0);
  const [hashes, setHashes] = useState<{ immediate: string; withdrawal: string } | null>(
    null,
  );
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setConsent(false);
    setStarted(false);
    setBelehrungOpen(false);
    checkout.reset();
    void Promise.all([
      hashLegalText(PASS_IMMEDIATE_USE_TEXT),
      hashLegalText(PASS_WITHDRAWAL_INFO_TEXT),
      supabase
        .from('tenant_tax_settings')
        .select('regime, vat_rate_bp')
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([immediate, withdrawal, tax]) => {
      setHashes({ immediate, withdrawal });
      if (tax.data?.regime === 'regular' || tax.data?.regime === 'small_business') {
        setTaxRegime(tax.data.regime);
      }
      if (typeof tax.data?.vat_rate_bp === 'number') setVatBp(tax.data.vat_rate_bp);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const startPrepare = useCallback(async () => {
    if (!product || !hashes) return;
    if (!config.enabled || !config.publishableKey) {
      checkout.fail('ONLINE_DISABLED');
      return;
    }
    setStarted(true);
    const prep = await checkout.runPreparePass(
      product.id,
      hashes.immediate,
      hashes.withdrawal,
    );
    if (prep) storePaymentAttempt(`pass:${product.id}`, prep.attemptId);
  }, [checkout, config, hashes, product]);

  if (!mounted || !open || !product) return null;

  const summary = passCheckoutSummary({
    name: product.name,
    units: product.units,
    validityRule: product.validity_rule,
    validityValue: product.validity_value,
  });
  const amount = checkout.prepare?.amountCents ?? product.price_cents;
  const priceLine = checkoutPriceLine(amount, taxRegime, vatBp);
  const canClose =
    checkout.phase !== 'submitting' &&
    checkout.phase !== 'action' &&
    checkout.phase !== 'processing';

  const successDone =
    checkout.phase === 'done' &&
    (checkout.code === 'COMPLETED' ||
      checkout.code === 'ALREADY_COMPLETED' ||
      checkout.code === 'RESTORED');

  const showPayForm =
    started &&
    Boolean(checkout.prepare) &&
    Boolean(config.publishableKey) &&
    (checkout.phase === 'ready' ||
      checkout.phase === 'submitting' ||
      checkout.phase === 'action' ||
      checkout.phase === 'retrying' ||
      (checkout.phase === 'error' &&
        (checkout.code === 'CARD_DECLINED' ||
          checkout.code === 'AUTHENTICATION_REQUIRED' ||
          checkout.code === 'PROVIDER_UNAVAILABLE')));

  const consentBlock = (
    <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
        checked={consent}
        disabled={started}
        onChange={(ev) => {
          const on = ev.target.checked;
          setConsent(on);
          if (on && hashes && !started) void startPrepare();
        }}
        data-testid="pass-immediate-consent"
      />
      <span className="text-[14px] leading-snug text-text">{PASS_IMMEDIATE_USE_TEXT}</span>
    </label>
  );

  const handleClose = () => {
    if (!canClose) return;
    if (successDone) onFinished();
    clearPaymentAttempt(`pass:${product.id}`);
    checkout.reset();
    onClose();
  };

  return (
    <>
      <ModalBackdrop
        open={open}
        visible={visible}
        canDismiss={canClose}
        onDismiss={handleClose}
        variant="sheet"
        panelClassName="max-w-md sm:max-w-[480px]"
        labelledBy="pass-purchase-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
          <h3 id="pass-purchase-title" className="text-[17px] font-medium text-text">
            {successDone ? passSuccessHeadline(product.name) : 'Karte kaufen'}
          </h3>
          <button
            type="button"
            disabled={!canClose}
            onClick={handleClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-textMuted disabled:opacity-50"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {successDone ? (
            <div className="space-y-4 py-4 text-center" data-testid="pass-purchase-success">
              <p className="text-[17px] font-medium text-text">
                {passSuccessHeadline(product.name)}
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand"
                onClick={() => {
                  handleClose();
                  navigate('/courses');
                }}
              >
                Jetzt Kurs buchen
              </button>
            </div>
          ) : (
            <>
              <p className="text-[15px] text-text">{summary}</p>
              {showPayForm ? null : (
                <>
                  <p className="text-[22px] font-medium tabular-nums text-text">{priceLine}</p>
                  <p className="text-[13px] text-textMuted">
                    Du hast ein 14-tägiges Widerrufsrecht.{' '}
                    <button
                      type="button"
                      className="font-medium text-brand underline"
                      onClick={() => setBelehrungOpen(true)}
                    >
                      Widerrufsbelehrung ›
                    </button>
                  </p>
                  {consentBlock}
                  {!consent ? (
                    <p className="text-[13px] text-textMuted">
                      Bitte bestätige die Zustimmung, um zahlungspflichtig zu kaufen.
                    </p>
                  ) : null}
                </>
              )}

              {started &&
              !showPayForm &&
              (checkout.phase === 'preparing' || checkout.phase === 'idle') ? (
                <PaymentFormPlaceholder label="Wird vorbereitet …" />
              ) : null}

              {started && checkout.phase === 'processing' ? (
                <div className="flex flex-col items-center gap-3 py-6" role="status">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
                  <p className="text-[15px] text-text">Zahlung wird geprüft …</p>
                </div>
              ) : null}

              {started && checkout.phase === 'error' ? (
                <p role="alert" className="text-sm text-danger">
                  {checkout.message ?? paymentMessageForCode(checkout.code)}
                </p>
              ) : null}

              {showPayForm && checkout.prepare && config.publishableKey ? (
                <StripePaymentForm
                  publishableKey={config.publishableKey}
                  amountCents={checkout.prepare.amountCents}
                  currency={checkout.prepare.currency || 'eur'}
                  accountRef={checkout.prepare.accountRef}
                  submitLabel={
                    checkout.phase === 'error'
                      ? PAYMENT_RETRY_LABEL
                      : BINDING_BUY_PASS_LABEL
                  }
                  disabled={checkout.busy}
                  holdExpired={false}
                  studioName={studioName}
                  bookingSummary={null}
                  aboveSubmit={
                    <>
                      <p className="mb-1 text-[15px] font-medium tabular-nums text-text">
                        {priceLine}
                      </p>
                      <p className="mb-2 text-[13px] text-textMuted">
                        Du hast ein 14-tägiges Widerrufsrecht.{' '}
                        <button
                          type="button"
                          className="font-medium text-brand underline"
                          onClick={() => setBelehrungOpen(true)}
                        >
                          Widerrufsbelehrung ›
                        </button>
                      </p>
                      {consentBlock}
                    </>
                  }
                  onSubmitToken={async (tokenId: string) => {
                    if (!checkout.prepare || !config.publishableKey) return;
                    if (checkout.phase !== 'ready' && checkout.phase !== 'error') return;
                    const attemptId = checkout.prepare.attemptId;
                    storePaymentAttempt(`pass:${product.id}`, attemptId);
                    const result = await checkout.runConfirm(attemptId, tokenId);
                    if (result.kind === 'error') return;
                    if (result.kind === 'requires_action') {
                      const next = await handleStripeNextAction(
                        config.publishableKey,
                        checkout.prepare.accountRef,
                        result.clientSecret,
                      );
                      if (!next.ok) {
                        checkout.markAuthFailed();
                        return;
                      }
                      await checkout.pollUntilDone(attemptId);
                    }
                    clearPaymentAttempt(`pass:${product.id}`);
                  }}
                  onRetry={async () => {
                    clearPaymentAttempt(`pass:${product.id}`);
                    await checkout.runPreparePass(
                      product.id,
                      hashes!.immediate,
                      hashes!.withdrawal,
                      { mode: 'retry' },
                    );
                  }}
                />
              ) : null}
            </>
          )}
        </div>
      </ModalBackdrop>

      {belehrungOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-text/45 p-0 sm:items-center sm:p-4"
          onClick={() => setBelehrungOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-5 sm:rounded-lg"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-labelledby="pass-widerruf-title"
          >
            <h3 id="pass-widerruf-title" className="text-lg font-semibold text-text">
              Widerrufsbelehrung
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-text">
              {PASS_WITHDRAWAL_BELEHRUNG_BODY}
            </p>
            <button
              type="button"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand"
              onClick={() => setBelehrungOpen(false)}
            >
              Verstanden
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default PassPurchaseSheet;
