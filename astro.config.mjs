import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Change this before deploying — it drives canonical URLs and the sitemap.
export const SITE = 'https://tokenledger.dev';

export default defineConfig({
  site: SITE,
  integrations: [react(), sitemap()],
  build: { inlineStylesheets: 'auto' },
});
