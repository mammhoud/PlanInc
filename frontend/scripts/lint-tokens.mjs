#!/usr/bin/env node
/**
 * lint-tokens.mjs — PI-011 · P1 raw-value guard
 *
 * The token contract (src/styles/tokens.css) is only worth having if component
 * code cannot quietly bypass it. This scans the app for raw colour values and
 * reports them, so tokens cannot rot as new UI lands.
 *
 *   raw colour literal      #rrggbb, rgb()/rgba(), hsl()/hsla(), oklch() in code
 *   raw palette utility     bg-blue-500, text-emerald-600, border-slate-200 …
 *
 * Scope: src/**\/*.{ts,tsx,css} minus the token layer and a small allowlist
 * (icon sets and generated files legitimately carry literal colours).
 *
 * Usage:
 *   node scripts/lint-tokens.mjs                  report only (exit 0)
 *   node scripts/lint-tokens.mjs --strict         CI gate (see below)
 *   node scripts/lint-tokens.mjs --top 20         how many offenders to list
 *   node scripts/lint-tokens.mjs --by-file        per-file counts (migration)
 *   node scripts/lint-tokens.mjs --update-baseline  record the current count
 *
 * `--strict` compares the run against `scripts/token-baseline.json`: the count
 * may not go UP, per file or in total. With no baseline on disk the allowed
 * maximum is zero. So the gate is enforced from today, and the migration in
 * PI-011 §6 (P3/P4) ratchets the recorded numbers down until zero is reached —
 * at which point `--strict` is absolute and the baseline can be deleted.
 *
 * Escape hatches (both need a REASON, which is what keeps them honest):
 *   `tokens-ignore: <reason>`       — same line is skipped
 *   `tokens-ignore-file: <reason>`  — whole file is skipped (first 30 lines)
 * Use them only where a literal is genuinely data and not a design decision —
 * legacy value compatibility maps, chart series, user-pickable colour lists.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const SRC = join(APP, 'src');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const byFileMode = args.includes('--by-file');
const updateBaseline = args.includes('--update-baseline');
const topIdx = args.indexOf('--top');
const TOP = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) || 15 : 15;

const IGNORE_RE = /tokens-ignore(?!-file)/;
const IGNORE_FILE_RE = /tokens-ignore-file:\s*(\S.*?)\s*$/m;
/** A reason shorter than this is not a reason. */
const MIN_REASON = 12;
const BASELINE_PATH = join(HERE, 'token-baseline.json');

/** Files that may hold literals by design. */
const ALLOWLIST = [
  /src\/styles\/tokens\.css$/, // the contract itself (tiers 1 and 3)
  /src\/styles\/github-markdown\.css$/, // vendored prettylights theme variables
  /Common\/Iconify\/(icons|buildIcons)/, // generated icon definitions
  /\.json$/,
];

const RULES = [
  {
    id: 'hex',
    label: 'hex literal',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    // #1234 in prose/comments is fine; these are the real offenders
    filter: (line) => !/^\s*(\/\/|\*|\/\*)/.test(line),
  },
  { id: 'rgb', label: 'rgb()/rgba()', re: /\brgba?\s*\(/g, filter: () => true },
  { id: 'hsl', label: 'hsl()/hsla()', re: /\bhsla?\s*\(/g, filter: () => true },
  { id: 'oklch', label: 'oklch()', re: /\boklch\s*\(/g, filter: () => true },
  {
    id: 'palette',
    label: 'raw palette utility',
    re: /\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g,
    filter: () => true,
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter(f => !ALLOWLIST.some(rx => rx.test(relative(APP, f))));
const findings = [];
const byRule = {};
const byDir = {};

const exemptFiles = [];

for (const file of files) {
  const rel = relative(APP, file);
  const lines = readFileSync(file, 'utf8').split('\n');

  // file-level exemption: the directive must carry a real reason
  const header = lines.slice(0, 30).join('\n');
  const fileDirective = IGNORE_FILE_RE.exec(header);
  if (fileDirective && fileDirective[1].length >= MIN_REASON) {
    exemptFiles.push({ file: rel, reason: fileDirective[1] });
    continue;
  }

  lines.forEach((line, i) => {
    if (IGNORE_RE.test(line)) return;
    for (const rule of RULES) {
      if (/^\s*(\*|\/\/)/.test(line)) continue;
      if (!rule.filter(line)) continue;
      const hits = line.match(rule.re);
      if (!hits) continue;
      for (const hit of hits) {
        findings.push({ file: rel, line: i + 1, rule: rule.id, label: rule.label, hit });
        byRule[rule.label] = (byRule[rule.label] || 0) + 1;
        const dir = rel.split('/').slice(0, 3).join('/');
        byDir[dir] = (byDir[dir] || 0) + 1;
      }
    }
  });
}

const total = findings.length;
console.log('PlanInc token contract — raw-value scan (PI-011 · P1)\n');
console.log(`  scanned ${files.length} files · ${total} raw value(s) outside the token layer`);
if (exemptFiles.length) {
  console.log(`  ${exemptFiles.length} file(s) exempt via tokens-ignore-file:`);
  exemptFiles.forEach(e => console.log(`      ${e.file} — ${e.reason}`));
}
console.log('');

if (byFileMode) {
  const perFile = {};
  findings.forEach(f => { perFile[f.file] = (perFile[f.file] || 0) + 1; });
  Object.entries(perFile).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(4)}  ${k}`));
  console.log(`\n  ${Object.keys(perFile).length} files affected`);
}

if (!byFileMode && byRule && Object.keys(byRule).length) {
  console.log('  by rule');
  Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${String(v).padStart(4)}  ${k}`));
  console.log('\n  worst directories');
  Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([k, v]) => console.log(`    ${String(v).padStart(4)}  ${k}`));
  console.log(`\n  first ${Math.min(TOP, total)} offenders`);
  findings.slice(0, TOP).forEach(f =>
    console.log(`    ${f.file}:${f.line}  ${f.hit}   (${f.label})`));
}

const perFile = {};
findings.forEach(f => { perFile[f.file] = (perFile[f.file] || 0) + 1; });

if (updateBaseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({
    note: 'Recorded by scripts/lint-tokens.mjs --update-baseline. It may only shrink.',
    total,
    files: Object.fromEntries(Object.entries(perFile).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2)}\n`);
  console.log(`\nBaseline written — ${total} raw value(s) in ${Object.keys(perFile).length} file(s).`);
  console.log('Re-run with --strict to confirm the gate passes at this level.');
  process.exit(0);
}

if (strict) {
  let baseline = null;
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch { /* no baseline yet */ }

  const regressions = [];
  if (!baseline) {
    if (total > 0) regressions.push(`${total} raw value(s) and no baseline recorded`);
  } else {
    for (const [file, count] of Object.entries(perFile)) {
      const allowed = baseline.files?.[file] ?? 0;
      if (count > allowed) regressions.push(`${file}: ${count} (max ${allowed})`);
    }
    if (total > (baseline.total ?? 0)) regressions.push(`total ${total} (max ${baseline.total})`);
  }

  if (regressions.length) {
    console.log('\nFAILED — raw values exceed the recorded baseline:');
    regressions.forEach(r => console.log(`  · ${r}`));
    console.log('\nMigrate the new values to tokens, or use `tokens-ignore: <reason>` for data.');
    process.exit(1);
  }

  const remaining = baseline ? baseline.total - total : 0;
  console.log(`\nPASSED — ${total} raw value(s), no regression vs baseline (${baseline?.total ?? 0}).`);
  if (baseline && remaining > 0) {
    console.log(`${remaining} value(s) already migrated — run --update-baseline to ratchet down.`);
  } else if (total === 0) {
    console.log('Nothing left: the token contract is complete repo-wide.');
  }
} else {
  console.log(`\n${total === 0 ? 'CLEAN' : 'BASELINE'} — ${total} raw value(s) recorded (run with --strict to gate).`);
}
