/**
 * Renders `public/og.png` — the 1200×630 card that link previews show.
 *
 * Scripted rather than hand-exported for the same reason pricing is: the
 * numbers on it go stale. It reads the brand from `site.config.mjs` and the
 * counts from the synced dataset, so a rename or a re-sync is one command
 * away from a correct card instead of a forgotten one.
 *
 *   node scripts/make-og.mjs
 *
 * Text is rendered by resvg against the real webfonts, downloaded once into
 * `.cache-fonts/`. The system font stack cannot be trusted here — cairo and
 * friends silently fall back to Helvetica, which is not the brand.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { SITE } from '../site.config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(root, '.cache-fonts');

/** Google serves TTF instead of woff2 to a user agent old enough to need it. */
const LEGACY_UA = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8)';

const FONTS = [
  { file: 'bricolage-800.ttf', query: 'Bricolage+Grotesque:wght@800' },
  { file: 'publicsans-400.ttf', query: 'Public+Sans:wght@400' },
];

async function fetchFonts() {
  await mkdir(FONT_DIR, { recursive: true });
  return Promise.all(
    FONTS.map(async ({ file, query }) => {
      const path = join(FONT_DIR, file);
      try {
        await access(path);
        return path;
      } catch {
        /* not cached yet */
      }
      const css = await fetch(
        `https://fonts.googleapis.com/css2?family=${query}`,
        { headers: { 'User-Agent': LEGACY_UA } }
      ).then((r) => r.text());
      const url = css.match(/https:\/\/[^)]*\.ttf/)?.[0];
      if (!url) throw new Error(`No TTF in the Google Fonts CSS for ${query}`);
      const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
      await writeFile(path, buf);
      console.log(`  fetched ${file}`);
      return path;
    })
  );
}

/** `<` and `&` in a headline would otherwise close the SVG early. */
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card({ models, providers }) {
  const paper = '#eef1f4';
  const ink = '#14181d';
  const soft = '#4d5866';
  const rule = '#dfe4ea';
  const accent = '#2b4fd8';

  // The cost ladder, cheap to dear — the same scale the site ranks with.
  const bars = [
    { w: 152, fill: '#0f766e' },
    { w: 262, fill: '#0f766e' },
    { w: 422, fill: '#2b4fd8' },
    { w: 602, fill: '#2b4fd8' },
    { w: 762, fill: '#b0184b' },
  ];

  const ledgerLines = [140, 214, 288, 362, 436, 510, 584]
    .map((y) => `<path d="M80 ${y}h1040" stroke="${rule}" stroke-width="1"/>`)
    .join('');

  const ladder = bars
    .map(
      (b, i) =>
        `<rect x="80" y="${478 + i * 26}" width="${b.w}" height="14" rx="2" fill="${b.fill}"/>`
    )
    .join('');

  // The brand mark, at 1.5× the 24px grid it was drawn on.
  const mark = `
    <g transform="translate(80 76) scale(1.5)">
      <g fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v10.6"/>
        <path d="M15 6.1c-.7-1-1.9-1.5-3.2-1.4-1.5.1-2.6.8-2.6 1.9 0 1.2 1.1 1.7 2.8 2 1.8.3 3.1.8 3.1 2.1 0 1.2-1.3 2-2.9 2-1.4 0-2.6-.5-3.2-1.5"/>
        <path stroke="${accent}" d="M2.6 15.4h18.8"/>
      </g>
      <g fill="${ink}">
        <rect x="2.6" y="17.8" width="6.2" height="3.6" rx="1.2"/>
        <rect x="10.2" y="17.8" width="4.2" height="3.6" rx="1.2"/>
        <rect x="15.8" y="17.8" width="5.6" height="3.6" rx="1.2"/>
      </g>
    </g>`;

  const host = new URL(SITE).host;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${paper}"/>
  ${ledgerLines}
  ${mark}
  <text x="136" y="107" font-family="Bricolage Grotesque" font-weight="800" font-size="26" letter-spacing="1.6" fill="${accent}">${esc(host.toUpperCase())}</text>
  <text x="80" y="222" font-family="Bricolage Grotesque" font-weight="800" font-size="80" letter-spacing="-2" fill="${ink}">What does this</text>
  <text x="80" y="306" font-family="Bricolage Grotesque" font-weight="800" font-size="80" letter-spacing="-2" fill="${ink}">prompt actually cost?</text>
  <text x="80" y="392" font-family="Public Sans" font-size="31" fill="${soft}">Count the tokens in a prompt, then compare the price</text>
  <text x="80" y="434" font-family="Public Sans" font-size="31" fill="${soft}">across ${models} models from ${providers} providers.</text>
  ${ladder}
</svg>`;
}

const data = JSON.parse(
  await readFile(join(root, 'src/data/models.json'), 'utf8')
);

console.log('Rendering og.png…');
const fontFiles = await fetchFonts();
const svg = card({
  models: data.models.length,
  providers: data.providers.length,
});

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { fontFiles, loadSystemFonts: false },
})
  .render()
  .asPng();

const out = join(root, 'public/og.png');
await writeFile(out, png);
console.log(`  wrote public/og.png — ${data.models.length} models, ${new URL(SITE).host}`);
