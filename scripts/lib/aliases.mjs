/**
 * One model, several published IDs.
 *
 * Providers ship a moving alias next to pinned copies of the same weights:
 * `gpt-5-nano` and `gpt-5-nano-2025-08-07`, `jamba-1.5-mini` and
 * `jamba-1.5-mini@001`, `gemini-2.5-flash` and `gemini-2.5-flash-preview-09-2025`.
 * For a price comparator the pinned copy adds a duplicate page and nothing else.
 *
 * `sync-pricing.mjs` folds them; `validate.mjs` fails the build if any survive.
 * Both import from here so the two can never disagree about what an alias is.
 */

/**
 * Suffixes that pin a release without naming a different model.
 *
 *   -2025-08-07 · -20250807 · -250807 · -0807   date snapshots
 *   @001                                        vendor version pin
 *   -preview-09-2025 · -preview-06-17           dated preview of a shipped model
 */
const PINS = [
  /^(.+?)-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|\d{4})$/,
  /^(.+?)@\d+$/,
  /^(.+?)-preview-\d{2}-\d{2,4}$/,
];

/**
 * Every name this one might be pinning, most likely first — the caller keeps
 * the first candidate that exists at the same rates.
 *
 * More than one because the patterns overlap: `gemini-2.5-flash-lite-preview-09-2025`
 * reads as a plain `-2025` date snapshot of `…-preview-09`, which no provider
 * ships, and as a dated preview of `gemini-2.5-flash-lite`, which is the real
 * one. Returning a single guess picked the wrong reading and left the duplicate
 * on the site.
 *
 * Deliberately not applied to `-latest`: for Mistral and xAI that suffix is the
 * primary published ID (`mistral-large-latest`, `grok-4-latest`), not an alias
 * of some other row, and it is what people paste into code and into search.
 */
export function pinnedFrom(name) {
  const seen = new Set();
  for (const pin of PINS) {
    const match = pin.exec(name);
    if (match && match[1] !== name) seen.add(match[1]);
  }
  return [...seen];
}
