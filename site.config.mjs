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
export const EMAIL = 'hello@pricepertoken.ai';

/**
 * Named as the data controller on the privacy page. Legal-entity names are not
 * translated, so the Romanian form stays as it is on the registration.
 */
export const OPERATOR = 'Radu Gheorghe Cimpian PFA';

/**
 * Which analytics the site ships, or `null` for none.
 *
 * `Base.astro` emits the script from this and `privacy.astro` describes it
 * from the same value, so the policy page cannot claim analytics the build
 * does not ship — or stay silent about analytics it does.
 *
 * Vercel rather than Google Analytics on purpose: GA4 sets `_ga` cookies,
 * which would both falsify this site's "no cookies" claim and require a
 * consent banner in the EU. Vercel's is cookieless and served from this
 * origin, so neither applies.
 */
export const ANALYTICS = 'vercel';
