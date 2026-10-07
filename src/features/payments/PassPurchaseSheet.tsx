/**
 * UX-9 — Online-Mehrfachkartenkauf: Produktname, Payment Element, Consent, sticky Fuß.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import StudioPublicLegalSheet, {
  type StudioLegalSheetKind,
} from '../../components/legal/StudioPublicLegalSheet';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import { paymentMessageForCode, PAYMENT_RETRY_LABEL } from '../../lib/paymentTexts';
import {
  checkoutTaxLineAlone,
  formatLegalCents,
  type TaxRegime,
} from '../../lib/legalCheckoutTexts';
import {
  BINDING_BUY_PASS_LABEL,
  PASS_CONSENT_REQUIRED_HINT,
  PASS_IMMEDIATE_USE_TEXT,
  PASS_WITHDRAWAL_INFO_TEXT,
  passCheckoutSummary,
  passSuccessHeadline,
  passWithdrawalExampleBody,
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
  const consentRef = useRef<HTMLLabelElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [mehrOpen, setMehrOpen] = useState(false);
  const [legalKind, setLegalKind] = useState<StudioLegalSheetKind | null>(null);
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('small_business');
  const [vatBp, setVatBp] = useState(0);
  const [hashes, setHashes] = useState<{ immediate: string; withdrawal: string } | null>(
    null,
  );

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
    setConsentError(false);
    setMehrOpen(false);
    setLegalKind(null);
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
    const prep = await checkout.runPreparePass(
      product.id,
      hashes.immediate,
      hashes.withdrawal,
    );
    if (prep) storePaymentAttempt(`pass:${product.id}`, prep.attemptId);
  }, [checkout, config, hashes, product]);

  useEffect(() => {
    if (!open || !product || !hashes) return;
    if (checkout.phase !== 'idle') return;
    void startPrepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, hashes]);

  if (!mounted || !open || !product) return null;

  const summary = passCheckoutSummary({
    units: product.units,
    validityRule: product.validity_rule,
    validityValue: product.validity_value,
    priceCents: product.price_cents,
  });
  const amount = checkout.prepare?.amountCents ?? product.price_cents;
  const taxLine = checkoutTaxLineAlone(taxRegime, vatBp);
  const mehrBody = passWithdrawalExampleBody({
    priceCents: product.price_cents,
    units: product.units,
    usedExample: 1,
  });
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

  const ensureConsent = (): boolean => {
    if (consent) {
      setConsentError(false);
      return true;
    }
    setConsentError(true);
    consentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    consentRef.current?.querySelector('input')?.focus();
    return false;
  };

  const handleClose = () => {
    if (!canClose) return;
    if (successDone) onFinished();
    clearPaymentAttempt(`pass:${product.id}`);
    checkout.reset();
    onClose();
  };

  const consentBlock = (
    <div className="mb-3">
      {consentError ? (
        <p
          role="alert"
          className="mb-2 text-[13px] leading-snug text-danger"
          data-testid="pass-consent-error"
        >
          {PASS_CONSENT_REQUIRED_HINT}
        </p>
      ) : null}
      <label
        ref={consentRef}
        className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-1 ${
          consentError ? 'ring-2 ring-danger' : ''
        }`}
        data-testid="pass-consent-row"
      >
        <input
          type="checkbox"
          className="mt-0.5 h-[15px] w-[15px] shrink-0 rounded border-border text-brand focus:ring-brand"
          checked={consent}
          onChange={(ev) => {
            setConsent(ev.target.checked);
            if (ev.target.checked) setConsentError(false);
          }}
          data-testid="pass-immediate-consent"
        />
        <span className="text-[14px] leading-snug text-text">
          {PASS_IMMEDIATE_USE_TEXT}{' '}
          <button
            type="button"
            className="font-medium text-brand underline underline-offset-2"
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setMehrOpen(true);
            }}
            data-testid="pass-consent-mehr"
          >
            Mehr ›
          </button>
        </span>
      </label>
    </div>
  );

  const priceRow = (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className="text-[22px] font-medium tabular-nums text-text"
        data-testid="pass-checkout-price"
      >
        {formatLegalCents(amount)}
      </span>
      <span className="text-[12px] leading-snug text-textMuted" data-testid="pass-checkout-tax">
        {taxLine}
      </span>
    </div>
  );

  const legalRow = (
    <p className="mt-2 text-center text-[12px] leading-snug text-textMuted">
      <button
        type="button"
        className="text-brand underline underline-offset-2"
        onClick={() => setLegalKind('terms')}
      >
        AGB
      </button>
      {' · '}
      <button
        type="button"
        className="text-brand underline underline-offset-2"
        onClick={() => setLegalKind('privacy')}
      >
        Datenschutz
      </button>
      {' · '}
      <button
        type="button"
        className="text-brand underline underline-offset-2"
        onClick={() => setLegalKind('widerruf')}
        data-testid="pass-legal-widerruf"
      >
        Widerrufsbelehrung
      </button>
    </p>
  );

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
            {successDone ? passSuccessHeadline(product.name) : product.name}
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
              <p className="text-[14px] leading-snug text-textMuted">{summary}</p>

              {(checkout.phase === 'preparing' || (checkout.phase === 'idle' && hashes)) &&
              !showPayForm ? (
                <PaymentFormPlaceholder label="Wird vorbereitet …" />
              ) : null}

              {checkout.phase === 'processing' ? (
                <div className="flex flex-col items-center gap-3 py-6" role="status">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
                  <p className="text-[15px] text-text">Zahlung wird geprüft …</p>
                </div>
              ) : null}

              {checkout.phase === 'error' && !showPayForm ? (
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
                  hideSecureHint
                  midSlot={consentBlock}
                  aboveSubmit={priceRow}
                  afterSubmit={legalRow}
                  beforeSubmit={ensureConsent}
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
              ) : (
                <>
                  {consentBlock}
                  <div
                    className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-t-0 sm:px-0 sm:pb-0"
                    data-testid="pass-sticky-footer"
                  >
                    {priceRow}
                    <button
                      type="button"
                      onClick={() => {
                        ensureConsent();
                      }}
                      className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed"
                      data-testid="checkout-pay"
                    >
                      {BINDING_BUY_PASS_LABEL}
                    </button>
                    {legalRow}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ModalBackdrop>

      {mehrOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-text/45 p-0 sm:items-center sm:p-4"
          onClick={() => setMehrOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-5 sm:rounded-lg"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-labelledby="pass-mehr-title"
            data-testid="pass-mehr-dialog"
          >
            <h3 id="pass-mehr-title" className="text-lg font-semibold text-text">
              Widerruf
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-text">{mehrBody}</p>
            <button
              type="button"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand"
              onClick={() => setMehrOpen(false)}
            >
              Verstanden
            </button>
          </div>
        </div>
      ) : null}

      <StudioPublicLegalSheet kind={legalKind} onClose={() => setLegalKind(null)} />
    </>
  );
};

export default PassPurchaseSheet;
