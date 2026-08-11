/**
 * Pulls independent capability measurements from Artificial Analysis and maps
 * them onto our model slugs.
 *
 * Run: npm run sync:bench     (needs ARTIFICIALANALYSIS_API_KEY)
 *
 * Why a second sync rather than folding this into `sync-pricing`: the two
 * sources fail independently and age differently. Prices go stale in weeks and
 * a stale price is a wrong page, so `validate.mjs` hard-fails past 30 days. A
 * capability score does not rot — a model that scored 71 last quarter still
 * scores 71 — it only goes *incomplete* when new models ship. Coupling them
 * would mean one source being down blocks a build the other could serve.
 *
 * This script never invents a number. If the key is absent it exits cleanly
 * and leaves the existing file alone; if a model has no measurement it simply
 * has no entry, and the UI drops the section for that pair.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://artificialanalysis.ai/api/v2/data/llms/models';
const ATTRIBUTION_URL = 'https://artificialanalysis.ai/';
const OUT = resolve(ROOT, 'src/data/benchmarks.json');
const CACHE = resolve(ROOT, '.cache-aa.json');

/**
 * Slug pairs our normaliser cannot reach on its own.
 *
 * Two cases live here. Re-hosts: Groq and Cerebras serve other labs' weights
 * under their own product names, so the capability score belongs to the base
 * model even though the row is a different vendor's. Punctuation: we slugify
 * `4.7` to `4-7`, Artificial Analysis may keep the dot or drop it entirely.
 *
 * Everything in this table is a guess until the first run with a real key
 * prints the unmatched list — the run reports both sides, so fixing it is
 * copy-paste rather than detective work. Keys are our slug, values are theirs.
 */
const ALIASES = {
  'llama-3-3-70b-versatile': 'llama-3-3-instruct-70b',
  'llama-3-1-70b-instruct': 'llama-3-1-instruct-70b',
  'llama-3-1-8b-instruct': 'llama-3-1-instruct-8b',
  'llama-3-1-8b-instant': 'llama-3-1-instruct-8b',
  'zai-glm-4-6': 'glm-4-6',
  'zai-glm-4-7': 'glm-4-7',
  'mistral-large-3': 'mistral-large-3',

  // Word order: upstream files the size after the version, we take it before.
  'jamba-large-1-6': 'jamba-1-6-large',
  'jamba-large-1-7': 'jamba-1-7-large',
  'jamba-mini-1-7': 'jamba-1-7-mini',

  // Upstream pins the release date on models Cohere ships undated.
  'command-r': 'command-r-03-2024',
  'command-r-plus': 'command-r-plus-04-2024',

  // Upstream marks the *non*-reasoning build and leaves the reasoning one bare.
  'grok-4-20-0309-reasoning': 'grok-4-20-0309',

  /**
   * Resolved by price fingerprint, not by name.
   *
   * Neither of these could be read off the slug: upstream carries no bare
   * `gpt-5-6`, only -luna / -sol / -terra, and `ministral-8b-latest` says
   * nothing about which generation it currently points at. What settles both
   * is that two independent sources agree on a tier structure with distinct
   * rates, and our row sits exactly on one of them.
   *
   *   gpt-5-6      $5/$30   luna $0.20/$1.20 · terra $2/$12 · sol $5/$30
   *   ministral-8b $0.15    3b $0.10 · 8b $0.15 · 14b $0.20
   *
   * Same reasoning `sync-pricing.mjs` already applies when folding snapshots:
   * a copy at a different price is a different offer. Three tiers, three
   * rates, one match each — a coincidence would need the rates to collide.
   */
  'gpt-5-6': 'gpt-5-6-sol',
  'ministral-8b-latest': 'ministral-3-8b',
};

/**
 * Strip everything that is packaging rather than identity, so `kimi-k2-5` and
 * `kimi-k2.5` collapse to the same key. Deliberately aggressive: a false match
 * across two real models would attach the wrong score to a price, so the
 * report at the end prints every automatic match for eyeballing.
 */
function normalise(slug) {
  return slug
    .toLowerCase()
    .replace(/[.\s_]/g, '-')
    .replace(/-(latest|preview|instruct|versatile|instant|chat|it)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Round to one decimal, but keep null as null rather than turning it into 0. */
function score(v) {
  const n = num(v);
  return n === null ? null : Number(n.toFixed(1));
}

/**
 * The benchmarks we render, and why these rather than the headline indices.
 *
 * `artificial_analysis_*_index` looked like the obvious choice and is wrong for
 * this job: the three run on visibly different scales (medians 15.4 / 37.6 /
 * 53.3, maxima 63.1 / 78.3 / 99.0), so drawing them on one axis invites a
 * comparison that is not there — a model reading 24 on intelligence and 93 on
 * math is not better at maths, it is being scored by two different rulers.
 *
 * These four are published as pass rates in 0–1: the share of a fixed test set
 * the model got right. That shares a unit, which is what a common axis needs.
 * Each is still its own test of its own difficulty, so the label always names
 * the benchmark and the reader is never asked to compare across rows.
 */
const BENCHMARKS = {
  ifbench: 'ifbench',
  gpqa: 'gpqa',
  livecodebench: 'livecodebench',
  tau2: 'tau2',
};

/** 0–1 pass rate to a 0–100 percentage. */
function rate(v) {
  const n = num(v);
  if (n === null) return null;
  // A value already above 1 would mean the API changed units under us; better
  // to drop it than to publish a number that is silently 100× wrong.
  if (n > 1) return null;
  return Number((n * 100).toFixed(1));
}

async function loadRaw(key) {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    writeFileSync(CACHE, text);
    return JSON.parse(text);
  } catch (err) {
    if (existsSync(CACHE)) {
      console.warn(`Fetch failed (${err.message}) — using cached copy.`);
      return JSON.parse(readFileSync(CACHE, 'utf8'));
    }
    throw err;
  }
}

/**
 * Read `.env` if it is there, without a dependency and without clobbering a
 * variable already exported in the shell.
 *
 * Node's own `--env-file` is not an option: `--env-file-if-exists` only landed
 * in 20.12, and the plain flag aborts when the file is missing — which is the
 * normal case here and has to stay a clean skip, not a crash.
 */
function loadDotEnv() {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

loadDotEnv();

const key = process.env.ARTIFICIALANALYSIS_API_KEY;
if (!key) {
  console.log(
    'ARTIFICIALANALYSIS_API_KEY not set — skipping benchmark sync.\n' +
      '  Get a free key at https://artificialanalysis.ai/ and re-run.\n' +
      `  Existing ${existsSync(OUT) ? 'data left untouched' : 'file not created'}.`
  );
  process.exit(0);
}

const raw = await loadRaw(key);
// The endpoint has shipped both a bare array and a `{ data: [...] }` envelope.
const rows = Array.isArray(raw) ? raw : (raw.data ?? raw.models ?? []);
if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('Unexpected API shape — no model array found.');
}

// Only models that earn a page are worth carrying; the rest is dead weight in
// the bundle. Read our slugs straight from the pricing snapshot.
const site = JSON.parse(readFileSync(resolve(ROOT, 'src/data/models.json'), 'utf8'));
const wanted = new Map(site.models.map((m) => [m.slug, m]));

const byNormalised = new Map();
for (const row of rows) {
  const slug = row.slug ?? row.id ?? row.name;
  if (!slug) continue;
  byNormalised.set(normalise(String(slug)), row);
}

const models = {};
const matched = [];
const missed = [];

for (const [slug] of wanted) {
  const alias = ALIASES[slug];
  const row =
    (alias && byNormalised.get(normalise(alias))) ?? byNormalised.get(normalise(slug));
  if (!row) {
    missed.push(slug);
    continue;
  }

  const ev = row.evaluations ?? {};
  const entry = {
    aaSlug: row.slug ?? row.id ?? null,
    via: alias ? 'alias' : 'auto',
    ...Object.fromEntries(
      Object.entries(BENCHMARKS).map(([key, field]) => [key, rate(ev[field])])
    ),
    /**
     * Carried for reference only, never rendered: see the note on BENCHMARKS
     * for why these cannot share an axis with each other or with the rest.
     */
    intelligenceIndex: score(ev.artificial_analysis_intelligence_index),
    /**
     * Throughput and latency are per-endpoint, not per-model: the same weights
     * on Groq and on a first-party API are different numbers. These are the
     * medians across the providers Artificial Analysis tests, so they are
     * carried for reference but never used in a verdict.
     */
    outputTokensPerSecond: score(row.median_output_tokens_per_second),
    ttftSeconds: score(row.median_time_to_first_token_seconds),
  };

  // A row that matched but carries no usable score is noise, not coverage.
  const hasAny = Object.keys(BENCHMARKS).some((k) => entry[k] !== null);
  if (!hasAny) {
    missed.push(`${slug} (matched ${entry.aaSlug}, no scores)`);
    continue;
  }

  models[slug] = entry;
  matched.push([slug, entry.aaSlug, entry.via]);
}

/**
 * Spread of each benchmark across every model the API scores, in percentage
 * points.
 *
 * Needed because "which lens do these two differ on most" cannot be answered
 * by comparing raw gaps: the tests do not spread their fields equally, so five
 * points on a bunched-up benchmark is a wider gap than five on one that fans
 * out. Measured over all upstream rows rather than our 26, since that is the
 * range the test itself discriminates over.
 */
const spread = {};
for (const [key, field] of Object.entries(BENCHMARKS)) {
  const vals = rows.map((r) => rate(r.evaluations?.[field])).filter((v) => v !== null);
  if (vals.length < 2) continue;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  spread[key] = Number(Math.sqrt(variance).toFixed(2));
}

const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  source: ATTRIBUTION_URL,
  // Rendered in the footer. The free API's terms require visible attribution.
  attribution: 'Capability scores measured independently by Artificial Analysis.',
  scale:
    'Benchmark fields are pass rates in percent (share of the test set answered ' +
    'correctly). Speed fields are medians across providers.',
  spread,
  models,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

console.log(`Wrote ${Object.keys(models).length} benchmarked models to src/data/benchmarks.json.`);
console.log('\nMatched:');
for (const [slug, aa, via] of matched) {
  console.log(`  ${via === 'alias' ? '=' : ' '} ${slug.padEnd(30)} → ${aa}`);
}
if (missed.length) {
  console.log(`\nUnmatched (${missed.length}) — add to ALIASES if the model exists upstream:`);
  for (const slug of missed) console.log(`    ${slug}`);
  console.log('\nTheir slugs, for copy-paste:');
  console.log(
    rows
      .map((r) => `    ${r.slug ?? r.id}`)
      .sort()
      .join('\n')
  );
}
