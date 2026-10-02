/**
 * Stripe Appearance aus Design-Tokens (2.2b-2).
 * theme flat: ruhige Flächen wie surface/border; accordion: auf 360 px weniger Tabs.
 * Kein @stripe/*-Import (Z9) — StripePaymentForm castet/übergibt als Appearance.
 */
import { tokens } from '../../design/tokens';

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Schlichtes Appearance-Objekt ohne Stripe-Typen (Z9). */
export type PaymentAppearanceConfig = {
  theme: 'flat';
  variables: {
    colorPrimary: string;
    colorBackground: string;
    colorText: string;
    colorDanger: string;
    colorTextSecondary: string;
    borderRadius: string;
    fontFamily: string;
  };
  rules: {
    '.Input': { border: string; boxShadow: string };
    '.Input:focus': { border: string; boxShadow: string };
  };
};

export function stripePaymentAppearance(): PaymentAppearanceConfig {
  return {
    theme: 'flat',
    variables: {
      colorPrimary: cssVar('--color-brand', tokens.colors.brand),
      colorBackground: cssVar('--color-surface', tokens.colors.surface),
      colorText: cssVar('--color-text', tokens.colors.text),
      colorDanger: cssVar('--color-danger', tokens.colors.danger),
      colorTextSecondary: cssVar('--color-text-muted', tokens.colors.textMuted),
      borderRadius: tokens.radii.sm,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
    rules: {
      '.Input': {
        border: `1px solid ${cssVar('--color-border-strong', tokens.colors.borderStrong)}`,
        boxShadow: 'none',
      },
      '.Input:focus': {
        border: `1px solid ${cssVar('--color-brand', tokens.colors.brand)}`,
        boxShadow: 'none',
      },
    },
  };
}

/** Payment Element Layout — accordion wirkt auf schmalen Displays ruhiger als Tabs. */
export const STRIPE_PAYMENT_ELEMENT_LAYOUT = 'accordion' as const;
