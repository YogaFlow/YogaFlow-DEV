// Apex wird an der Label-Anzahl erkannt (zwei Labels, optional mit www.), nicht an
// einer festen Domain: dieselbe Regel gilt auf DEV und PROD, und VITE_*-Variablen
// gibt es zur Laufzeit im Worker nicht. run_worker_first ist nötig, weil
// Navigationsrequests sonst vom Asset-Worker mit index.html beantwortet werden und
// diesen Worker nie erreichen. robots.txt gilt für jeden Host und wird vor der
// Apex-Prüfung beantwortet. Alle anderen Requests auf Nicht-Apex (Studio-Subdomains)
// gehen an ASSETS.

type AssetsBinding = {
  fetch: (input: Request | URL) => Promise<Response>;
};

type WorkerEnv = {
  ASSETS: AssetsBinding;
};

const PRODUCTION_HOSTS = new Set(['omlify.de', 'www.omlify.de']);

const ROBOTS_ALLOW = [
  'User-agent: *',
  'Allow: /',
  'Sitemap: https://omlify.de/sitemap.xml',
  '',
].join('\n');

const ROBOTS_DISALLOW = ['User-agent: *', 'Disallow: /', ''].join('\n');

const SITEMAP_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url>',
  '    <loc>https://omlify.de/</loc>',
  '  </url>',
  '</urlset>',
  '',
].join('\n');

function hostnameOf(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function isApexHost(hostname: string): boolean {
  const labels = hostname.split('.').filter((label) => label.length > 0);
  if (labels.length === 2) return true;
  if (labels.length === 3 && labels[0] === 'www') return true;
  return false;
}

function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTS.has(hostname);
}

function robotsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Query-Keys, mit denen `/` die SPA laden muss statt marketing.html.
 *
 * `token`: Mail-Clients oeffnen manchmal nur die Root-URL; EmailTokenFromRootRedirect
 * in der SPA schickt `/?token=` nach /verify-email (und nimmt `tenant` mit).
 * `tenant`: DEV-Einstieg `/?tenant={slug}` — OnboardingWizard emailRedirectTo und
 * buildStudioEntryHref. Confirm-email ist derzeit aus, der Parameter liegt aber
 * noch im Code und muss die SPA erreichen.
 *
 * Nur diese beiden. utm_source, utm_medium, gclid, fbclid und jeder unbekannte
 * Parameter bleiben Marketing — sonst wuerde jeder Kampagnenlink die App sehen.
 * Diese Ausnahme nicht entfernen, nur weil `/` "immer Landingpage" sein soll.
 */
const SPA_ROOT_QUERY_KEYS = ['token', 'tenant'] as const;

function hasSpaRootQuery(url: URL): boolean {
  for (const key of SPA_ROOT_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null && value.trim() !== '') return true;
  }
  return false;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const hostname = hostnameOf(request);
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/robots.txt') {
      // Indexierung nur auf dem Produktions-Apex. Tenant-Subdomains (DEV und PROD)
      // haben heute keine oeffentlichen Inhalte — alles liegt hinter Login.
      // Deshalb Disallow, auch auf omlify-dev.de. Umkehrbar, falls spaeter
      // oeffentliche Kurslisten unter der Studio-Subdomain existieren.
      const allowIndexing = isApexHost(hostname) && isProductionHost(hostname);
      return robotsResponse(allowIndexing ? ROBOTS_ALLOW : ROBOTS_DISALLOW);
    }

    if (!isApexHost(hostname)) {
      return env.ASSETS.fetch(request);
    }

    if (pathname === '/' || pathname === '/index.html') {
      if (hasSpaRootQuery(url)) {
        return env.ASSETS.fetch(request);
      }
      // Ueber eine neue URL holen, nicht ueber den Original-Request: html_handling
      // wuerde /marketing.html sonst mit 307 nach /marketing schicken.
      return env.ASSETS.fetch(new URL('/marketing.html', request.url));
    }

    if (pathname === '/marketing.html') {
      return env.ASSETS.fetch(new URL('/marketing.html', request.url));
    }

    if (pathname === '/sitemap.xml') {
      if (!isProductionHost(hostname)) {
        return new Response(null, { status: 404 });
      }
      return new Response(SITEMAP_XML, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
