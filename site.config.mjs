/**
 * Everything that changes when this site moves to a real domain and a real
 * mailbox. One file, so going live is one edit rather than five — the previous
 * arrangement had the domain hardcoded in the Astro config, a fallback in the
 * layout, and again in a static robots.txt, which could drift apart silently.
 *
 * Imported by `astro.config.mjs`, so it stays plain ESM.
 */

/** Drives canonical URLs, the sitemap, robots.txt and OG image URLs. */
export const SITE = 'https://pricepertoken.ai';

/** Shown on the contact page. Affiliate programmes verify this address. */
export const EMAIL = 'hello@example.com';

/** Named as the data controller on the privacy page. */
export const OPERATOR = 'the site operator';
