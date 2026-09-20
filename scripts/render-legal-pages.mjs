import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

export const LEGAL_PAGES = [
  {
    slug: 'impressum',
    source: 'docs/legal/Impressum.md',
    title: 'Impressum – Omlify',
    description:
      'Impressum von Omlify: Angaben nach § 5 DDG, Kontakt, Umsatzsteuer-ID und Verantwortliche.',
  },
  {
    slug: 'datenschutz',
    source: 'docs/legal/Datenschutzerklaerung.md',
    title: 'Datenschutzerklärung – Omlify',
    description:
      'Datenschutzerklärung von Omlify: welche Daten wir verarbeiten, in wessen Auftrag, und welche Rechte du hast.',
  },
  {
    slug: 'agb',
    source: 'docs/legal/AGB.md',
    title: 'AGB – Omlify',
    description:
      'Allgemeine Geschäftsbedingungen für die Nutzung von Omlify durch Yoga-Studios und Yogalehrende.',
  },
  {
    slug: 'auftragsverarbeitung',
    source: 'docs/legal/AVV_Auftragsverarbeitung.md',
    title: 'Auftragsverarbeitung – Omlify',
    description:
      'Vertrag über die Auftragsverarbeitung nach Art. 28 DSGVO zwischen Studio und Omlify.',
  },
];

export const legalRollupInput = Object.fromEntries(
  LEGAL_PAGES.map((page) => [`legal/${page.slug}`, `legal/${page.slug}.html`]),
);

const FOOTER_LINKS = [
  { slug: 'impressum', label: 'Impressum' },
  { slug: 'datenschutz', label: 'Datenschutz' },
  { slug: 'agb', label: 'AGB' },
  { slug: 'auftragsverarbeitung', label: 'Auftragsverarbeitung' },
];

const IMPLEMENTATION_NOTES = /^## Hinweise zur Umsetzung\s*$/m;

export function stripImplementationNotes(markdown) {
  const index = markdown.search(IMPLEMENTATION_NOTES);
  if (index === -1) return markdown.trimEnd();
  return markdown.slice(0, index).trimEnd();
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlineFormat(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function joinWrappedLines(lines) {
  // Fliesstext im Markdown ist auf ~70 Zeichen umbrochen. Kurze Zeilen
  // (Anschrift, Telefon) bleiben Zeilenumbrueche; sonst wird mit Leerzeichen
  // zusammengezogen, damit **fett** ueber Umbrueche erhalten bleibt.
  const useBreaks = lines.length > 1 && lines.every((line) => line.length <= 50);
  const joined = useBreaks ? lines.join('\n') : lines.join(' ');
  return inlineFormat(joined).replaceAll('\n', '<br>');
}

function splitCells(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(row) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(row);
}

function renderTable(rows) {
  const bodyRows = [];
  let headerCells = null;
  for (const row of rows) {
    if (isSeparatorRow(row)) continue;
    const cells = splitCells(row);
    if (!headerCells) {
      headerCells = cells;
      continue;
    }
    bodyRows.push(cells);
  }
  if (!headerCells) return '';
  const thead = `<thead><tr>${headerCells.map((cell) => `<th>${inlineFormat(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${inlineFormat(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<div class="legal-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function renderList(items) {
  const lis = items.map((itemLines) => `<li>${joinWrappedLines(itemLines)}</li>`).join('');
  return `<ul>${lis}</ul>`;
}

function headingTag(line) {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (!match) return null;
  const level = match[1].length;
  return `<h${level}>${inlineFormat(match[2])}</h${level}>`;
}

export function markdownToHtml(markdown) {
  const lines = stripImplementationNotes(markdown).replaceAll('\r\n', '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      html.push('<hr>');
      i += 1;
      continue;
    }
    const heading = headingTag(line);
    if (heading) {
      html.push(heading);
      i += 1;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i]);
        i += 1;
      }
      html.push(renderTable(rows));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        if (current.trim() === '') break;
        if (/^#{1,6}\s/.test(current) || /^---+$/.test(current.trim()) || current.trim().startsWith('|')) break;
        const itemMatch = /^\s*[-*]\s+(.*)$/.exec(current);
        if (itemMatch) {
          items.push([itemMatch[1]]);
          i += 1;
          continue;
        }
        if (items.length > 0 && /^\s+/.test(current)) {
          items[items.length - 1].push(current.trim());
          i += 1;
          continue;
        }
        break;
      }
      html.push(renderList(items));
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim() === '') break;
      if (/^#{1,6}\s/.test(current) || /^---+$/.test(current.trim()) || current.trim().startsWith('|')) break;
      if (/^\s*[-*]\s+/.test(current)) break;
      para.push(current);
      i += 1;
    }
    html.push(`<p>${joinWrappedLines(para)}</p>`);
  }
  while (html.at(-1) === '<hr>') html.pop();
  return html.join('\n');
}

function pageTemplate({ slug, title, description, body }) {
  const canonical = `https://omlify.de/legal/${slug}`;
  const others = FOOTER_LINKS.filter((link) => link.slug !== slug);
  const footerLinks = others
    .map(
      (link) =>
        `<a href="/legal/${link.slug}">${escapeHtml(link.label)}</a>`,
    )
    .join('\n        ');

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="theme-color" content="#F5F3EF" />
    <link rel="preload" as="font" type="font/woff2" href="../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2" crossorigin />
    <link rel="stylesheet" href="../src/marketing/legal.css" />
  </head>
  <body>
    <header class="legal-header">
      <a class="legal-brand" href="/">Omlify</a>
      <a class="legal-back" href="/">Zur Startseite</a>
    </header>
    <main class="legal-main">
      <article class="legal-article">
${body.replace(/^/gm, '        ')}
      </article>
    </main>
    <footer class="legal-footer">
      <nav aria-label="Weitere rechtliche Seiten">
        ${footerLinks}
      </nav>
    </footer>
  </body>
</html>
`;
}

export function writeLegalHtmlPages() {
  const outDir = join(rootDir, 'legal');
  mkdirSync(outDir, { recursive: true });
  for (const page of LEGAL_PAGES) {
    const markdown = readFileSync(join(rootDir, page.source), 'utf8');
    const stripped = stripImplementationNotes(markdown);
    if (/Hinweise zur Umsetzung/.test(stripped)) {
      throw new Error(`${page.source}: Abschnitt „Hinweise zur Umsetzung“ wurde nicht vollständig entfernt.`);
    }
    const body = markdownToHtml(markdown);
    const html = pageTemplate({ ...page, body });
    if (/<script/i.test(html)) {
      throw new Error(`${page.slug}: erzeugtes HTML enthält ein script-Tag.`);
    }
    if (/Hinweise zur Umsetzung/.test(html)) {
      throw new Error(`${page.slug}: Hinweise zur Umsetzung sind in die HTML-Datei geraten.`);
    }
    writeFileSync(join(outDir, `${page.slug}.html`), html, 'utf8');
  }
}
