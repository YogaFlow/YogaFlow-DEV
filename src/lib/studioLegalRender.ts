/**
 * RT-1 — Rendert Studio-Rechtstext-Vorlagen ({{var}}, {{#if}}, {{#unless}}, Partials).
 * Autoritative Logik für Vorschau, Freigabe-Snapshot und Unit-Tests.
 * Widerrufsbelehrung: gleicher Wortlaut wie passOnlineTexts.PASS_WITHDRAWAL_BELEHRUNG_BODY
 * (eine Quelle inhaltlich; Import vermieden wegen Node-Unit-Tests ohne Vite-Resolver).
 */

/** Muss mit PASS_WITHDRAWAL_BELEHRUNG_BODY in passOnlineTexts.ts übereinstimmen. */
export const STUDIO_LEGAL_WIDERRUF_PARTIAL =
  'Du kannst den Vertrag innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. ' +
  'Die Frist beginnt mit dem Kauf. Weil du der sofortigen Nutzung zustimmst, leistest du bei Widerruf ' +
  'anteilig Wertersatz für bereits genutzte Termine (Preis ÷ Termine × genutzte Termine). ' +
  'Ungenutzte Termine werden entwertet. Den Widerruf erklärst du über „Mehrfachkarten“ oder die Seite Widerruf.';

export type StudioLegalKind = 'imprint' | 'terms' | 'privacy';

export type StudioLegalValues = {
  studio_name: string;
  legal_name: string;
  legal_form_label: string;
  representatives: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  contact_email: string;
  phone: string;
  register_court: string;
  register_number: string;
  vat_id: string;
  economic_id: string;
  studio_url: string;
  cancellation_hours: string;
  tax_small_business: boolean;
  pay_online: boolean;
  pay_onsite: boolean;
  passes_any: boolean;
  passes_online: boolean;
  extra_rules: string;
  stand_date: string;
  subprocessors_list: string;
};

const PARTIALS: Record<string, string> = {
  widerrufsbelehrung_karten: STUDIO_LEGAL_WIDERRUF_PARTIAL,
};

const ZIFFER_BY_TITLE: Record<string, string> = {
  'Abmeldung durch dich': '6',
  Widerrufsrecht: '9',
  Haftung: '11',
};

function escapeExtraRules(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function isTruthy(values: StudioLegalValues, key: string): boolean {
  const v = (values as Record<string, unknown>)[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().length > 0;
  return Boolean(v);
}

function processConditionals(input: string, values: StudioLegalValues): string {
  let text = input;
  // Innermost first: body must not contain another {{#if/unless}}.
  const innerRe =
    /\{\{#(if|unless)\s+([a-z_]+)\}\}((?:(?!\{\{#(if|unless)\b)[\s\S])*?)\{\{\/\1\}\}/g;
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(innerRe, (_m, kind: string, key: string, body: string) => {
      const ok = isTruthy(values, key);
      const keep = kind === 'if' ? ok : !ok;
      return keep ? body : '';
    });
  }
  if (/\{\{#(if|unless)\b/.test(text)) {
    throw new Error('Bedingungsblöcke konnten nicht aufgelöst werden');
  }
  return text;
}

function processPartials(input: string): string {
  return input.replace(/\{\{>\s*([a-z_]+)\}\}/g, (_m, name: string) => {
    const body = PARTIALS[name];
    if (body == null) throw new Error(`Unbekanntes Partial: ${name}`);
    return body;
  });
}

function processVars(input: string, values: StudioLegalValues): string {
  return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => {
    if (!(key in values)) throw new Error(`Unbekannter Platzhalter: ${key}`);
    const v = (values as Record<string, unknown>)[key];
    if (typeof v === 'boolean') return v ? 'true' : '';
    return String(v ?? '');
  });
}

function renumberHeadings(input: string): string {
  let n = 0;
  const titleToNum = new Map<string, number>();
  const numbered = input.replace(
    /^##\s+(?:\d+\.\s*)?(.+)$/gm,
    (_m, title: string) => {
      n += 1;
      const clean = String(title)
        .replace(/^\{\{[^}]+\}\}/, '')
        .replace(/^\d+\.\s*/, '')
        .trim();
      // Strip leading "12. "/"13. " left by template if-construction
      const bare = clean.replace(/^\d+\.\s*/, '');
      titleToNum.set(bare, n);
      return `## ${n}. ${bare}`;
    },
  );

  let out = numbered;
  for (const [title, legacy] of Object.entries(ZIFFER_BY_TITLE)) {
    const actual = titleToNum.get(title);
    if (actual == null) continue;
    out = out.split(`Ziffer ${legacy}`).join(`Ziffer ${actual}`);
  }
  return out;
}

function assertNoPlaceholders(text: string): void {
  if (/\{\{/.test(text) || /\}\}/.test(text)) {
    throw new Error(`Platzhalter-Reste nach Render: ${text.match(/\{\{[^}]*\}\}/)?.[0] ?? '?'}`);
  }
}

export function formatCancellationHoursLabel(hours: number): string {
  if (hours === 1) return '1 Stunde';
  return `${hours} Stunden`;
}

export function formatSubprocessorsList(
  items: { name: string; purpose: string; location: string }[],
  guarantee: string,
): string {
  const lines = items.map((i) => `- ${i.name} — ${i.purpose} — ${i.location}`);
  return `${lines.join('\n')}\n\n${guarantee}`;
}

export function renderStudioLegalTemplate(
  template: string,
  values: StudioLegalValues,
): string {
  const vals: StudioLegalValues = {
    ...values,
    extra_rules: values.extra_rules ? escapeExtraRules(values.extra_rules) : '',
  };
  let text = processConditionals(template, vals);
  text = processPartials(text);
  text = processVars(text, vals);
  text = renumberHeadings(text);
  // Collapse excess blank lines from removed blocks
  text = text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  assertNoPlaceholders(text);
  return text;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
