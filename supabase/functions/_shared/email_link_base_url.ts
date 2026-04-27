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
 * Wenn der Nutzer zu einem Studio gehört und `APP_BASE_DOMAIN` gesetzt ist (z. B. `omlify.de`),
 * immer `https://{slug}.{APP_BASE_DOMAIN}` — damit Bestätigung auch von der Apex-Domain (`omlify.de/auth`)
 * per „Erneut senden“ auf die Studio-Subdomain zeigt.
 */
export function resolveEmailLinkBaseUrl(req: Request, studioSlug: string | null): string {
  const slug = (studioSlug ?? "").trim().toLowerCase();
  const rawDomain = Deno.env.get("APP_BASE_DOMAIN")?.trim().toLowerCase() ?? "";
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (slug.length > 0 && SLUG_RE.test(slug) && domain.length > 0) {
    return `https://${slug}.${domain}`;
  }
  return emailLinkBaseUrl(req);
}
