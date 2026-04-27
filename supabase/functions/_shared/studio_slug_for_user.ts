import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

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
