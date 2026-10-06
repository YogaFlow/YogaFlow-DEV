/**
 * UX-7 — Kartenhinweis im Kursdetail: Vorlage mit Platzhaltern, Rendering an einer Stelle.
 */
import { formatCents } from './format.ts';

export const PASS_HINT_DEFAULT_TEMPLATE =
  'Mit der {karte} zahlst du {preis_karte} statt {preis_einzel}.';

export const PASS_HINT_MAX_LEN = 120;

export const PASS_HINT_PLACEHOLDERS = [
  'karte',
  'preis_karte',
  'preis_einzel',
  'ersparnis',
] as const;

export type PassHintPlaceholder = (typeof PASS_HINT_PLACEHOLDERS)[number];

const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;

export type PassHintProduct = {
  name: string;
  price_cents: number;
  units: number;
};

export type PassHintValues = {
  passName: string;
  passPriceCents: number;
  passUnits: number;
  coursePriceEuros: number;
};

/**
 * Freitext-Escaping für HTML-Kontext (Belege/Tests).
 * In React als Textkind reicht die Ausgabe von renderPassHint ungeescaped —
 * dort nie dangerouslySetInnerHTML.
 */
export function escapePassHintHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(PASS_HINT_PLACEHOLDERS);
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (!known.has(key)) found.add(key);
  }
  return [...found].sort();
}

/** Leeres Feld → Vorbelegung. Sonst Länge und unbekannte Platzhalter prüfen. */
export function validatePassHintTemplate(
  raw: string | null | undefined,
): { ok: true; template: string | null } | { ok: false; message: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, template: null };
  if (trimmed.length > PASS_HINT_MAX_LEN) {
    return {
      ok: false,
      message: `Der Text darf höchstens ${PASS_HINT_MAX_LEN} Zeichen haben.`,
    };
  }
  const unknown = unknownPlaceholders(trimmed);
  if (unknown.length) {
    const list = unknown.map((k) => `{${k}}`).join(', ');
    return {
      ok: false,
      message: `Unbekannte Platzhalter: ${list}.`,
    };
  }
  return { ok: true, template: trimmed };
}

/**
 * Rendert die Vorlage. Platzhalterwerte sind formatiert.
 * Freitext bleibt Rohtext — in React als Textkind (nie dangerouslySetInnerHTML);
 * für HTML-Kontext `escapePassHintHtml` nutzen.
 * Bei fehlender Ersparnis (Kartenpreis ≥ Einzelpreis) → null.
 */
export function renderPassHint(
  template: string | null | undefined,
  values: PassHintValues,
): { ok: true; text: string | null } | { ok: false; message: string } {
  if (values.passUnits < 1) return { ok: true, text: null };
  const perPass = Math.round(values.passPriceCents / values.passUnits);
  const courseCents = Math.round(values.coursePriceEuros * 100);
  if (!Number.isFinite(perPass) || !Number.isFinite(courseCents) || perPass >= courseCents) {
    return { ok: true, text: null };
  }
  const savings = courseCents - perPass;
  const resolved = (template ?? '').trim() || PASS_HINT_DEFAULT_TEMPLATE;
  const check = validatePassHintTemplate(resolved);
  if (!check.ok) return check;

  const map: Record<PassHintPlaceholder, string> = {
    karte: values.passName,
    preis_karte: formatCents(perPass),
    preis_einzel: formatCents(courseCents),
    ersparnis: formatCents(savings),
  };

  let out = '';
  let last = 0;
  for (const match of resolved.matchAll(PLACEHOLDER_RE)) {
    const idx = match.index ?? 0;
    out += resolved.slice(last, idx);
    const key = match[1] as PassHintPlaceholder;
    out += map[key];
    last = idx + match[0].length;
  }
  out += resolved.slice(last);
  return { ok: true, text: out };
}

/** Produkt mit dem niedrigsten Preis pro Termin. */
export function pickCheapestPassProduct<T extends PassHintProduct>(
  products: T[],
): T | null {
  let best: T | null = null;
  let bestPer = Infinity;
  for (const p of products) {
    if (!Number.isFinite(p.units) || p.units < 1) continue;
    if (!Number.isFinite(p.price_cents)) continue;
    const per = p.price_cents / p.units;
    if (per < bestPer) {
      bestPer = per;
      best = p;
    }
  }
  return best;
}

/** Kursdetail: Hinweis nur wenn Schalter an und Anzeige-Regeln erfüllt. */
export function resolveCoursePassHint(input: {
  enabled: boolean;
  template: string | null | undefined;
  passEligible: boolean;
  hasPassOption: boolean;
  products: PassHintProduct[];
  coursePriceEuros: number | null | undefined;
}): string | null {
  if (!input.enabled) return null;
  if (!input.passEligible || input.hasPassOption) return null;
  if (input.coursePriceEuros == null || !Number.isFinite(input.coursePriceEuros)) return null;
  const product = pickCheapestPassProduct(input.products);
  if (!product) return null;
  const rendered = renderPassHint(input.template, {
    passName: product.name,
    passPriceCents: product.price_cents,
    passUnits: product.units,
    coursePriceEuros: input.coursePriceEuros,
  });
  if (!rendered.ok) return null;
  return rendered.text;
}
