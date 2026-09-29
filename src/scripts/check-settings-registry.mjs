#!/usr/bin/env node
/**
 * check-settings-registry.mjs — PI-011 · P2 registry proof
 *
 * The registry only earns its keep if it cannot drift from the rest of the app.
 * This runs offline (Node ≥ 22.6 strips the types, no bundler, no test runner)
 * and asserts:
 *
 *   1. id integrity      every registry id is a real config key in shared/lib/types.ts
 *   2. uniqueness        ids, and enum option values within a setting
 *   3. default validity  every declared default survives its own validation
 *   4. option validity   every `options[].value` is inside the enum it validates against
 *   5. alias integrity   no alias shadows a real id, and aliases resolve
 *   6. round-trip        defaults fill, re-resolution is idempotent, repairs = 0
 *   7. preservation      unknown config keys are passed through untouched
 *   8. i18n coverage     every label/hint/option key exists in en (error) and is
 *                        reported for the other locales (warning — PI-009 owns parity)
 *   9. taxonomy          every section used exists, and no group is empty
 *
 * Usage: node scripts/check-settings-registry.mjs
 *        node scripts/check-settings-registry.mjs --quiet      summary only
 *        node scripts/check-settings-registry.mjs --markdown   emit the reference
 *                                                              table for docs/
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const SRC = join(APP, '..');
const REGISTRY = join(SRC, 'shared/lib/settingsRegistry.ts');
const TYPES = join(SRC, 'shared/lib/types.ts');
const LOCALES = join(APP, 'public/locales');

const quiet = process.argv.includes('--quiet');
const markdown = process.argv.includes('--markdown');
const failures = [];
const warnings = [];
const ok = [];

const registry = await import(pathToFileURL(REGISTRY).href);
const { SETTINGS, SETTING_SECTIONS, settingGroups, resolveConfig, coerceSettingValue, findSetting, canonicalSettingId } = registry;

/* --------------------------------------------------------------- markdown */

if (markdown) {
  // The reference table in docs/12-… is generated from this, so it cannot drift
  // from the registry it documents.
  // Pipe characters must be escaped or the table they land in breaks.
  const describeValidation = (v) => {
    switch (v.kind) {
      case 'enum': return `\`${v.values.join(' \\| ')}\``;
      case 'range': return `\`${v.min}\`–\`${v.max}\``;
      case 'string': return v.maxLength ? `string ≤ ${v.maxLength}` : 'string';
      case 'url': return 'https URL (or empty)';
      case 'json': return 'JSON string';
      case 'boolean': return 'boolean';
    }
  };
  console.log('| Setting | Section / group | Type | Scope | Default | Validation |');
  console.log('|---|---|---|---|---|---|');
  for (const s of SETTINGS) {
    const def = s.default === '' ? '*(empty)*' : `\`${String(s.default)}\``;
    console.log(`| \`${s.id}\` | ${s.section} / ${s.group} | ${s.type} | ${s.scope} | ${def} | ${describeValidation(s.validation)} |`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ 1 + 2 */

const typesSource = readFileSync(TYPES, 'utf8');
/** Keys accepted by the server, per section of types.ts. */
function literalKeys(sectionName) {
  const start = typesSource.indexOf(sectionName);
  if (start < 0) return [];
  const end = typesSource.indexOf(']);', start);
  const body = typesSource.slice(start, end < 0 ? undefined : end);
  return [...body.matchAll(/z\.literal\('([^']+)'\)/g)].map((m) => m[1]);
}
const userKeys = new Set(literalKeys('ZUserPerferConfigKey'));
const globalKeys = new Set(literalKeys('ZConfigKey'));

const unknownIds = SETTINGS.filter((s) => !userKeys.has(s.id) && !globalKeys.has(s.id)).map((s) => s.id);
if (unknownIds.length) {
  failures.push(`ids not present in shared/lib/types.ts: ${unknownIds.join(', ')}`);
} else {
  ok.push(`id integrity: all ${SETTINGS.length} registry ids are real config keys`);
}

const scopeMismatch = SETTINGS.filter(
  (s) => s.scope === 'user' && !userKeys.has(s.id),
).map((s) => s.id);
if (scopeMismatch.length) {
  failures.push(`declared scope 'user' but not a per-user key: ${scopeMismatch.join(', ')}`);
} else {
  ok.push('scope: every `user` setting is in ZUserPerferConfigKey');
}

const seen = new Map();
for (const s of SETTINGS) {
  if (seen.has(s.id)) failures.push(`duplicate id: ${s.id}`);
  seen.set(s.id, s);
  const optionValues = (s.options ?? []).map((o) => o.value);
  if (new Set(optionValues).size !== optionValues.length) failures.push(`${s.id}: duplicate option value`);
  if ((s.options?.length ?? 0) > 0 && s.validation.kind !== 'enum') {
    failures.push(`${s.id}: options declared but validation is '${s.validation.kind}'`);
  }
}
if (!failures.some((f) => f.startsWith('duplicate id'))) ok.push('uniqueness: no duplicate ids or option values');

/* -------------------------------------------------------------------- 3 + 4 */

for (const s of SETTINGS) {
  const { changed, reason } = coerceSettingValue(s, s.default);
  if (changed) failures.push(`${s.id}: default ${JSON.stringify(s.default)} fails its own validation (${reason})`);

  if (s.validation.kind === 'enum') {
    for (const option of s.options ?? []) {
      if (!s.validation.values.includes(option.value)) {
        failures.push(`${s.id}: option '${option.value}' is not in the enum`);
      }
    }
    if (!s.validation.values.includes(String(s.default))) {
      failures.push(`${s.id}: default '${s.default}' is not in the enum`);
    }
  }
  if (s.validation.kind === 'range') {
    const { min, max } = s.validation;
    const value = Number(s.default);
    if (!Number.isFinite(value) || value < min || value > max) {
      failures.push(`${s.id}: default ${s.default} outside range ${min}–${max}`);
    }
  }
  if (!s.labelKey) failures.push(`${s.id}: missing labelKey`);
  if (!s.group) failures.push(`${s.id}: missing group`);
}
if (!failures.some((f) => f.includes('default'))) ok.push('defaults: every default passes its own validation');
else if (!failures.some((f) => /option '|outside range|not in the enum/.test(f))) ok.push('options: enum options match their validation');

/* ---------------------------------------------------------------------- 5 */

const aliasHits = SETTINGS.flatMap((s) => (s.aliases ?? []).map((a) => ({ alias: a, id: s.id })));
for (const { alias, id } of aliasHits) {
  if (seen.has(alias)) failures.push(`alias '${alias}' (for ${id}) shadows a real setting id`);
  const resolved = findSetting(alias);
  if (resolved?.id !== id) failures.push(`alias '${alias}' does not resolve to ${id}`);
  if (canonicalSettingId(id) !== id) failures.push(`canonicalSettingId(${id}) is not stable`);
}
ok.push(`aliases: ${aliasHits.length} legacy key(s) resolve canonically`);

/* -------------------------------------------------------------------- 6 + 7 */

const PARTIAL = { theme: 'dark' };
const first = resolveConfig(PARTIAL);
const second = resolveConfig(first.config);

// A partial document must fill every absent setting with its default, and every
// one of those must be a "missing" repair — an "invalid" one means a declared
// default is not a legal value, which check 3 already covers.
const expectedDefaults = SETTINGS.length - Object.keys(PARTIAL).length;
const missingRepairs = first.repairs.filter((r) => r.reason === 'missing');
const invalidRepairs = first.repairs.filter((r) => r.reason === 'invalid');
if (missingRepairs.length !== expectedDefaults || invalidRepairs.length) {
  failures.push(
    `partial config: expected ${expectedDefaults} default fill(s), got ` +
    `${missingRepairs.length} missing + ${invalidRepairs.length} invalid`,
  );
}
if (first.config.theme !== 'dark') failures.push('partial config: a provided value was not preserved');
const drift = SETTINGS.filter((s) => JSON.stringify(first.config[s.id]) !== JSON.stringify(second.config[s.id]));
if (drift.length) failures.push(`round-trip is not idempotent for: ${drift.map((s) => s.id).join(', ')}`);
if (second.repairs.length) failures.push(`re-resolving a normalised config still repairs ${second.repairs.length} value(s)`);
const defaultsFilled = SETTINGS.filter((s) => JSON.stringify(first.config[s.id]) === JSON.stringify(s.default)).length;
ok.push(`round-trip: ${expectedDefaults} default(s) filled, provided value preserved, second pass repairs 0`);
void defaultsFilled;

const passthrough = resolveConfig({ mainModelId: 'x', s3Bucket: 'b', nested: { a: 1 } });
for (const key of ['mainModelId', 's3Bucket', 'nested']) {
  if (!(key in passthrough.config)) failures.push(`unknown/non-registry key '${key}' was dropped by resolveConfig`);
}
if (!failures.some((f) => f.includes('was dropped'))) ok.push('preservation: non-registry keys (models, S3, unknown) pass through');

/* ---------------------------------------------------------------------- 8 */

const enPath = join(LOCALES, 'en/translation.json');
const en = JSON.parse(readFileSync(enPath, 'utf8'));
const needed = new Set();
for (const s of SETTINGS) {
  needed.add(s.labelKey);
  if (s.hintKey) needed.add(s.hintKey);
  for (const o of s.options ?? []) needed.add(o.labelKey);
}
for (const section of SETTING_SECTIONS) needed.add(section.labelKey);

const missingEn = [...needed].filter((k) => !(k in en));
if (missingEn.length) {
  failures.push(`missing en translation key(s) (${missingEn.length}): ${missingEn.join(', ')}`);
} else {
  ok.push(`i18n: all ${needed.size} registry strings exist in en`);
}

const otherLocales = readdirSync(LOCALES).filter((l) => l !== 'en').filter((l) => {
  try { return readdirSync(join(LOCALES, l)).includes('translation.json'); } catch { return false; }
});
const gaps = [];
for (const locale of otherLocales) {
  const data = JSON.parse(readFileSync(join(LOCALES, locale, 'translation.json'), 'utf8'));
  const missing = [...needed].filter((k) => !(k in data)).length;
  if (missing) gaps.push(`${locale}:${missing}`);
}
if (gaps.length) warnings.push(`locale parity gaps (PI-009): ${gaps.join(', ')}`);

/* --------------------------------------------------------------------- 8b */

// The appearance layer must read its state from the registry, not invent ids.
const appearancePath = join(APP, 'src/lib/appearance.ts');
let appearanceIds = [];
try {
  appearanceIds = [...readFileSync(appearancePath, 'utf8').matchAll(/read\(config,\s*'([a-zA-Z]+)'\)/g)].map((m) => m[1]);
} catch {
  warnings.push('lib/appearance.ts not found — appearance wiring not checked');
}
if (appearanceIds.length) {
  const stray = appearanceIds.filter((id) => !seen.has(id));
  if (stray.length) failures.push(`lib/appearance.ts reads unknown setting(s): ${stray.join(', ')}`);
  else ok.push(`appearance wiring: ${appearanceIds.length} setting(s) read from the registry`);

  // document-level application belongs to these sections by definition
  const appliedAtDocLevel = new Set(['appearance', 'accessibility', 'motion']);
  const unapplied = appearanceIds.filter((id) => !appliedAtDocLevel.has(seen.get(id)?.section));
  if (unapplied.length) warnings.push(`applied at the document level but not in appearance/accessibility/motion: ${unapplied.join(', ')}`);
}

/* ---------------------------------------------------------------------- 9 */

const sectionIds = new Set(SETTING_SECTIONS.map((s) => s.section));
for (const s of SETTINGS) {
  if (!sectionIds.has(s.section)) failures.push(`${s.id}: unknown section '${s.section}'`);
}
const groups = settingGroups();
if (!groups.length) failures.push('settingGroups() returned nothing');
const emptyGroups = groups.filter((g) => g.settings.length === 0);
if (emptyGroups.length) failures.push(`${emptyGroups.length} empty group(s) in the UI taxonomy`);
ok.push(`taxonomy: ${sectionIds.size} sections · ${groups.length} groups · ${groups.reduce((n, g) => n + g.settings.length, 0)} rendered settings`);

/* ------------------------------------------------------------------ report */

console.log('PlanInc settings registry — integrity + round-trip (PI-011 · P2)\n');
if (!quiet) ok.forEach((m) => console.log(`  ✓ ${m}`));
warnings.forEach((m) => console.log(`  ! ${m}`));
if (failures.length) {
  console.log('');
  failures.forEach((m) => console.log(`  ✗ ${m}`));
  console.log(`\nFAILED — ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`\nPASSED — ${ok.length} check group(s), ${SETTINGS.length} settings, ${warnings.length} warning(s).`);
