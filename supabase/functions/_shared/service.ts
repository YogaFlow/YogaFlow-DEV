/**
 * Service-Gerüst für Edge Functions mit Nutzer-Session (Geldkette 0.3b).
 *
 * Einstieg: initService(req). Liefert JWT-geprüften User, Tenant-Slug,
 * Supabase-Client (Aufrufer-JWT + x-omlify-tenant), Logger und Fehler-Helfer.
 *
 * Kein SERVICE_ROLE hier. Webhooks/Cron bleiben eigene Pfade (I12).
 */
import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";
import { maskSensitiveText } from "./mask_sensitive.ts";

export { maskSensitiveText } from "./mask_sensitive.ts";

/** Gleicher Regex wie yogaflow_private.request_tenant_slug und studio_slug_for_user. */
export const TENANT_SLUG_RE = /^[a-z0-9]{3,30}$/;

export type ServiceErrorBody = {
  error: string;
  code: string;
};

export type ServiceLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type ServiceContext = {
  user: User;
  accessToken: string;
  tenantSlug: string;
  supabase: SupabaseClient;
  log: ServiceLogger;
  /** Baut eine JSON-Fehlerantwort ohne interne Details. */
  errorResponse: (status: number, code: string, message: string) => Response;
};

export type ServiceInitResult =
  | { ok: true; ctx: ServiceContext }
  | { ok: false; response: Response };

type CorsHeaders = Record<string, string>;

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Jede Ausgabe geht durch den Maskierer. */
export function createServiceLogger(): ServiceLogger {
  const write = (level: "info" | "warn" | "error", args: unknown[]) => {
    const masked = args.map((a) => maskSensitiveText(stringifyForLog(a)));
    if (level === "info") console.log(...masked);
    else if (level === "warn") console.warn(...masked);
    else console.error(...masked);
  };
  return {
    info: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
  };
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  corsHeaders: CorsHeaders = {},
): Response {
  const body: ServiceErrorBody = { error: message, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Liest Bearer-Token, prüft JWT, liest und validiert x-omlify-tenant,
 * baut Client mit Aufrufer-JWT (RLS greift).
 *
 * env: SUPABASE_URL, SUPABASE_ANON_KEY (nie Service-Role).
 */
export async function initService(
  req: Request,
  corsHeaders: CorsHeaders = {},
): Promise<ServiceInitResult> {
  const log = createServiceLogger();

  const errorResponse = (status: number, code: string, message: string) =>
    jsonError(status, code, message, corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    log.error("initService: SUPABASE_URL oder SUPABASE_ANON_KEY fehlt");
    return {
      ok: false,
      response: errorResponse(500, "server_misconfigured", "Dienst nicht konfiguriert"),
    };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: errorResponse(401, "missing_authorization", "Anmeldung fehlt"),
    };
  }
  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    return {
      ok: false,
      response: errorResponse(401, "missing_authorization", "Anmeldung fehlt"),
    };
  }

  const rawSlug = req.headers.get("x-omlify-tenant");
  if (rawSlug === null || rawSlug.trim() === "") {
    return {
      ok: false,
      response: errorResponse(400, "missing_tenant", "Studio-Angabe fehlt"),
    };
  }
  const tenantSlug = rawSlug.trim().toLowerCase();
  if (!TENANT_SLUG_RE.test(tenantSlug)) {
    return {
      ok: false,
      response: errorResponse(400, "invalid_tenant", "Studio-Angabe ungültig"),
    };
  }

  // global.headers gelten für alle Requests dieses Clients — PostgREST .from()
  // und .rpc() nutzen denselben fetch-Pfad (supabase-js: RestClient → fetch mit
  // merged globalHeaders). Authorization + x-omlify-tenant kommen damit auch bei RPC an.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-omlify-tenant": tenantSlug,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData.user) {
    log.error("initService: JWT ungültig", authError);
    return {
      ok: false,
      response: errorResponse(401, "invalid_token", "Anmeldung ungültig"),
    };
  }

  const ctx: ServiceContext = {
    user: userData.user,
    accessToken,
    tenantSlug,
    supabase,
    log,
    errorResponse,
  };

  return { ok: true, ctx };
}

/**
 * Loggt die volle Ursache (maskiert) und liefert eine sichere Außenantwort.
 * Für unerwartete catch-Blöcke in Functions, die initService nutzen.
 */
export function unexpectedErrorResponse(
  log: ServiceLogger,
  cause: unknown,
  corsHeaders: CorsHeaders = {},
  publicMessage = "Ein Fehler ist aufgetreten",
): Response {
  log.error("unexpected", cause);
  return jsonError(500, "internal_error", publicMessage, corsHeaders);
}
