/** K1/AVV: gleiche Normalisierung wie yogaflow_private.normalize_legal_text / hashLegalMarkdown. */

export function normalizeLegalText(text: string): string {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
}

export async function hashLegalText(text: string): Promise<string> {
  const normalized = normalizeLegalText(text);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
