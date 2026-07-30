import data from '../data/models.json';

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
 * Dated snapshots like `claude-3-haiku-20240307` price the same as their alias
 * and would triple the comparison surface for no benefit.
 */
const DATED = /-(\d{4}-?\d{2}-?\d{2}|\d{4})$/;

/**
 * Rough version number pulled out of a model name: `claude-opus-4-6` → 4.6,
 * `claude-opus-5` → 5, `gpt-5.6` → 5.6. Used only to break ties between models
 * that share a context window, so the current flagship wins over last
 * quarter's — the alternative is an arbitrary alphabetical pick that leaves
 * Opus 5 out while keeping Opus 4.6.
 */
function versionOf(name: string): number {
  const nums = name.match(/\d+(?:\.\d+)?/g);
  if (!nums) return 0;
  const major = parseFloat(nums[0]);
  const minor = nums.length > 1 ? parseFloat(nums[1]) : 0;
  return major + Math.min(minor, 99) / 100;
}

/**
 * Capability variants and pre-release builds. They price the same as the model
 * they branch from and nobody searches "x-customtools vs y" — generating those
 * comparisons spends crawl budget on pages that cannot rank.
 */
const VARIANT =
  /(customtools|non-reasoning|-beta\b|-preview-\d|live-preview|native-audio|computer-use|robotics|-multi-agent|audio-preview|search-preview|-fast-latest|image-preview|@)/;

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

