/**
 * Is the deployed site alive, complete and serving fresh prices?
 *
 *   npm run health                     # against SITE from site.config.mjs
 *   npm run health -- --json           # machine-readable, for the routine
 *   npm run health -- --url http://localhost:4321
 *
 * This is the canary that runs without anybody watching. `validate.mjs` checks
 * the data and the build output on the machine that builds; this checks what
 * the world actually gets, which is a different question — a build can be
 * perfect and the deploy can be three weeks old.
 *
 * Exit 1 on any failure, so a scheduled run that fails sends the usual "your
 * workflow failed" mail without needing a mail service of its own.
 *
 * Deliberately few checks, each one a thing that has a different cause:
 *   - a fixed set of pages, one per route family, must answer 200
 *   - a nonsense path must answer 404, because a catch-all that returns 200
 *     is invisible to every other check and poisons the index
 *   - /status.json must parse, and its prices must be younger than the 30 days
 *     at which validate.mjs hard-fails
 *   - the deploy itself must be recent, since fresh prices in git mean nothing
 *     if the build that carried them never shipped
 *   - the sitemap must still list the whole site, which is how a route that
 *     stopped generating shows up
 */
import { SITE } from '../site.config.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const BASE = (arg('--url') ?? SITE).replace(/\/$/, '');
const asJson = process.argv.includes('--json');

/** Prices older than this fail the build in validate.mjs; same line here. */
const PRICE_FAIL_DAYS = 30;
const PRICE_WARN_DAYS = 14;
/** The weekly sync deploys every Monday; twice that is a stuck pipeline. */
const DEPLOY_WARN_DAYS = 15;
/** 856 pages today. A floor well under it catches a route that vanished. */
const SITEMAP_FLOOR = 700;

const results = [];
const pass = (name, detail = '') => results.push({ name, status: 'pass', detail });
const warn = (name, detail) => results.push({ name, status: 'warn', detail });
const fail = (name, detail) => results.push({ name, status: 'fail', detail });

const DAY = 86_400_000;
const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / DAY);

async function get(path, { method = 'GET' } = {}) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(20_000) });
    return { ok: res.ok, status: res.status, res };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/* One page per route family. Each failure points at a different generator. */
const PAGES = [
  '/',
  '/cheapest',
  '/token-counter/',
  '/token-counter/openai/',
  '/pricing/anthropic',
  '/models',
  '/compare/',
  '/methodology',
  '/robots.txt',
  '/sitemap-index.xml',
];

for (const path of PAGES) {
  const { ok, status, error } = await get(path);
  if (ok) pass(`GET ${path}`, String(status));
  else fail(`GET ${path}`, error ?? `HTTP ${status}`);
}

/* A catch-all that answers 200 everywhere would make every check above pass. */
{
  const { status } = await get('/this-page-does-not-exist-9f3a');
  if (status === 404) pass('404 on an unknown path');
  else fail('404 on an unknown path', `got HTTP ${status}`);
}

/* Freshness, the whole reason the site exists. */
let status = null;
{
  const { ok, res, status: code, error } = await get('/status.json');
  if (!ok) {
    fail('/status.json', error ?? `HTTP ${code}`);
  } else {
    try {
      status = await res.json();
      const age = daysSince(status.updatedAt);
      const line = `synced ${status.updatedAt} (${age}d), ${status.models} models, ${status.providers} providers`;
      if (age > PRICE_FAIL_DAYS) fail('price freshness', `${line} — the sync is dead`);
      else if (age > PRICE_WARN_DAYS) warn('price freshness', line);
      else pass('price freshness', line);

      const deployAge = daysSince(status.builtAt);
      if (deployAge > DEPLOY_WARN_DAYS)
        warn('deploy age', `last build ${status.builtAt} (${deployAge}d)`);
      else pass('deploy age', `${deployAge}d`);

      if (!status.models || status.providers < 10)
        fail('catalogue size', `${status.models} models, ${status.providers} providers`);
      else pass('catalogue size', `${status.models}/${status.providers}`);
    } catch (err) {
      fail('/status.json', `unparseable: ${err.message}`);
    }
  }
}

/* The sitemap is what Google reads; a route that stopped generating shows here
 * long before it shows in traffic. Also gives us live URLs to spot-check. */
let urls = [];
{
  const { ok, res, status: code, error } = await get('/sitemap-index.xml');
  if (!ok) {
    fail('sitemap', error ?? `HTTP ${code}`);
  } else {
    const index = await res.text();
    const shards = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const shard of shards) {
      const xml = await fetch(shard).then((r) => r.text()).catch(() => '');
      urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    }
    if (urls.length < SITEMAP_FLOOR)
      fail('sitemap size', `${urls.length} URLs, expected at least ${SITEMAP_FLOOR}`);
    else pass('sitemap size', `${urls.length} URLs`);

    for (const family of ['/models/', '/compare/', '/token-counter/']) {
      const sample = urls.filter((u) => u.includes(family));
      if (!sample.length) {
        fail(`sitemap has ${family}`, 'no URLs in this family');
        continue;
      }
      const pick = sample[Math.floor(Math.random() * sample.length)];
      const { ok: alive, status: code2 } = await get(
        new URL(pick).pathname,
        { method: 'HEAD' }
      );
      if (alive) pass(`sample ${family}`, new URL(pick).pathname);
      else fail(`sample ${family}`, `${pick} → HTTP ${code2}`);
    }
  }
}

const failed = results.filter((r) => r.status === 'fail');
const warned = results.filter((r) => r.status === 'warn');

if (asJson) {
  console.log(
    JSON.stringify(
      {
        site: BASE,
        checkedAt: new Date().toISOString(),
        passed: results.length - failed.length - warned.length,
        warned: warned.length,
        failed: failed.length,
        status,
        sitemapUrls: urls.length,
        results,
      },
      null,
      2
    )
  );
} else {
  console.log(`\n${BASE}\n`);
  for (const r of results) {
    const mark = r.status === 'pass' ? '  ok  ' : r.status === 'warn' ? ' warn ' : ' FAIL ';
    console.log(`${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(
    `\n${failed.length ? '✗' : '✓'} ${results.length - failed.length - warned.length} passed, ` +
      `${warned.length} warning(s), ${failed.length} error(s).`
  );
}

process.exit(failed.length ? 1 : 0);
