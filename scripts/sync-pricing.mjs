/**
 * Pulls the community-maintained LiteLLM pricing dataset and normalizes it
 * into the shape the site renders from.
 *
 * Run: npm run sync
 *
 * The dataset is the cheap part. What makes the output trustworthy is the
 * `counting` field below: we say out loud whether a model's token count is
 * exact (we run its real tokenizer) or estimated (no public tokenizer exists,
 * so we approximate and label it).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/** Providers we surface. Order drives nav order. */
const PROVIDERS = {
  openai: { name: 'OpenAI', brand: 'GPT', tokenizer: 'o200k_base', counting: 'exact' },
  anthropic: { name: 'Anthropic', brand: 'Claude', tokenizer: null, counting: 'estimated' },
  gemini: { name: 'Google', brand: 'Gemini', tokenizer: null, counting: 'estimated' },
  deepseek: { name: 'DeepSeek', brand: 'DeepSeek', tokenizer: null, counting: 'estimated' },
  mistral: { name: 'Mistral', brand: 'Mistral', tokenizer: null, counting: 'estimated' },
  xai: { name: 'xAI', brand: 'Grok', tokenizer: null, counting: 'estimated' },
  moonshot: { name: 'Moonshot', brand: 'Kimi', tokenizer: null, counting: 'estimated' },
  // LiteLLM files Cohere's chat models under `cohere_chat`, not `cohere`.
  cohere_chat: { name: 'Cohere', brand: 'Command', slug: 'cohere', tokenizer: null, counting: 'estimated' },
  perplexity: { name: 'Perplexity', brand: 'Sonar', tokenizer: null, counting: 'estimated' },
  ai21: { name: 'AI21', brand: 'Jamba', tokenizer: null, counting: 'estimated' },
  cerebras: { name: 'Cerebras', brand: 'Cerebras', tokenizer: null, counting: 'estimated' },
  groq: { name: 'Groq', brand: 'Groq', tokenizer: null, counting: 'estimated' },
};

/** Fine-tune and preview noise we never want on a pricing page. */
const EXCLUDE = /^ft:|(^|\/)(ft:|azure|openrouter)|:free$/i;

/** Models older than this many months get dropped from the default view. */
const PER_MILLION = 1_000_000;

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toPerMillion(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return Number((v * PER_MILLION).toFixed(4));
}

/**
 * Providers that charge more past a context threshold encode it in the field
 * name (`input_cost_per_token_above_200k_tokens`). Showing only the base rate
 * makes the site quietly wrong for long prompts — the exact failure a price
 * comparator cannot afford.
 */
function readTier(spec) {
  const key = Object.keys(spec).find((k) =>
    /^input_cost_per_token_above_(\d+)k_tokens$/.test(k)
  );
  if (!key) return null;
  const threshold = Number(/above_(\d+)k/.exec(key)[1]) * 1000;
  const suffix = `above_${threshold / 1000}k_tokens`;
  return {
    threshold,
    input: toPerMillion(spec[`input_cost_per_token_${suffix}`]),
    output: toPerMillion(spec[`output_cost_per_token_${suffix}`]),
    cachedInput: toPerMillion(spec[`cache_read_input_token_cost_${suffix}`]),
  };
}

async function loadRaw() {
  const cache = resolve(ROOT, '.cache-litellm.json');
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    writeFileSync(cache, text);
    return JSON.parse(text);
  } catch (err) {
    if (existsSync(cache)) {
      console.warn(`Fetch failed (${err.message}) — using cached copy.`);
      return JSON.parse(readFileSync(cache, 'utf8'));
    }
    throw err;
  }
}

const raw = await loadRaw();

const models = [];
const seenIds = new Set();
for (const [id, spec] of Object.entries(raw)) {
  if (id === 'sample_spec') continue;
  if (spec.mode !== 'chat') continue;

  const providerKey = spec.litellm_provider;
  const provider = PROVIDERS[providerKey];
  if (!provider) continue;
  if (EXCLUDE.test(id)) continue;

  // LiteLLM prefixes most non-OpenAI ids with the provider ("mistral/large").
  // Strip our own prefix; anything still nested is a reseller path — skip it.
  const bare = id.startsWith(`${providerKey}/`)
    ? id.slice(providerKey.length + 1)
    : id;
  if (bare.includes('/')) continue;

  // LiteLLM lists some models twice — bare and prefixed — at identical prices.
  const dedupeKey = `${providerKey}|${bare}`;
  if (seenIds.has(dedupeKey)) continue;
  seenIds.add(dedupeKey);

  const input = toPerMillion(spec.input_cost_per_token);
  const output = toPerMillion(spec.output_cost_per_token);
  if (input === null || output === null) continue;

  models.push({
    id,
    slug: slugify(bare),
    name: bare,
    provider: providerKey,
    providerName: provider.name,
    providerSlug: provider.slug ?? slugify(providerKey),
    brand: provider.brand ?? provider.name,
    tokenizer: provider.tokenizer,
    counting: provider.counting,
    input,
    output,
    cachedInput: toPerMillion(spec.cache_read_input_token_cost),
    // Anthropic bills writing to the cache separately, at two TTLs.
    cacheWrite: toPerMillion(spec.cache_creation_input_token_cost),
    cacheWrite1h: toPerMillion(spec.cache_creation_input_token_cost_above_1hr),
    // Long-context surcharge: several providers switch rate past a threshold.
    tier: readTier(spec),
    deprecatedOn: spec.deprecation_date ?? null,
    contextWindow: spec.max_input_tokens ?? spec.max_tokens ?? null,
    maxOutput: spec.max_output_tokens ?? null,
    vision: Boolean(spec.supports_vision),
    functionCalling: Boolean(spec.supports_function_calling),
    reasoning: Boolean(spec.supports_reasoning),
  });
}

models.sort((a, b) => a.input - b.input || a.id.localeCompare(b.id));

/**
 * Providers list both a moving alias and pinned snapshots of the same model
 * (`gpt-5-nano` and `gpt-5-nano-2025-08-07`) at identical rates. For a price
 * comparator the snapshot adds nothing but a duplicate page, so fold it into
 * the alias and keep the name for search.
 */
const SNAPSHOT = /^(.+?)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|\d{4})$/;
const canonical = new Map();
for (const m of models) canonical.set(`${m.provider}|${m.name}`, m);

const collapsed = [];
for (const m of models) {
  const match = SNAPSHOT.exec(m.name);
  if (match) {
    const base = canonical.get(`${m.provider}|${match[1]}`);
    if (
      base &&
      base.input === m.input &&
      base.output === m.output &&
      base.contextWindow === m.contextWindow
    ) {
      (base.snapshots ??= []).push(m.name);
      continue;
    }
  }
  collapsed.push(m);
}
models.length = 0;
models.push(...collapsed);

// Two providers can ship the same model name. Keep the plain slug for the
// first, qualify the rest, so every page has one canonical URL.
const takenSlugs = new Set();
for (const m of models) {
  if (takenSlugs.has(m.slug)) m.slug = `${m.provider}-${m.slug}`;
  takenSlugs.add(m.slug);
}

const providers = Object.entries(PROVIDERS)
  .map(([key, p]) => ({
    key,
    slug: p.slug ?? slugify(key),
    name: p.name,
    brand: p.brand ?? p.name,
    counting: p.counting,
    modelCount: models.filter((m) => m.provider === key).length,
  }))
  .filter((p) => p.modelCount > 0);

const today = new Date().toISOString().slice(0, 10);

const payload = {
  updatedAt: today,
  source: SOURCE,
  providers,
  models,
};

writeFileSync(
  resolve(ROOT, 'src/data/models.json'),
  JSON.stringify(payload, null, 2)
);

/**
 * Price history, one row per calendar month.
 *
 * `models.json` is a snapshot and every sync overwrites it, so without this
 * the record of what a model used to cost is gone the moment a provider cuts
 * a rate. That series cannot be backfilled from anywhere — LiteLLM publishes
 * current prices, not past ones — so it only exists if collection starts now.
 *
 * A re-run inside the same month replaces that month's row rather than adding
 * one, and each snapshot serialises to a single line, so a month of history
 * is a one-line diff instead of a few hundred.
 */
function recordHistory() {
  const path = resolve(ROOT, 'src/data/history.json');
  const history = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {
        unit: 'USD per million tokens',
        fields: ['input', 'cachedInput', 'output'],
        snapshots: [],
      };

  const prices = Object.fromEntries(
    models.map((m) => [m.slug, [m.input, m.cachedInput, m.output]])
  );
  const month = today.slice(0, 7);
  const row = { month, date: today, models: models.length, prices };

  const at = history.snapshots.findIndex((s) => s.month === month);
  if (at >= 0) history.snapshots[at] = row;
  else history.snapshots.push(row);
  history.snapshots.sort((a, b) => a.month.localeCompare(b.month));

  const body = history.snapshots.map((s) => `  ${JSON.stringify(s)}`).join(',\n');
  writeFileSync(
    path,
    `{\n  "unit": ${JSON.stringify(history.unit)},\n` +
      `  "fields": ${JSON.stringify(history.fields)},\n` +
      `  "snapshots": [\n${body}\n  ]\n}\n`
  );
  return history.snapshots;
}

const snapshots = recordHistory();

console.log(
  `Wrote ${models.length} models across ${providers.length} providers.`
);
for (const p of providers) console.log(`  ${p.name.padEnd(16)} ${p.modelCount}`);

const span =
  snapshots.length > 1
    ? `${snapshots[0].month} → ${snapshots[snapshots.length - 1].month}`
    : snapshots[0].month;
console.log(`History: ${snapshots.length} monthly snapshot(s), ${span}.`);
