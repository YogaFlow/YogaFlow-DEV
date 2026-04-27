import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const TENANT_SLUG_RE = /^[a-z0-9]{3,30}$/;

const UUID_RE = /^[0-9a-f-]{36}$/i;

function tenantIdFromMetadata(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const raw = meta["tenant_id"];
  if (typeof raw === "string" && UUID_RE.test(raw)) return raw;
  return null;
}

/** Lädt den Tenant-Slug für Verifizierungs-/Reset-Links (Service-Role, RLS egal). */
export async function fetchStudioSlugForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: u, error: uErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (uErr) console.error("fetchStudioSlugForUser users:", uErr.message);

  let tenantId: string | null = typeof u?.tenant_id === "string" ? u.tenant_id : null;

  if (!tenantId) {
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
    if (authErr) console.error("fetchStudioSlugForUser auth:", authErr.message);
    tenantId = tenantIdFromMetadata(authData?.user?.user_metadata as Record<string, unknown> | undefined);
  }

  if (!tenantId) return null;

  const { data: t, error: tErr } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr) console.error("fetchStudioSlugForUser tenants:", tErr.message);
  if (!t?.slug || typeof t.slug !== "string") return null;
  return t.slug;
}

/**
 * Optionaler Slug aus dem Client (z. B. sessionStorage nach Onboarding): nur gültig,
 * wenn derselbe Slug in der DB dem Tenant des Nutzers entspricht.
 */
export async function verifyClientStudioSlugHint(
  supabase: SupabaseClient,
  userId: string,
  hint: string | undefined | null,
): Promise<string | null> {
  const h = (hint ?? "").trim().toLowerCase();
  if (!h || !TENANT_SLUG_RE.test(h)) return null;

  const { data: tenantRow, error: tErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", h)
    .maybeSingle();
  if (tErr || !tenantRow?.id) return null;

  const { data: u } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  let userTenantId: string | null = typeof u?.tenant_id === "string" ? u.tenant_id : null;
  if (!userTenantId) {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    userTenantId = tenantIdFromMetadata(authData?.user?.user_metadata as Record<string, unknown> | undefined);
  }
  if (!userTenantId || tenantRow.id !== userTenantId) return null;
  return h;
}
