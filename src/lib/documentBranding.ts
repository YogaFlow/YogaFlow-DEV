import { deriveBrandTokens, isBrandColorAllowed, normalizeHex } from '../design/brand';

export const DEFAULT_DOCUMENT_TITLE = 'Omlify – Kurse und Buchungen für Yoga-Studios und Yogalehrer';

/** Lucide Heart v0.344, viewBox 0 0 24 24. Identischer Pfad in public/favicon.svg. */
const LUCIDE_HEART_PATH =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';

const FAVICON_SIZE = 64;
/** Gleicher Wert wie in public/favicon.svg (32 px Herz in 24er-Lucide-ViewBox). */
const HEART_TRANSFORM = 'translate(16 16) scale(1.333333)';
const SQUARE_RATIO_MIN = 0.8;
const SQUARE_RATIO_MAX = 1.25;

let faviconGeneration = 0;

export function applyDocumentTitle(name: string | null): void {
  document.title = name?.trim() || DEFAULT_DOCUMENT_TITLE;
}

function getIconLink(): HTMLLinkElement {
  const existing = document.querySelectorAll('link[rel="icon"]');
  const first = existing.item(0);
  const link = first instanceof HTMLLinkElement ? first : document.createElement('link');
  if (!first) {
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  for (let i = 1; i < existing.length; i += 1) {
    existing.item(i)?.remove();
  }
  return link;
}

function setFaviconHref(href: string, type: string | null): void {
  const link = getIconLink();
  link.href = href;
  if (type) {
    link.type = type;
  } else {
    link.removeAttribute('type');
  }
}

function applyDefaultFavicon(): void {
  setFaviconHref('/favicon.svg', 'image/svg+xml');
}

function buildHeartFaviconSvg(brandColor: string): string | null {
  const normalized = normalizeHex(brandColor);
  if (!normalized || !isBrandColorAllowed(normalized)) return null;
  try {
    const { brand, onBrand } = deriveBrandTokens(normalized);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAVICON_SIZE} ${FAVICON_SIZE}">` +
      `<circle cx="${FAVICON_SIZE / 2}" cy="${FAVICON_SIZE / 2}" r="${FAVICON_SIZE / 2}" fill="${brand}"/>` +
      `<g transform="${HEART_TRANSFORM}" fill="none" stroke="${onBrand}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="${LUCIDE_HEART_PATH}"/>` +
      `</g></svg>`
    );
  } catch {
    return null;
  }
}

function applyHeartOrDefault(brandColor: string | null): void {
  if (!brandColor) {
    applyDefaultFavicon();
    return;
  }
  const svg = buildHeartFaviconSvg(brandColor);
  if (!svg) {
    applyDefaultFavicon();
    return;
  }
  setFaviconHref(`data:image/svg+xml,${encodeURIComponent(svg)}`, 'image/svg+xml');
}

export function applyFavicon(options: {
  brandColor: string | null;
  logoUrl: string | null;
  useLogo: boolean;
}): void {
  const generation = ++faviconGeneration;

  const applyResolved = (useLogoHref: string | null) => {
    if (generation !== faviconGeneration) return;
    if (useLogoHref) {
      setFaviconHref(useLogoHref, null);
      return;
    }
    applyHeartOrDefault(options.brandColor);
  };

  if (!(options.useLogo && options.logoUrl)) {
    applyResolved(null);
    return;
  }

  const img = new Image();
  img.onload = () => {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const ratio = height > 0 ? width / height : 0;
    const isSquare = ratio >= SQUARE_RATIO_MIN && ratio <= SQUARE_RATIO_MAX;
    applyResolved(isSquare ? options.logoUrl : null);
  };
  img.onerror = () => {
    applyResolved(null);
  };
  img.src = options.logoUrl;
}
