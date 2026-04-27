/**
 * Base URL for links in auth e-mails (verify / password reset).
 *
 * Prefer the browser `Origin` when the SPA calls the Edge Function (e.g. https://studio1.omlify.de),
 * so the link opens the same host the user registered on.
 *
 * Falls back to `APP_URL` when there is no Origin (server-side / tooling). Do not set `APP_URL`
 * to a preview workers.dev host in production — it breaks logins on real domains.
 */
export function emailLinkBaseUrl(req: Request): string {
  const stripTrailingSlashes = (s: string) => s.replace(/\/+$/, "");
  const origin = stripTrailingSlashes(req.headers.get("origin")?.trim() ?? "");
  if (origin.length > 0) return origin;
  const appUrl = stripTrailingSlashes(Deno.env.get("APP_URL")?.trim() ?? "");
  if (appUrl.length > 0) return appUrl;
  return "http://localhost:5173";
}

const SLUG_RE = /^[a-z0-9]{3,30}$/;

/**
 * Apex-Host aus dem Browser-Origin, z. B. `https://omlify.de` → `omlify.de`.
 * Bei `https://studio1.omlify.de` → `null` (bereits Studio-Subdomain, Link-Basis bleibt Origin).
 */
export function apexHostFromRequestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return null;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    const parts = hostname.split(".");
    if (parts.length === 2) return hostname;
    if (parts.length === 3 && parts[0] === "www") return `${parts[1]}.${parts[2]}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Studio-Link `https://{slug}.{domain}` wenn Slug bekannt ist und
 * - `APP_BASE_DOMAIN` gesetzt ist, oder
 * - Origin eine Apex-URL ist (z. B. `omlify.de` / `www.omlify.de`) — dann ohne extra Secret.
 */
export function resolveEmailLinkBaseUrl(req: Request, studioSlug: string | null): string {
  const slug = (studioSlug ?? "").trim().toLowerCase();
  const rawDomain = Deno.env.get("APP_BASE_DOMAIN")?.trim().toLowerCase() ?? "";
  const domainFromEnv = rawDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (slug.length > 0 && SLUG_RE.test(slug)) {
    if (domainFromEnv.length > 0) {
      return `https://${slug}.${domainFromEnv}`;
    }
    const inferredApex = apexHostFromRequestOrigin(req);
    if (inferredApex) {
      return `https://${slug}.${inferredApex}`;
    }
  }
  return emailLinkBaseUrl(req);
}
