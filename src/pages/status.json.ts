import type { APIRoute } from 'astro';
import { models, providers, updatedAt } from '../lib/models';
import benchmarks from '../data/benchmarks.json';

/**
 * Machine-readable state of the deployed site.
 *
 * The automation needs one question answered without parsing a page: how old
 * are the prices the live site is serving? Uptime and page counts can be read
 * with curl, but the sync date was only ever rendered inside prose, so a stuck
 * cron would have depended on a human noticing a date in a footer.
 *
 * Only dates are published, never an age in days: this file is static once
 * built, so a computed age would freeze at build time and read as fresh
 * forever — exactly the failure it exists to catch. `builtAt` is here for the
 * same reason, since prices synced yesterday mean nothing if the deploy that
 * carried them never happened. `scripts/healthcheck.mjs` does the arithmetic
 * against the clock of the day it runs.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        updatedAt,
        models: models.length,
        providers: providers.length,
        benchmarks: {
          updatedAt: benchmarks.updatedAt,
          scored: Object.keys(benchmarks.models ?? {}).length,
        },
        builtAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n',
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
