import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { OpsFinding, OpsStore } from "./handler.ts";

function asFindings(raw: unknown): OpsFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key : "";
      const slug = typeof o.slug === "string" ? o.slug : "";
      const kind = typeof o.kind === "string" ? o.kind : "";
      const count = Number(o.count ?? 0);
      if (!key || !kind || !(count > 0)) return null;
      return {
        key,
        slug,
        kind,
        count,
        event: typeof o.event === "string" ? o.event : undefined,
      } satisfies OpsFinding;
    })
    .filter((x): x is OpsFinding => x != null);
}

export function createOpsStore(supabase: SupabaseClient): OpsStore {
  return {
    async retryMissingReceipts() {
      await supabase.rpc("retry_missing_receipts", { p_tenant_id: null });
    },
    async collect() {
      const { data, error } = await supabase.rpc("ops_monitor_collect");
      if (error) throw new Error(error.message);
      return asFindings(data);
    },
    async apply(findings) {
      const { data, error } = await supabase.rpc("ops_monitor_apply", {
        p_findings: findings,
      });
      if (error) throw new Error(error.message);
      const notify = asFindings((data as { notify?: unknown })?.notify);
      const resolvedRaw = (data as { resolved?: unknown })?.resolved;
      const resolved = Array.isArray(resolvedRaw)
        ? resolvedRaw
          .map((r) => {
            if (!r || typeof r !== "object") return null;
            const key = (r as { key?: string }).key;
            return typeof key === "string" ? { key } : null;
          })
          .filter((x): x is { key: string } => x != null)
        : [];
      return { notify, resolved };
    },
  };
}
