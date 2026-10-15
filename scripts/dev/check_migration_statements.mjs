#!/usr/bin/env node
/**
 * Listet Anweisungen der obersten Ebene in einer SQL-Migration.
 * Mit --allow nur die genannten Funktionsnamen (ohne Schema) erlaubt.
 * Warnt bei CREATE FUNCTION ohne Körper (Paste-Fehler mit auskommentiertem RETURNS).
 *
 * Aufruf:
 *   node scripts/dev/check_migration_statements.mjs <datei> [--allow name1,name2,…]
 *   npm run check:migration -- <datei> --allow name1,name2,…
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.error(
    'Usage: check_migration_statements.mjs <file.sql> [--allow name1,name2,...]',
  );
  process.exit(args.length === 0 ? 1 : 0);
}

const filePath = resolve(args[0]);
let allowList = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--allow') {
    const raw = args[i + 1] ?? '';
    allowList = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    i++;
  }
}

const text = readFileSync(filePath, 'utf8');
const lines = text.split(/\r?\n/);

const STMT_RE =
  /^(CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|TRIGGER|TABLE|UNIQUE\s+INDEX|INDEX|POLICY)|DROP\s+(?:FUNCTION|TRIGGER|INDEX|POLICY|TABLE)|ALTER\s+TABLE|DO\s+\$\$|SELECT\s+cron\.schedule|GRANT\s+|REVOKE\s+)/i;

const CREATE_FN_RE =
  /^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*\(/i;

const LIVE_DDL_START_RE = /^(CREATE|ALTER|DROP)\b/i;

/**
 * Find dollar-tag that opens a function/DO body starting at line i.
 * Returns { tag, openLine } or null.
 */
function findBodyOpen(startIdx) {
  for (let j = startIdx; j < Math.min(startIdx + 40, lines.length); j++) {
    const t = lines[j];
    if (/^DO\s+\$\$/i.test(t.trimStart()) && j === startIdx) {
      return { tag: '$$', openLine: j };
    }
    const as = t.match(/AS\s+(\$[a-zA-Z_]*\$)/i);
    if (as) return { tag: as[1], openLine: j };
  }
  return null;
}

/** @type {{ line: number, text: string, kind: string, fnName: string | null }[]} */
const statements = [];
let inDollar = false;
let dollarTag = null;
let dollarOpenLine = -1;

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trimStart();

  if (inDollar) {
    if (i <= dollarOpenLine) continue;
    if (dollarTag && trimmed.includes(dollarTag)) {
      const escaped = dollarTag.replace(/\$/g, '\\$');
      const closeRe = new RegExp(escaped + '\\s*;?\\s*$');
      if (
        closeRe.test(trimmed) ||
        trimmed === dollarTag ||
        trimmed === dollarTag + ';'
      ) {
        inDollar = false;
        dollarTag = null;
        dollarOpenLine = -1;
      }
    }
    continue;
  }

  if (trimmed.startsWith('--')) continue;
  if (!STMT_RE.test(trimmed)) continue;

  const kind = trimmed.split(/\s+/).slice(0, 4).join(' ');
  let fnName = null;
  const m = trimmed.match(CREATE_FN_RE);
  if (m) fnName = m[2];

  statements.push({
    line: i + 1,
    text: trimmed.slice(0, 120),
    kind,
    fnName,
  });

  if (
    /^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\b/i.test(trimmed) ||
    /^DO\s+\$\$/i.test(trimmed)
  ) {
    const open = findBodyOpen(i);
    if (open) {
      inDollar = true;
      dollarTag = open.tag;
      dollarOpenLine = open.openLine;
    }
  }
}

/** CREATE FUNCTION ohne Körper → Kommentar/-- RETURNS oder anderes DDL */
const commentWarnings = [];
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trimStart();
  if (!/^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\b/i.test(trimmed)) continue;
  if (trimmed.startsWith('--')) continue;

  let sawBodyStart = false;
  let sawCommentedBody = false;
  let nextLiveDdl = null;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trimStart();
    if (t === '') continue;
    if (/AS\s+\$/i.test(t) || /^\$[a-zA-Z_]*\$/.test(t)) {
      sawBodyStart = true;
      break;
    }
    if (t.startsWith('--')) {
      if (/^--\s*(RETURNS|LANGUAGE|AS\s+\$|DECLARE|BEGIN)\b/i.test(t)) {
        sawCommentedBody = true;
      }
      continue;
    }
    if (LIVE_DDL_START_RE.test(t)) {
      nextLiveDdl = { line: j + 1, text: t.slice(0, 100) };
    }
    break;
  }
  if (!sawBodyStart && (sawCommentedBody || nextLiveDdl)) {
    commentWarnings.push({
      line: i + 1,
      text: trimmed.slice(0, 100),
      next: nextLiveDdl,
    });
  }
}

let exitCode = 0;

console.log(`# ${filePath}`);
console.log(`# ${statements.length} top-level statements\n`);
for (const s of statements) {
  const tag = s.fnName ? `  [${s.fnName}]` : '';
  console.log(`${String(s.line).padStart(5)}  ${s.text}${tag}`);
}

if (commentWarnings.length > 0) {
  exitCode = 1;
  console.error(
    '\n# WARNUNG: CREATE FUNCTION ohne Körper, danach Kommentar/-- RETURNS oder anderes DDL:',
  );
  for (const w of commentWarnings) {
    console.error(`  L${w.line}: ${w.text}`);
    if (w.next) console.error(`    → L${w.next.line}: ${w.next.text}`);
  }
}

if (allowList !== null) {
  const created = statements
    .filter((s) => s.fnName)
    .map((s) => s.fnName);
  const forbidden = [...new Set(created.filter((n) => !allowList.has(n)))];
  if (forbidden.length > 0) {
    exitCode = 1;
    console.error(
      '\n# FEHLER: Funktion(en) nicht in --allow:',
      forbidden.join(', '),
    );
  }
  const missing = [...allowList].filter((n) => !created.includes(n));
  if (missing.length > 0) {
    console.error(
      '\n# Hinweis: in --allow, aber in der Datei kein CREATE FUNCTION:',
      missing.join(', '),
    );
  }
}

process.exit(exitCode);
