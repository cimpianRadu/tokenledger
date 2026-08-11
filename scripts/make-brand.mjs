/**
 * Renders every raster brand asset from one set of outlines:
 * `public/og.png`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png`.
 *
 *   npm run brand
 *
 * The mark is real Instrument Serif, so it cannot ship as an SVG favicon —
 * browsers do not load webfonts for icons, and hand-tracing a high-contrast
 * serif would drift from the wordmark it has to match. Rendering to PNG here
 * keeps one source of truth for both.
 *
 * Counts and the domain come from the dataset and `site.config.mjs`, so a
 * re-sync or a rename regenerates a correct card instead of a stale one.
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
  { file: 'instrumentserif.ttf', query: 'Instrument+Serif' },
  { file: 'instrumentserif-italic.ttf', query: 'Instrument+Serif:ital@1' },
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
      const css = await fetch(`https://fonts.googleapis.com/css2?family=${query}`, {
        headers: { 'User-Agent': LEGACY_UA },
      }).then((r) => r.text());
      const url = css.match(/https:\/\/[^)]*\.ttf/)?.[0];
      if (!url) throw new Error(`No TTF in the Google Fonts CSS for ${query}`);
      await writeFile(path, Buffer.from(await fetch(url).then((r) => r.arrayBuffer())));
      console.log(`  fetched ${file}`);
      return path;
    })
  );
}

const PAPER = '#f7f3ea';
const INK = '#191612';
const SOFT = '#6b6459';
const FAINT = '#8a8172';
const RULE = '#e6ded0';
const ACCENT = '#d4452c';
const CHEAP = '#2f6b47';
const MID = '#a8791f';
const DEAR = '#a8152f';
const SER = 'font-family="Instrument Serif"';
const ITA = 'font-family="Instrument Serif" font-style="italic"';

/**
 * The solidus lockup. `per` rides the bar where there is room for it and is
 * dropped where there is not — the same mark, optically simplified, not a
 * second logo.
 */
function solidus({
  cx, cy, size, top = 'P', bot = 'T', per = true,
  ink = INK, rule = ACCENT, spread = 0.46, rise = 1.42, ext = 1,
  weight = 0.028, perSize = null,
}) {
  const ps = perSize ?? size * 0.235;
  const lw = size * weight;
  const dx = size * 0.42 * ext;
  const dy = -size * 0.42 * rise * ext;
  const x1 = cx - dx, y1 = cy - dy;
  const x2 = cx + dx, y2 = cy + dy;
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const perText = per
    ? `<text x="${cx}" y="${cy - ps * 0.42}" font-size="${ps}" text-anchor="middle" ${ITA}
         fill="${ink}" transform="rotate(${ang} ${cx} ${cy})">per</text>`
    : '';
  return `
    <text x="${cx - size * spread}" y="${cy - size * 0.1}" font-size="${size}"
      text-anchor="middle" ${SER} fill="${ink}">${top}</text>
    <text x="${cx + size * spread}" y="${cy + size * 0.72}" font-size="${size}"
      text-anchor="middle" ${SER} fill="${ink}">${bot}</text>
    <path d="M${x1} ${y1}L${x2} ${y2}" stroke="${rule}" stroke-width="${lw}"
      stroke-linecap="round"/>
    ${perText}`;
}

/** Red field, mark knocked out — the only version that holds at 16 px, because
 *  a light serif on pale stock loses its thin strokes entirely. */
function icon(round = 0.16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <rect width="64" height="64" rx="${64 * round}" fill="${ACCENT}"/>
    ${solidus({ cx: 32, cy: 30, size: 34, per: false, ink: PAPER, rule: PAPER, weight: 0.1 })}
  </svg>`;
}

function card({ models, providers }) {
  const host = new URL(SITE).host;
  const ladder = [
    { w: 62, fill: CHEAP }, { w: 112, fill: CHEAP }, { w: 172, fill: MID },
    { w: 238, fill: DEAR }, { w: 300, fill: ACCENT },
  ]
    .map((b, i) =>
      `<rect x="820" y="${196 + i * 30}" width="${b.w}" height="13" rx="2" fill="${b.fill}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${PAPER}"/>
    ${[150, 224, 298, 372, 446].map((y) => `<path d="M80 ${y}h1040" stroke="${RULE}"/>`).join('')}
    <text x="80" y="92" ${SER} font-size="27" letter-spacing="1.4" fill="${FAINT}">${host}</text>
    ${solidus({ cx: 372, cy: 268, size: 116, top: 'price', bot: 'token',
      spread: 1.06, ext: 1.55, perSize: 34 })}
    ${ladder}
    <text x="80" y="516" font-family="Public Sans" font-size="30" fill="${SOFT}">Count the tokens in a prompt, then compare the price</text>
    <text x="80" y="556" font-family="Public Sans" font-size="30" fill="${SOFT}">across ${models} models from ${providers} providers.</text>
  </svg>`;
}

const data = JSON.parse(await readFile(join(root, 'src/data/models.json'), 'utf8'));
const fontFiles = await fetchFonts();

const render = (svg, width) =>
  new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: false },
  })
    .render()
    .asPng();

console.log('Rendering brand assets…');
for (const [out, svg, width] of [
  ['public/og.png', card({ models: data.models.length, providers: data.providers.length }), 1200],
  ['public/favicon-32.png', icon(), 32],
  ['public/favicon-16.png', icon(), 16],
  ['public/apple-touch-icon.png', icon(0.22), 180],
]) {
  await writeFile(join(root, out), render(svg, width));
  console.log(`  ${out}`);
}
