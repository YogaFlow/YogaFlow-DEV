import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

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
  if (uErr || !u?.tenant_id) return null;
  const { data: t, error: tErr } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", u.tenant_id)
    .maybeSingle();
  if (tErr || !t?.slug) return null;
  return typeof t.slug === "string" ? t.slug : null;
}
