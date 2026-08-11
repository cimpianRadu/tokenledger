/**
 * Post-sync and post-build validation.
 *
 * Every check here exists because the bug it catches actually shipped:
 * duplicate model rows, a provider slug that didn't match its links, a
 * "notable" ranking that surfaced superseded models, keyword targets that
 * silently disappeared from titles. Cheap to run, so run it every time.
 *
 *   npm run check           data checks only
 *   npm run check -- --dist data + built output (run after `astro build`)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const checkDist = process.argv.includes('--dist');

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
/** `kind` groups repetitive warnings so 187 title-length notes print as one. */
const warn = (m, kind = null) => warnings.push({ m, kind });

/* ---------------------------------------------------------------- data --- */

const dataPath = resolve(ROOT, 'src/data/models.json');
if (!existsSync(dataPath)) {
  console.error('✗ src/data/models.json missing. Run `npm run sync` first.');
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const { models, providers, updatedAt } = data;

/** Staleness. Prices move monthly; silently serving old rates is the worst
 *  failure mode this site has, because it still looks correct. */
const ageDays = Math.floor(
  (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
);
if (Number.isNaN(ageDays)) fail(`updatedAt is not a date: ${updatedAt}`);
else if (ageDays > 30) fail(`Pricing data is ${ageDays} days old. Run sync.`);
else if (ageDays > 7) warn(`Pricing data is ${ageDays} days old.`);

const REQUIRED = [
  'id',
  'slug',
  'name',
  'brand',
  'provider',
  'providerName',
  'providerSlug',
  'counting',
  'input',
  'output',
];

const slugs = new Map();
const names = new Map();
const providerKeys = new Set(providers.map((p) => p.key));
const providerSlugs = new Set(providers.map((p) => p.slug));

for (const m of models) {
  for (const f of REQUIRED) {
    if (m[f] === undefined || m[f] === null || m[f] === '')
      fail(`${m.id ?? '<no id>'}: missing "${f}"`);
  }

  if (slugs.has(m.slug)) fail(`Duplicate slug "${m.slug}": ${slugs.get(m.slug)} and ${m.id}`);
  slugs.set(m.slug, m.id);

  const nameKey = `${m.provider}|${m.name}`;
  if (names.has(nameKey))
    fail(`Duplicate model "${m.name}" in ${m.provider}: ${names.get(nameKey)} and ${m.id}`);
  names.set(nameKey, m.id);

  if (!providerKeys.has(m.provider))
    fail(`${m.id}: provider "${m.provider}" not in the providers list`);
  if (!providerSlugs.has(m.providerSlug))
    fail(`${m.id}: providerSlug "${m.providerSlug}" has no matching provider page`);

  if (!(m.input > 0)) fail(`${m.id}: input price is ${m.input}`);
  if (!(m.output > 0)) fail(`${m.id}: output price is ${m.output}`);
  if (m.cachedInput !== null && m.cachedInput > m.input)
    warn(`${m.id}: cached input ($${m.cachedInput}) exceeds input ($${m.input})`);
  if (m.output < m.input)
    warn(`${m.id}: output cheaper than input — unusual, verify against the provider`);
  if (m.contextWindow !== null && m.contextWindow < 1000)
    warn(`${m.id}: context window ${m.contextWindow} looks wrong`);
  if (!['exact', 'estimated'].includes(m.counting))
    fail(`${m.id}: counting must be "exact" or "estimated", got "${m.counting}"`);
}

/** Snapshot collapse regression: a dated variant sitting next to its alias at
 *  identical rates means sync stopped folding them. */
const SNAPSHOT = /^(.+?)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|\d{4})$/;
for (const m of models) {
  const match = SNAPSHOT.exec(m.name);
  if (!match) continue;
  const base = models.find(
    (x) => x.provider === m.provider && x.name === match[1]
  );
  if (
    base &&
    base.input === m.input &&
    base.output === m.output &&
    base.contextWindow === m.contextWindow
  )
    fail(`"${m.name}" duplicates "${base.name}" — snapshot collapse regressed`);
}

/** Redundancy: identical price and context inside one provider. Some of this
 *  is legitimate (audio vs search variants), so it warns rather than fails. */
const buckets = new Map();
for (const m of models) {
  const k = `${m.provider}|${m.input}|${m.output}|${m.contextWindow}`;
  buckets.set(k, (buckets.get(k) ?? 0) + 1);
}
const redundant = [...buckets.values()].reduce((s, n) => s + Math.max(0, n - 1), 0);
const redundantPct = Math.round((redundant / models.length) * 100);
if (redundantPct > 60)
  fail(`${redundantPct}% of rows share price and context with a sibling — sync is over-listing.`);
else if (redundantPct > 40)
  warn(`${redundantPct}% of rows share price and context with a sibling.`);

/** Provider coverage: a provider that drops to zero means an upstream key
 *  changed (this is exactly how Cohere silently vanished). */
for (const p of providers) {
  const n = models.filter((m) => m.provider === p.key).length;
  if (n === 0) fail(`Provider "${p.name}" has no models — upstream key may have changed.`);
  else if (n !== p.modelCount)
    fail(`Provider "${p.name}" count mismatch: header says ${p.modelCount}, found ${n}.`);
}

/** Ranking sanity: the notable set drives /compare/ pages. If it is dominated
 *  by small context windows, the price-sorted regression is back. */
const DATED = /-(\d{4}-?\d{2}-?\d{2}|\d{4})$/;
const notable = providers.flatMap((p) =>
  models
    .filter((m) => m.provider === p.key)
    .filter((m) => !DATED.test(m.name))
    .filter((m) => (m.contextWindow ?? 0) >= 100_000)
    .sort(
      (a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0) || b.input - a.input
    )
    .slice(0, 3)
);
if (notable.length === 0) fail('notable model set is empty — no /compare/ pages would build.');
const pairs = (notable.length * (notable.length - 1)) / 2;
if (pairs > 1500)
  warn(`${pairs} comparison pages. Above ~1500 this reads as thin content; lower perProvider.`);

/* --------------------------------------------------------------- output --- */

/** Keyword targets we measured. If a title stops containing its term, the page
 *  has drifted off the query it was built for. */
const KEYWORD_TARGETS = [
  ['index.html', 'token counter'],
  ['index.html', 'llm cost calculator'],
  ['models/index.html', 'llm api pricing'],
  ['pricing/anthropic/index.html', 'claude api pricing'],
  ['pricing/openai/index.html', 'gpt api pricing'],
  ['pricing/moonshot/index.html', 'kimi api pricing'],
  ['pricing/xai/index.html', 'grok api pricing'],
  ['methodology/index.html', 'methodology'],
];

/**
 * A count typed as a literal where an expression belongs.
 *
 * The homepage title read "— 249 models" while the description and body of the
 * same page interpolated `models.length`. So the one string Google reads was
 * the one string nothing kept in step, and every sync widened the gap. This
 * checks the source rather than the output, because on a provider page "36
 * models" is correct prose and only the author's intent distinguishes them.
 */
function astroFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? astroFiles(p) : p.endsWith('.astro') ? [p] : [];
  });
}
for (const file of astroFiles(resolve(ROOT, 'src/pages'))) {
  const src = readFileSync(file, 'utf8');
  for (const [, attr, value] of src.matchAll(
    /\b(title|description)="([^"]*)"/g
  )) {
    const n = /(\d{2,})\s+(models|providers)/.exec(value);
    if (n)
      fail(
        `${relative(ROOT, file)}: ${attr} hardcodes "${n[1]} ${n[2]}" — ` +
          'interpolate the count so it cannot go stale.'
      );
  }
}

/** Trust pages that must never silently disappear. */
const REQUIRED_PAGES = ['methodology/index.html', '404.html', 'robots.txt'];

/** Every title must lead with its query phrase and survive truncation. */
const TITLE_LIMIT = 60;

if (checkDist) {
  if (!existsSync(DIST)) {
    fail('dist/ not found. Run `astro build` before checking output.');
  } else {
    const pages = [];
    (function walk(dir) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.html')) pages.push(full);
      }
    })(DIST);

    const linkedTo = new Set();
    const built = new Set(
      pages.map((p) => '/' + relative(DIST, p).replace(/index\.html$/, '').replace(/\\/g, '/'))
    );
    const titles = new Map();

    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      const route = '/' + relative(DIST, page).replace(/index\.html$/, '').replace(/\\/g, '/');

      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
      if (!title) fail(`${route}: no <title>`);
      else {
        if (title.length > TITLE_LIMIT)
          warn(`${route} (${title.length} chars)`, `Titles over ${TITLE_LIMIT} chars — Google truncates the tail`);
        const seen = titles.get(title);
        if (seen) fail(`Duplicate title on ${seen} and ${route}: "${title}"`);
        titles.set(title, route);
      }

      if (!/<meta name="description"/.test(html)) fail(`${route}: no meta description`);
      if (!/<link rel="canonical"/.test(html)) fail(`${route}: no canonical`);
      if (!/<h1[\s>]/.test(html)) warn(`${route}: no <h1>`);


      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
      if (description && description.length > 160)
        warn(`${route} (${description.length} chars)`, 'Meta descriptions over 160 chars');
      if (!/ld\+json/.test(html)) warn(route, 'Pages with no structured data');

      for (const href of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        let target = href[1];
        if (!target.endsWith('/')) target += '/';
        // Only page routes are checked; bundled assets and files with an
        // extension are emitted by the build and verified by it.
        if (/\.[a-z0-9]{2,5}\/$/i.test(target) || target.startsWith('/_astro/'))
          continue;
        if (!built.has(target))
          fail(`${route}: broken internal link → ${href[1]}`);
        if (target !== route) linkedTo.add(target);
      }
    }

    /** Orphans are pages a crawler can reach only from the sitemap. 541 of the
     *  comparison pages were orphaned once; nothing in the build said so. */
    const orphans = [...built].filter(
      (r) => !linkedTo.has(r) && r !== '/' && !r.startsWith('/404')
    );
    if (orphans.length)
      fail(
        `${orphans.length} orphan page(s) — not linked from anywhere. First: ${orphans
          .slice(0, 3)
          .join(', ')}`
      );

    for (const file of ['og.png']) {
      if (!existsSync(join(DIST, file))) warn(`${file} missing from dist.`);
    }
    for (const file of REQUIRED_PAGES) {
      if (!existsSync(join(DIST, file))) fail(`Required page missing: ${file}`);
    }

    for (const [file, term] of KEYWORD_TARGETS) {
      const full = join(DIST, file);
      if (!existsSync(full)) {
        fail(`Keyword target page missing: ${file}`);
        continue;
      }
      const title = /<title>([^<]*)<\/title>/.exec(readFileSync(full, 'utf8'))?.[1] ?? '';
      if (!title.toLowerCase().includes(term))
        fail(`${file}: title no longer targets "${term}" — got "${title}"`);
    }

    if (!existsSync(join(DIST, 'sitemap-index.xml')))
      warn('No sitemap-index.xml in dist.');

    console.log(`Checked ${pages.length} built pages.`);
  }
}

/* --------------------------------------------------------------- report --- */

console.log(
  `${models.length} models · ${providers.length} providers · synced ${updatedAt} (${ageDays}d ago)`
);

const grouped = new Map();
for (const w of warnings) {
  if (!w.kind) { console.log(`  warn  ${w.m}`); continue; }
  if (!grouped.has(w.kind)) grouped.set(w.kind, []);
  grouped.get(w.kind).push(w.m);
}
for (const [kind, items] of grouped) {
  console.log(`  warn  ${kind} — ${items.length} page(s)`);
  for (const ex of items.slice(0, 3)) console.log(`          ${ex}`);
  if (items.length > 3) console.log(`          …and ${items.length - 3} more`);
}
for (const e of errors) console.log(`  FAIL  ${e}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`\n✓ Passed with ${warnings.length} warning(s).`);
