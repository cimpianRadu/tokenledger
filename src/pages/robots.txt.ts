import type { APIRoute } from 'astro';
import { SITE } from '../../site.config.mjs';

/**
 * Generated rather than static, so the sitemap URL cannot drift away from the
 * configured domain — the copy in `public/robots.txt` was a second place the
 * production hostname had to be remembered.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap-index.xml', site ?? SITE).href}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
