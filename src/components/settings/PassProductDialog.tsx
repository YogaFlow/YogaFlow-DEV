import React, { useEffect, useState } from 'react';
import type { PassProduct, PassValidityRule } from '../../types';
import {
  PASS_DESCRIPTION_MAX,
  PASS_MONTHS_MAX,
  PASS_MONTHS_MIN,
  PASS_NAME_MAX,
  PASS_UNITS_MAX,
  PASS_UNITS_MIN,
  PASS_YEARS_MAX,
  PASS_YEARS_MIN,
  createPassProduct,
  formatPassValidity,
  formatPerUnitLabel,
  parseEuroToCents,
  updatePassProduct,
} from '../../lib/passProducts';
import {
  ONLINE_AMOUNT_LIMIT_CENTS,
  PRICE_ABOVE_LIMIT_HINT,
} from '../../lib/legalCheckoutTexts';
import {
  onlinePassSwitchBlockReason,
  passProductPreviewLine,
} from '../../lib/passOnlineTexts';
import { resyncStudioLegalDocuments } from '../../lib/studioLegal';
import { supabase } from '../../lib/supabase';
import { toUiStatus } from '../../features/payments/paymentSetupTypes';

type Props = {
  open: boolean;
  product: PassProduct | null;
  onClose: () => void;
  onSaved: () => void;
};

type ValidityMode = PassValidityRule;

function centsToEuroInput(cents: number): string {
  const euros = cents / 100;
  if (Number.isInteger(euros)) return String(euros);
  return euros.toFixed(2).replace('.', ',');
}

const PassProductDialog: React.FC<Props> = ({ open, product, onClose, onSaved }) => {
  const editing = product != null;
  const [name, setName] = useState('');
  const [units, setUnits] = useState(10);
  const [priceText, setPriceText] = useState('');
  const [description, setDescription] = useState('');
  const [onlinePurchasable, setOnlinePurchasable] = useState(false);
  const [validityMode, setValidityMode] = useState<ValidityMode>('months');
  const [years, setYears] = useState(3);
  const [months, setMonths] = useState(12);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [onlineReady, setOnlineReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase.rpc('get_payment_setup_status').then(({ data }) => {
      const ui = toUiStatus(data?.onboarding_status);
      const ready =
        data?.online_payments_enabled === true &&
        ui === 'active' &&
        data?.card_active === true &&
        data?.tax_setting_present === true &&
        data?.legal_profile_present !== false &&
        data?.avv_accepted !== false &&
        data?.platform_enabled !== false;
      setOnlineReady(ready);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setUnits(product.units);
      setPriceText(centsToEuroInput(product.price_cents));
      setDescription(product.description ?? '');
      setOnlinePurchasable(product.online_purchasable === true);
      setValidityMode(product.validity_rule);
      if (product.validity_rule === 'years_to_year_end') {
        setYears(product.validity_value);
        setMonths(12);
      } else {
        setMonths(product.validity_value);
        setYears(3);
      }
    } else {
      setName('');
      setUnits(10);
      setPriceText('');
      setDescription('');
      setOnlinePurchasable(false);
      setValidityMode('months');
      setYears(3);
      setMonths(12);
    }
    setError('');
    setSaving(false);
  }, [open, product]);

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

  if (!isMounted || !open) return null;

  const priceCents = parseEuroToCents(priceText);
  const perUnitLabel =
    priceCents != null && priceCents > 0 && units >= PASS_UNITS_MIN
      ? formatPerUnitLabel(priceCents, units)
      : '';

  const validityValue = validityMode === 'years_to_year_end' ? years : months;
  const exampleValidity = formatPassValidity(validityMode, validityValue);
  const showShortValidityHint = validityMode === 'months' && months < 12;
  const yearsLabel =
    years === 1
      ? 'Bis Jahresende, 1 Jahr (empfohlen)'
      : `Bis Jahresende, ${years} Jahre (empfohlen)`;

  const switchBlock = onlinePassSwitchBlockReason({
    onlineReady,
    priceCents,
    limitCents: ONLINE_AMOUNT_LIMIT_CENTS,
  });
  const switchDisabled = switchBlock != null;

  const preview =
    priceCents != null && priceCents > 0 && units >= PASS_UNITS_MIN
      ? passProductPreviewLine({
          units,
          priceCents,
          validityRule: validityMode,
          validityValue,
        })
      : '';

  const clampUnits = (raw: number) => {
    if (!Number.isFinite(raw)) return PASS_UNITS_MIN;
    return Math.min(PASS_UNITS_MAX, Math.max(PASS_UNITS_MIN, Math.round(raw)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const cents = parseEuroToCents(priceText);
    if (cents == null || cents <= 0) {
      setError('Gib einen Preis über 0 € ein.');
      return;
    }
    if (description.trim().length > PASS_DESCRIPTION_MAX) {
      setError('Die Beschreibung darf höchstens 140 Zeichen haben.');
      return;
    }
    const wantOnline = onlinePurchasable && !switchDisabled;
    if (onlinePurchasable && switchDisabled) {
      setError(switchBlock ?? 'Online kaufbar ist nicht möglich.');
      return;
    }

    const fields = {
      name: name.trim(),
      units: clampUnits(units),
      price_cents: cents,
      validity_rule: validityMode,
      validity_value: validityMode === 'years_to_year_end' ? years : months,
      description: description.trim() || null,
      online_purchasable: wantOnline,
    };

    setSaving(true);
    setError('');
    try {
      const result = editing && product
        ? await updatePassProduct(product.id, fields)
        : await createPassProduct(fields);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      void resyncStudioLegalDocuments({});
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 transition-opacity duration-200 ${
        isVisible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={saving ? undefined : onClose}
    >
      <div
        className={`flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg transition-all duration-200 sm:rounded-lg ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-product-dialog-title"
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 id="pass-product-dialog-title" className="text-lg font-semibold text-text">
            {editing ? 'Karte bearbeiten' : 'Karte anlegen'}
          </h3>
          {editing ? (
            <p className="mt-1 text-sm text-textMuted">
              Änderungen gelten nur für Karten, die du ab jetzt verkaufst.
            </p>
          ) : null}
        </div>

        <form onSubmit={(ev) => void handleSubmit(ev)} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-5 overflow-y-auto px-5 py-4">
            <div>
              <label htmlFor="pass-name" className="mb-2 block text-sm font-medium text-textMuted">
                Name
              </label>
              <input
                id="pass-name"
                type="text"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                maxLength={PASS_NAME_MAX}
                className="w-full rounded-sm border border-borderStrong px-4 py-3 text-text focus:border-transparent focus:ring-2 focus:ring-brand"
                placeholder="z. B. 10er-Karte"
                autoComplete="off"
                required
              />
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-textMuted">Anzahl Termine</span>
              <div className="flex flex-wrap items-center gap-2">
                {[5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setUnits(n)}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 text-[15px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                      units === n
                        ? 'bg-brand text-onBrand'
                        : 'bg-surfaceSunken text-text active:bg-borderStrong'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  id="pass-units"
                  type="number"
                  min={PASS_UNITS_MIN}
                  max={PASS_UNITS_MAX}
                  value={units}
                  onChange={(ev) => setUnits(clampUnits(Number(ev.target.value)))}
                  className="w-24 rounded-sm border border-borderStrong px-3 py-2.5 text-text tabular-nums focus:border-transparent focus:ring-2 focus:ring-brand"
                  aria-label="Termine frei wählen"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pass-price" className="mb-2 block text-sm font-medium text-textMuted">
                Preis in €
              </label>
              <input
                id="pass-price"
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(ev) => setPriceText(ev.target.value)}
                className="w-full rounded-sm border border-borderStrong px-4 py-3 text-text tabular-nums focus:border-transparent focus:ring-2 focus:ring-brand"
                placeholder="z. B. 120"
                required
              />
              {perUnitLabel ? (
                <p className="mt-1 text-sm tabular-nums text-textMuted">{perUnitLabel}</p>
              ) : null}
              {priceCents != null && priceCents > ONLINE_AMOUNT_LIMIT_CENTS ? (
                <p className="mt-1 text-sm text-textMuted">{PRICE_ABOVE_LIMIT_HINT}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="pass-description"
                className="mb-2 block text-sm font-medium text-textMuted"
              >
                Beschreibung (optional)
              </label>
              <textarea
                id="pass-description"
                value={description}
                onChange={(ev) => setDescription(ev.target.value.slice(0, PASS_DESCRIPTION_MAX))}
                maxLength={PASS_DESCRIPTION_MAX}
                rows={2}
                className="w-full rounded-sm border border-borderStrong px-4 py-3 text-text focus:border-transparent focus:ring-2 focus:ring-brand"
                placeholder="Kurz, max. 140 Zeichen"
              />
              <p className="mt-1 text-xs tabular-nums text-textSubtle">
                {description.length}/{PASS_DESCRIPTION_MAX}
              </p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-textMuted">Gültigkeit</legend>
              <div className="space-y-3">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3.5 ${
                    validityMode === 'months'
                      ? 'border-brand bg-sage-50'
                      : 'border-border bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="pass-validity"
                    className="mt-1 h-4 w-4 border-border text-brand focus:ring-brand"
                    checked={validityMode === 'months'}
                    onChange={() => setValidityMode('months')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-text">
                      Monate ab Kauf (empfohlen)
                    </span>
                    {validityMode === 'months' ? (
                      <span className="mt-2 flex items-center gap-2">
                        <label htmlFor="pass-months" className="text-sm text-textMuted">
                          Monate
                        </label>
                        <input
                          id="pass-months"
                          type="number"
                          min={PASS_MONTHS_MIN}
                          max={PASS_MONTHS_MAX}
                          value={months}
                          onChange={(ev) => {
                            const n = Number(ev.target.value);
                            if (!Number.isFinite(n)) return;
                            setMonths(
                              Math.min(PASS_MONTHS_MAX, Math.max(PASS_MONTHS_MIN, Math.round(n))),
                            );
                          }}
                          className="w-16 rounded-sm border border-borderStrong px-2 py-1.5 text-text tabular-nums focus:border-transparent focus:ring-2 focus:ring-brand"
                        />
                      </span>
                    ) : null}
                    {validityMode === 'months' ? (
                      <span className="mt-1 block text-sm text-textMuted">{exampleValidity}</span>
                    ) : null}
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3.5 ${
                    validityMode === 'years_to_year_end'
                      ? 'border-brand bg-sage-50'
                      : 'border-border bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="pass-validity"
                    className="mt-1 h-4 w-4 border-border text-brand focus:ring-brand"
                    checked={validityMode === 'years_to_year_end'}
                    onChange={() => setValidityMode('years_to_year_end')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-text">{yearsLabel}</span>
                    {validityMode === 'years_to_year_end' ? (
                      <span className="mt-2 flex items-center gap-2">
                        <label htmlFor="pass-years" className="text-sm text-textMuted">
                          Jahre
                        </label>
                        <input
                          id="pass-years"
                          type="number"
                          min={PASS_YEARS_MIN}
                          max={PASS_YEARS_MAX}
                          value={years}
                          onChange={(ev) => {
                            const n = Number(ev.target.value);
                            if (!Number.isFinite(n)) return;
                            setYears(Math.min(PASS_YEARS_MAX, Math.max(PASS_YEARS_MIN, Math.round(n))));
                          }}
                          className="w-16 rounded-sm border border-borderStrong px-2 py-1.5 text-text tabular-nums focus:border-transparent focus:ring-2 focus:ring-brand"
                        />
                      </span>
                    ) : null}
                    {validityMode === 'years_to_year_end' ? (
                      <span className="mt-1 block text-sm text-textMuted">{exampleValidity}</span>
                    ) : null}
                  </span>
                </label>
              </div>

              {showShortValidityHint ? (
                <p className="mt-3 rounded-md border border-accent bg-accentSoft px-3.5 py-3 text-sm text-text">
                  Kurze Gültigkeiten können gegenüber Privatkundinnen unwirksam sein. Empfohlen sind
                  12 Monate ab Kauf.
                </p>
              ) : null}
            </fieldset>

            <div className="rounded-md border border-border px-3.5 py-3">
              <label className={`flex min-h-11 items-start gap-3 ${switchDisabled ? 'opacity-70' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand disabled:opacity-50"
                  checked={onlinePurchasable && !switchDisabled}
                  disabled={switchDisabled}
                  onChange={(ev) => setOnlinePurchasable(ev.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-text">Online kaufbar</span>
                  {switchBlock ? (
                    <span className="mt-1 block text-sm text-textMuted">{switchBlock}</span>
                  ) : (
                    <span className="mt-1 block text-sm text-textMuted">
                      Teilnehmende kaufen und bezahlen selbst online (bis 250 €).
                    </span>
                  )}
                </span>
              </label>
            </div>

            {preview ? (
              <p className="text-sm tabular-nums text-textMuted" data-testid="pass-product-preview">
                {preview}
              </p>
            ) : null}

            {error ? (
              <div className="rounded-sm border border-danger bg-dangerSoft p-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium text-textMuted transition-colors active:bg-surfaceSunken disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand transition-colors active:bg-brandPressed disabled:opacity-50"
            >
              {saving ? 'Wird gespeichert…' : editing ? 'Speichern' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PassProductDialog;
