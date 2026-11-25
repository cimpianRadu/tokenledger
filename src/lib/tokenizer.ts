/**
 * How far a family's token count drifts from OpenAI's.
 *
 * Only OpenAI publishes an encoder, so the browser runs `o200k_base` on the
 * text and every other family is that count times the ratio below — published
 * figures from each provider's own docs, not measurements of ours. A page that
 * shows one of these has to say so; `Provider.counting` is what decides that,
 * and it is derived from the same fact (a ratio of 1 means the real encoder
 * ran).
 *
 * Lives here rather than in `Ledger.tsx` because the token-counter pages state
 * the ratio in prose and in their FAQ. Two copies of a number the copy quotes
 * is exactly the drift the validator cannot catch.
 */
export const DRIFT: Record<string, number> = {
  openai: 1,
  anthropic: 1.15,
  gemini: 1.05,
  deepseek: 1.08,
  mistral: 1.1,
  xai: 1.06,
  cohere_chat: 1.09,
  moonshot: 1.08,
  perplexity: 1.05,
  ai21: 1.1,
  cerebras: 1.08,
  groq: 1.08,
};

/** The fallback in `Ledger`, for a provider that appears upstream before it
 *  appears here. Stated once so the pages and the island agree. */
export const DEFAULT_DRIFT = 1.1;

export function driftFor(providerKey: string): number {
  return DRIFT[providerKey] ?? DEFAULT_DRIFT;
}

/**
 * A fixed paragraph of ordinary English prose, encoded at build time to get a
 * tokens-per-word figure that is measured rather than repeated from a blog
 * post. Prose, not code or JSON — both tokenize far denser, and quoting a
 * ratio measured on one to a reader who will paste the other is a wrong
 * number dressed as a fact.
 *
 * Frozen: changing it moves every ratio on the site, so it is a deliberate
 * edit, not incidental copy.
 */
export const REFERENCE_TEXT =
  'A token is the unit a language model bills you in. It is not a word and ' +
  'not a character: common words are usually a single token, rarer words ' +
  'split into several pieces, and punctuation and spaces are counted too. ' +
  'That is why two prompts of the same length in words can cost different ' +
  'amounts, and why counting the tokens is the only way to know what a ' +
  'request will be charged.';
