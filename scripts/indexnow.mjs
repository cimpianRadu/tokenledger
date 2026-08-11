/**
 * Tells Bing the site changed, via IndexNow.
 *
 *   npm run indexnow            # every URL in the sitemap
 *   npm run indexnow -- --dry   # print what would be sent, send nothing
 *
 * Bing feeds Copilot and ChatGPT search, and IndexNow is the only way to reach
 * it in minutes rather than waiting for a crawl. Yandex, Seznam and Naver share
 * the protocol. Google ignores it — Search Console and the sitemap cover that.
 *
 * Submitting all 831 URLs is a launch move, not a weekly one. IndexNow is for
 * "this changed"; sending the whole site every sync trains the endpoint to
 * ignore you. Use it after a launch or a structural change.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, INDEXNOW_KEY } from '../site.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = new URL(SITE).host;
const dry = process.argv.includes('--dry');

/**
 * The key file is the proof of ownership. If it drifts from the constant the
 * endpoint answers 403 and the reason is invisible from the response, so check
 * it here where the message can say what actually went wrong.
 */
const keyFile = resolve(ROOT, `public/${INDEXNOW_KEY}.txt`);
if (!existsSync(keyFile)) {
  console.error(`✗ public/${INDEXNOW_KEY}.txt is missing — IndexNow proves`);
  console.error('  ownership by serving the key at that path. Create it first.');
  process.exit(1);
}
const onDisk = readFileSync(keyFile, 'utf8').trim();
if (onDisk !== INDEXNOW_KEY) {
  console.error(`✗ public/${INDEXNOW_KEY}.txt contains "${onDisk}",`);
  console.error(`  but INDEXNOW_KEY is "${INDEXNOW_KEY}". They must match.`);
  process.exit(1);
}

/** Read from the deployed sitemap rather than dist/, so a stale local build
 *  cannot submit URLs the live site does not serve. */
const sitemapIndex = await fetch(new URL('/sitemap-index.xml', SITE)).then((r) => {
  if (!r.ok) throw new Error(`sitemap-index.xml returned ${r.status}`);
  return r.text();
});

const shards = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urlList = [];
for (const shard of shards) {
  const xml = await fetch(shard).then((r) => r.text());
  urlList.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}

if (!urlList.length) {
  console.error('✗ Sitemap yielded no URLs — refusing to submit an empty list.');
  process.exit(1);
}

console.log(`${urlList.length} URLs from ${shards.length} sitemap shard(s).`);
console.log(`  first: ${urlList[0]}`);
console.log(`  last:  ${urlList[urlList.length - 1]}`);

if (dry) {
  console.log('\n--dry: nothing sent.');
  process.exit(0);
}

// The endpoint caps a submission at 10,000 URLs.
const CHUNK = 10_000;
for (let i = 0; i < urlList.length; i += CHUNK) {
  const batch = urlList.slice(i, i + CHUNK);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: new URL(`/${INDEXNOW_KEY}.txt`, SITE).href,
      urlList: batch,
    }),
  });
  const body = await res.text();

  // 200 accepted; 202 accepted with the key still being validated.
  if (res.status === 200 || res.status === 202) {
    console.log(`✓ ${batch.length} URLs submitted — HTTP ${res.status}${
      res.status === 202 ? ' (key validation pending)' : ''
    }`);
    continue;
  }

  /**
   * Report the endpoint's own errorCode rather than guessing from the status.
   * A 403 is `KeyNotFound` when the file is genuinely unreachable, but also
   * `SiteVerificationNotCompleted` while the key is merely still being
   * validated — the same status, opposite meanings, and only one of them is
   * worth debugging.
   */
  let code = '';
  try {
    code = JSON.parse(body).errorCode ?? '';
  } catch {
    /* not JSON; the raw body below is all there is */
  }

  if (code === 'SiteVerificationNotCompleted') {
    console.log(`⋯ Key accepted but not yet validated by the endpoint.`);
    console.log(`  Nothing is wrong: /${INDEXNOW_KEY}.txt is being fetched.`);
    console.log('  Re-run `npm run indexnow` in a few minutes.');
    process.exit(75); // EX_TEMPFAIL — retryable, not a misconfiguration
  }

  console.error(`✗ HTTP ${res.status}${code ? ` ${code}` : ''} ${body.slice(0, 200)}`);
  if (code === 'KeyNotFound')
    console.error(`  The key file was not reachable at ${new URL(`/${INDEXNOW_KEY}.txt`, SITE).href}`);
  process.exit(1);
}
