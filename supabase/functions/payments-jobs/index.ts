import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getPaymentProvider } from "../_shared/payments/index.ts";
import {
  createDefaultLog,
  handleJobsRequest,
  type JobsDeps,
} from "./handler.ts";
import { createJobsStore } from "./store.ts";

Deno.serve(async (req: Request) => {
  const log = createDefaultLog();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const deps: JobsDeps = {
    env: (key) => Deno.env.get(key) ?? undefined,
    log,
    getProvider: () => getPaymentProvider(Deno.env),
    store: createJobsStore(supabase),
  };

  try {
    return await handleJobsRequest(req, deps);
  } catch (err) {
    log.error("payments-jobs failed", {
      code: err instanceof Error ? err.name : "JOBS_ERROR",
    });
    return new Response(
      JSON.stringify({ error: "Internal error", code: "JOBS_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
