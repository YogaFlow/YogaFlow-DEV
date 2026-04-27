/**
 * Base URL for links in auth e-mails (verify / password reset).
 *
 * Prefer the browser `Origin` when the SPA calls the Edge Function (e.g. https://studio1.omlify.de),
 * so the link opens the same host the user registered on.
 *
 * Falls back to `APP_URL` when there is no Origin (server-side / tooling). Do not set `APP_URL`
 * to a preview workers.dev host in production — it overrides Origin today and breaks logins on real domains.
 */
export function emailLinkBaseUrl(req: Request): string {
  const stripTrailingSlashes = (s: string) => s.replace(/\/+$/, "");
  const origin = stripTrailingSlashes(req.headers.get("origin")?.trim() ?? "");
  if (origin.length > 0) return origin;
  const appUrl = stripTrailingSlashes(Deno.env.get("APP_URL")?.trim() ?? "");
  if (appUrl.length > 0) return appUrl;
  return "http://localhost:5173";
}
