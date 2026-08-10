import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

import { SITE } from './site.config.mjs';

export { SITE };

export default defineConfig({
  site: SITE,
  integrations: [react(), sitemap()],
  build: { inlineStylesheets: 'auto' },
});
