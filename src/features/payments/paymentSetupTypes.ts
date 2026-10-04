/** Typen für den Online-Zahlungs-Stand (get_payment_setup_status). */

export type PaymentOnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'in_review'
  | 'active'
  | 'action_required'
  | 'disconnected';

/** UI-Zustand: action_required wird wie in_progress behandelt (U3). */
export type PaymentUiStatus = 'not_started' | 'in_progress' | 'in_review' | 'active' | 'disconnected';

export interface PaymentSetupStatus {
  success: boolean;
  error?: string;
  platform_enabled: boolean;
  has_account: boolean;
  onboarding_status: PaymentOnboardingStatus | string;
  charges_enabled: boolean;
  card_active: boolean;
  tax_setting_present: boolean;
  legal_profile_present?: boolean;
  online_payments_enabled: boolean;
  allow_onsite_payment: boolean;
  requirements_pending: boolean;
  requirements_due_at: string | null;
  disconnected: boolean;
}

export function toUiStatus(raw: string | null | undefined): PaymentUiStatus {
  if (raw === 'not_started') return 'not_started';
  if (raw === 'in_review') return 'in_review';
  if (raw === 'active') return 'active';
  if (raw === 'disconnected') return 'disconnected';
  // action_required und alles Unbekannte → in_progress (U3)
  return 'in_progress';
}

export const DEV_MOCK_PARAM = 'paymentSetup';

export const DEV_MOCK_STATUSES: readonly PaymentUiStatus[] = [
  'not_started',
  'in_progress',
  'in_review',
  'active',
  'disconnected',
];

export function readDevMockStatus(): PaymentUiStatus | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(DEV_MOCK_PARAM);
  if (!raw) return null;
  return (DEV_MOCK_STATUSES as readonly string[]).includes(raw) ? (raw as PaymentUiStatus) : null;
}

export function mockStatus(ui: PaymentUiStatus): PaymentSetupStatus {
  const base: PaymentSetupStatus = {
    success: true,
    platform_enabled: true,
    has_account: ui !== 'not_started',
    onboarding_status: ui,
    charges_enabled: ui === 'active',
    card_active: ui === 'active',
    tax_setting_present: true,
    legal_profile_present: true,
    online_payments_enabled: ui === 'active',
    allow_onsite_payment: true,
    requirements_pending: ui === 'active',
    requirements_due_at: ui === 'active' ? '2026-10-12T10:00:00.000Z' : null,
    disconnected: ui === 'disconnected',
  };
  if (ui === 'active') {
    base.requirements_pending = true;
  }
  return base;
}
