/**
 * Model taxonomy shared between the build-time pages and the React island.
 *
 * Deliberately data-free. The island needs `tierOf` to group its <select>
 * options, and importing it from `models.ts` would pull `models.json` into the
 * client bundle — on top of the same 249 models Astro already serialises into
 * the island's props.
 */

/** The fields the taxonomy actually reads. Keeps this module free of a type
 *  import from `models.ts`, which owns the full `Model` shape. */
export interface Classifiable {
  name: string;
  contextWindow: number | null;
  deprecatedOn: string | null;
}

/**
 * Dated snapshots like `claude-3-haiku-20240307` price the same as their alias
 * and would triple the comparison surface for no benefit.
 */
export const DATED = /-(\d{4}-?\d{2}-?\d{2}|\d{4})$/;

/**
 * Capability variants and pre-release builds. They price the same as the model
 * they branch from and nobody searches "x-customtools vs y" — generating those
 * comparisons spends crawl budget on pages that cannot rank.
 */
export const VARIANT =
  /(customtools|non-reasoning|-beta\b|-preview-\d|live-preview|native-audio|computer-use|robotics|-multi-agent|audio-preview|search-preview|-fast-latest|image-preview|@)/;

/**
 * Rough version number pulled out of a model name: `claude-opus-4-6` → 4.6,
 * `claude-opus-5` → 5, `gpt-5.6` → 5.6. Used only to break ties between models
 * that share a context window, so the current flagship wins over last
 * quarter's — the alternative is an arbitrary alphabetical pick that leaves
 * Opus 5 out while keeping Opus 4.6.
 */
export function versionOf(name: string): number {
  const nums = name.match(/\d+(?:\.\d+)?/g);
  if (!nums) return 0;
  const major = parseFloat(nums[0]);
  const minor = nums.length > 1 ? parseFloat(nums[1]) : 0;
  return major + Math.min(minor, 99) / 100;
}

export type Tier = 'current' | 'legacy' | 'deprecated';

/**
 * Three buckets, in the order a reader wants them offered. `current` is what
 * someone pricing a new integration is choosing between; everything else is
 * there so an existing bill can still be explained.
 */
export function tierOf(m: Classifiable): Tier {
  if (m.deprecatedOn) return 'deprecated';
  const modern =
    !DATED.test(m.name) &&
    !VARIANT.test(m.name) &&
    (m.contextWindow ?? 0) >= 100_000;
  return modern ? 'current' : 'legacy';
}

export const TIER_LABEL: Record<Tier, string> = {
  current: 'Current',
  legacy: 'Older and variants',
  deprecated: 'Deprecated',
};

/**
 * Newest-looking first. Context window is the best recency proxy the dataset
 * gives us — new generations ship 1M windows, old ones sit at 200K — with the
 * version number breaking ties inside a generation.
 */
export function byRecency(a: Classifiable, b: Classifiable): number {
  return (
    (b.contextWindow ?? 0) - (a.contextWindow ?? 0) ||
    versionOf(b.name) - versionOf(a.name) ||
    a.name.localeCompare(b.name)
  );
}
