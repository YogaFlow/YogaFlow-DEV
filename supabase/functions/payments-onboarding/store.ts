/**
 * Service- und Nutzer-RPCs für payments-onboarding (1.3a).
 * Service-Client nur für get_owner_payment_context und upsert_provider_account.
 * get_payment_setup_status läuft mit dem Nutzer-JWT (RLS/Rolle).
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ProviderAccountState, ProviderId } from "../_shared/payments/port.ts";
import type {
  OnboardingStore,
  OwnerPaymentContext,
  PaymentSetupStatus,
  UpsertResult,
} from "./handler.ts";

class StoreError extends Error {
  constructor(operation: string) {
    super(`DB_ERROR ${operation}`);
    this.name = "StoreError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createOnboardingStore(
  serviceClient: SupabaseClient,
  userClient: SupabaseClient,
): OnboardingStore {
  return {
    async getOwnerContext(tenantId: string, memberId: string): Promise<OwnerPaymentContext> {
      const { data, error } = await serviceClient.rpc("get_owner_payment_context", {
        p_tenant: tenantId,
        p_member: memberId,
      });
      if (error || !isObject(data) || data.success !== true) {
        throw new StoreError("get_owner_payment_context");
      }
      return {
        isOwner: data.is_owner === true,
        platformEnabled: data.platform_enabled === true,
        accountRef: typeof data.account_ref === "string" ? data.account_ref : null,
        onboardingStatus: typeof data.onboarding_status === "string" ? data.onboarding_status : "not_started",
      };
    },

    async upsertAccount(
      tenantId: string,
      provider: ProviderId,
      state: ProviderAccountState,
    ): Promise<UpsertResult> {
      const { data, error } = await serviceClient.rpc("upsert_provider_account", {
        p_tenant: tenantId,
        p_provider: provider,
        p_ref: state.ref,
        p_status: state.status,
        p_charges: state.chargesEnabled,
        p_payouts: state.payoutsEnabled,
        p_details: state.detailsSubmitted,
        p_livemode: state.livemode,
        p_capabilities: { card: state.capabilities.card },
        p_requirements_pending: state.requirementsPending,
        p_requirements_due_at: state.requirementsDueAt,
      });
      if (error || !isObject(data)) throw new StoreError("upsert_provider_account");
      if (data.success === true) return { ok: true };
      return { ok: false, code: typeof data.error === "string" ? data.error : "UNKNOWN" };
    },

    async getSetupStatus(): Promise<PaymentSetupStatus> {
      const { data, error } = await userClient.rpc("get_payment_setup_status");
      if (error || !isObject(data)) throw new StoreError("get_payment_setup_status");
      return data;
    },
  };
}
