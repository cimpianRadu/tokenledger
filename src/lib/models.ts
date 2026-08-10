import data from '../data/models.json';
import { DATED, VARIANT, versionOf } from './families';
import { rampColor } from './ramp';

export { tierOf, TIER_LABEL, byRecency } from './families';
export type { Tier } from './families';

export type Counting = 'exact' | 'estimated';

export interface Model {
  id: string;
  slug: string;
  name: string;
  provider: string;
  providerName: string;
  providerSlug: string;
  /** Search-facing model brand — people query "claude api pricing", not "anthropic". */
  brand: string;
  tokenizer: string | null;
  counting: Counting;
  /** USD per million tokens. */
  input: number;
  output: number;
  cachedInput: number | null;
  cacheWrite: number | null;
  cacheWrite1h: number | null;
  /** Long-context surcharge past `threshold` tokens, if the provider has one. */
  tier: {
    threshold: number;
    input: number | null;
    output: number | null;
    cachedInput: number | null;
  } | null;
  deprecatedOn: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  vision: boolean;
  functionCalling: boolean;
  reasoning: boolean;
  /** Pinned dated versions folded into this alias. */
  snapshots?: string[];
}

export interface Provider {
  key: string;
  slug: string;
  name: string;
  brand: string;
  counting: Counting;
  modelCount: number;
}

export const updatedAt: string = data.updatedAt;
export const sourceUrl: string = data.source;
export const models: Model[] = data.models as Model[];
export const providers: Provider[] = data.providers as Provider[];

export const bySlug = new Map(models.map((m) => [m.slug, m]));

export function modelsFor(providerKey: string): Model[] {
  return models.filter((m) => m.provider === providerKey);
}

export function providerBySlug(slug: string): Provider | undefined {
  return providers.find((p) => p.slug === slug);
}

/**
 * Reading order for the provider grid. The dataset arrives in LiteLLM's own
 * order, which is neither alphabetical nor meaningful — following it put
 * Command first and Claude twelfth, burying the two brands the site ranks for.
 */
const PROVIDER_RANK = [
  'openai',
  'anthropic',
  'gemini',
  'xai',
  'deepseek',
  'moonshot',
  'mistral',
  'perplexity',
  'groq',
  'cerebras',
  'cohere_chat',
  'ai21',
];

export const orderedProviders: Provider[] = [...providers].sort((a, b) => {
  const ra = PROVIDER_RANK.indexOf(a.key);
  const rb = PROVIDER_RANK.indexOf(b.key);
  return (
    (ra === -1 ? PROVIDER_RANK.length : ra) -
      (rb === -1 ? PROVIDER_RANK.length : rb) || a.brand.localeCompare(b.brand)
  );
});

/** Providers switched on when the page first loads. Enough to make the ranking
 *  meaningful without pricing twelve rows nobody asked for. */
export const DEFAULT_ACTIVE = ['openai', 'anthropic', 'gemini', 'deepseek'];

/**
 * Widest context wins; inside a generation the dearer model is the flagship.
 *
 * Version digits are the wrong tiebreak here — `versionOf` reads
 * `ministral-8b-latest` as version 8 and `mistral-large-latest`, which carries
 * no digits at all, as version 0, so the 8B model would represent Mistral.
 */
function flagshipFirst(a: Model, b: Model): number {
  return (
    (b.contextWindow ?? 0) - (a.contextWindow ?? 0) ||
    b.input - a.input ||
    a.name.localeCompare(b.name)
  );
}

/**
 * The model a provider card lands on before anyone touches the select.
 *
 * A four-digit run in a model name is a date or a parameter count, never a
 * version — excluding it keeps `grok-4-20-0309-reasoning` from being the face
 * of Grok. Each filter falls back to the next if it empties the pool, so a
 * provider that only ships dated builds still gets a default.
 */
export function defaultModelFor(providerKey: string): Model | undefined {
  const pool = modelsFor(providerKey);
  const tiers = [
    pool.filter(
      (m) =>
        !m.deprecatedOn &&
        !DATED.test(m.name) &&
        !VARIANT.test(m.name) &&
        !/\d{4}/.test(m.name) &&
        (m.contextWindow ?? 0) >= 100_000
    ),
    pool.filter((m) => !m.deprecatedOn),
    pool,
  ];
  return tiers.find((t) => t.length)?.slice().sort(flagshipFirst)[0];
}

/**
 * The subset we build /compare/ pages for. Full cross-product of ~300 models is
 * ~44k pages of near-duplicate content — exactly what thin-content penalties
 * are for.
 *
 * Ranking here is deliberately NOT by price. Legacy flagships stay listed at
 * their old rates long after they are superseded (Claude Opus 4.1 is still
 * $15/$75 while Opus 5 is $5/$25), so "most expensive" reliably surfaces the
 * models nobody is choosing between. Context window is the best recency proxy
 * the dataset gives us: new generations ship 1M windows, old ones sit at 200K.
 */
export function notableModels(perProvider = 6): Model[] {
  const out: Model[] = [];
  for (const p of providers) {
    const picks = modelsFor(p.key)
      .filter((m) => !DATED.test(m.name))
      .filter((m) => !VARIANT.test(m.name))
      .filter((m) => (m.contextWindow ?? 0) >= 100_000)
      .sort(
        (a, b) =>
          (b.contextWindow ?? 0) - (a.contextWindow ?? 0) ||
          versionOf(b.name) - versionOf(a.name) ||
          b.input - a.input
      )
      .slice(0, perProvider);
    out.push(...picks);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Deterministic pair key so /compare/a-vs-b has exactly one canonical URL. */
export function pairSlug(a: Model, b: Model): string {
  return [a.slug, b.slug].sort().join('-vs-');
}

export function formatPrice(v: number | null): string {
  if (v === null) return '—';
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(3).replace(/0$/, '')}`;
}

export function formatContext(v: number | null): string {
  if (!v) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')}M`;
  return `${Math.round(v / 1000)}K`;
}

/** The cheap→dear colour for a price, ready to drop into a `color:` rule. */
export function costColor(value: number): string {
  return rampColor(costRatio(value));
}

/** Position on the cheap→dear scale, log-spaced because prices span 3 orders. */
export function costRatio(value: number): number {
  const prices = models.map((m) => m.input).filter((v) => v > 0);
  const lo = Math.log(Math.min(...prices));
  const hi = Math.log(Math.max(...prices));
  return Math.min(1, Math.max(0, (Math.log(value) - lo) / (hi - lo)));
}

/**
 * Compose a title that keeps the search phrase intact.
 *
 * Google shows roughly 60 characters and cuts the tail, so `core` — the words
 * someone actually typed — always leads, and the extras are appended only
 * while they fit. Some model names are 45 characters on their own; those pages
 * get the bare phrase rather than a truncated sales line.
 */
/** Google shows ~155 chars of a description; anything past that is dead weight. */
export function seoDescription(text: string, limit = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '));
  return (stop > limit * 0.6 ? cut.slice(0, stop) : cut.trimEnd()) + '…';
}

export function seoTitle(core: string, ...extras: string[]): string {
  const LIMIT = 60;
  let out = core;
  for (const extra of extras) {
    if (!extra) continue;
    const candidate = `${out} — ${extra}`;
    if (candidate.length > LIMIT) break;
    out = candidate;
  }
  return out;
}

