import data from '../data/benchmarks.json';
import type { Model } from './models';

/**
 * Independent capability measurements, keyed by our model slug.
 *
 * The file ships empty and `scripts/sync-benchmarks.mjs` fills it. Every
 * consumer here has to survive that empty state, because a build without an
 * API key is the normal case for anyone cloning the repo — the section simply
 * does not render rather than the page breaking.
 */
export interface Benchmark {
  aaSlug: string | null;
  via: 'auto' | 'alias';
  /** Pass rates in percent — share of each test set answered correctly. */
  ifbench: number | null;
  gpqa: number | null;
  livecodebench: number | null;
  tau2: number | null;
  /** Carried by the sync for reference; deliberately never rendered. */
  intelligenceIndex: number | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
}

const models = data.models as Record<string, Benchmark>;

export const benchmarkUpdatedAt: string | null = data.updatedAt;
export const benchmarkSource: string = data.source;
export const benchmarkAttribution: string = data.attribution;
export const hasBenchmarks: boolean = Object.keys(models).length > 0;

export function benchmarkFor(slug: string): Benchmark | undefined {
  return models[slug];
}

/**
 * The three questions people actually arrive with, each tied to the measure
 * that answers it.
 *
 * Deliberately not one score. A single "intelligence" number hides the case
 * this whole feature exists for: a model that is two points behind overall but
 * twenty behind on coding is a fine choice for extraction and a bad one for an
 * agent. `blurb` is what the reader is choosing between, not what the
 * benchmark measures — nobody has an "MMLU-Pro task".
 */
export const LENSES = [
  {
    key: 'ifbench' as const,
    label: 'Following instructions',
    blurb: 'extraction, classification, sticking to a format',
    source: 'IFBench',
  },
  {
    key: 'livecodebench' as const,
    label: 'Coding',
    blurb: 'writing and fixing code',
    source: 'LiveCodeBench',
  },
  {
    key: 'tau2' as const,
    label: 'Tool use',
    blurb: 'multi-step agent work against real tools',
    source: 'τ²-bench',
  },
  {
    key: 'gpqa' as const,
    label: 'Hard reasoning',
    blurb: 'graduate-level science and multi-step analysis',
    source: 'GPQA Diamond',
  },
];

export type LensKey = (typeof LENSES)[number]['key'];

/**
 * Input-weighted blend, 3:1. Matches the ratio Artificial Analysis blends its
 * own price at, so our figure and theirs stay comparable, and it is closer to
 * a real workload than either rate alone — most production traffic reads far
 * more than it writes.
 */
export function blendedPrice(m: Model): number {
  return (m.input * 3 + m.output) / 4;
}

/**
 * How far apart two scores have to be before we call it a real difference —
 * expressed in standard deviations of the benchmark, not in raw points.
 *
 * Raw points cannot work across benchmarks. Each test spreads its field
 * differently, so five points apart on a bunched-up test is a wider gap than
 * five on one that fans out, and picking "the lens they differ on most" by raw
 * gap would just pick whichever test happens to spread widest. `spread` is
 * measured at sync time over every model upstream scores.
 */
const NOISE_SD = 0.25;
const TIER_SD = 0.8;

/** Below this the price difference is not worth mentioning as a reason. */
const PRICE_TIE = 1.15;

const spread = (data.spread ?? {}) as Partial<Record<LensKey, number>>;

/** A gap in standard deviations of its own benchmark. */
function inSd(key: LensKey, points: number): number {
  const sd = spread[key];
  // No measured spread means no basis for calling the gap big or small; treat
  // it as one SD per 10 points, which is roughly what these tests run at.
  return points / (sd && sd > 0 ? sd : 10);
}

export interface LensRow {
  key: LensKey;
  label: string;
  blurb: string;
  source: string;
  a: number | null;
  b: number | null;
  /** Signed, b − a, so positive means the right-hand model leads. */
  delta: number | null;
}

export interface CapabilityRead {
  rows: LensRow[];
  /** Rows where both models have a score — the only ones we reason from. */
  comparable: LensRow[];
  cheaper: Model;
  dearer: Model;
  priceRatio: number;
  /** Index points per dollar of blended price, the "is it worth it" number. */
  valueA: number | null;
  valueB: number | null;
  verdict: string | null;
}

function pick(bench: Benchmark | undefined, key: LensKey): number | null {
  return bench ? bench[key] : null;
}

/** "a", "a and b", "a, b and c" — a plain join gives "a and b and c". */
function list(items: string[], conjunction = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

/**
 * Reads two models against each other on capability, and returns the sentence
 * that answers "is the dearer one worth it".
 *
 * Returns null for `verdict` when nothing defensible can be said — one model
 * unmeasured, or the prices within noise of each other so there is no trade to
 * describe. Saying nothing beats padding the page with a hedge.
 */
export function readCapability(a: Model, b: Model): CapabilityRead | null {
  const ba = benchmarkFor(a.slug);
  const bb = benchmarkFor(b.slug);
  if (!ba || !bb) return null;

  const rows: LensRow[] = LENSES.map((lens) => {
    const av = pick(ba, lens.key);
    const bv = pick(bb, lens.key);
    return {
      ...lens,
      a: av,
      b: bv,
      delta: av !== null && bv !== null ? Number((bv - av).toFixed(1)) : null,
    };
  });

  const comparable = rows.filter((r) => r.delta !== null);
  if (comparable.length === 0) return null;

  const pa = blendedPrice(a);
  const pb = blendedPrice(b);
  const [cheaper, dearer] = pa <= pb ? [a, b] : [b, a];
  const priceRatio = Math.max(pa, pb) / Math.min(pa, pb);

  /**
   * Value is averaged over the benchmarks *both* models sat, so the two
   * figures are built from the same tests. Averaging over whatever each model
   * happens to have would reward the one that skipped the hard ones.
   */
  const meanA = comparable.reduce((s, r) => s + (r.a as number), 0) / comparable.length;
  const meanB = comparable.reduce((s, r) => s + (r.b as number), 0) / comparable.length;

  return {
    rows,
    comparable,
    cheaper,
    dearer,
    priceRatio,
    valueA: pa === 0 ? null : meanA / pa,
    valueB: pb === 0 ? null : meanB / pb,
    verdict: buildVerdict({ comparable, cheaper, dearer, priceRatio, a, b }),
  };
}

function buildVerdict({
  comparable,
  cheaper,
  dearer,
  priceRatio,
  a,
}: {
  comparable: LensRow[];
  cheaper: Model;
  dearer: Model;
  priceRatio: number;
  a: Model;
  b: Model;
}): string | null {
  // `delta` is signed b − a; flip it so positive always means "dearer leads".
  const flip = dearer.slug === a.slug ? -1 : 1;
  const gaps = comparable.map((r) => {
    const points = (r.delta as number) * flip;
    return { row: r, points, sd: inSd(r.key, points) };
  });

  const ratio = `${priceRatio.toFixed(1)}×`;
  // Ranked in standard deviations, then reported in points: SD decides which
  // lens is the real story, points are what the reader can check on the chart.
  const lead = gaps.reduce((best, g) => (g.sd > best.sd ? g : best));
  const behind = gaps.filter((g) => g.sd < -NOISE_SD);
  const on = (g: typeof lead) => `${g.row.label.toLowerCase()} (${g.row.source})`;
  const by = (g: typeof lead) => `${g.points.toFixed(1)} points on ${on(g)}`;

  /**
   * Most pairs overlap on a single benchmark, and "beats it on nothing" off one
   * test is a sweeping claim on thin evidence. Where the phrasing would
   * generalise, name the one test instead and let the reader weigh it.
   */
  const thin = gaps.length === 1;
  const across = thin ? `on ${on(gaps[0])}` : 'on any benchmark they share';
  const everywhere = thin ? `on ${on(gaps[0])}` : 'on every benchmark they share';

  // Cheaper *and* better is the one case worth stating outright.
  if (lead.sd <= NOISE_SD && behind.length > 0) {
    const where =
      behind.length === gaps.length && gaps.length > 1
        ? 'every benchmark they share'
        : list(behind.map((g) => on(g)));
    return priceRatio >= PRICE_TIE
      ? `${cheaper.name} is ${ratio} cheaper than ${dearer.name} and scores higher on ${where} — there is no case for paying more here.`
      : `${cheaper.name} and ${dearer.name} cost about the same, but ${cheaper.name} scores higher on ${where}.`;
  }

  if (priceRatio < PRICE_TIE) {
    return lead.sd > NOISE_SD
      ? `Both are priced within ${Math.round((PRICE_TIE - 1) * 100)}% of each other, so capability decides it: ${dearer.name} leads by ${by(lead)}.`
      : `${cheaper.name} and ${dearer.name} are close on price and level ${everywhere} — either will do.`;
  }

  if (lead.sd <= NOISE_SD) {
    return `${dearer.name} costs ${ratio} more than ${cheaper.name} without measurably beating it ${across}${
      thin ? ', the only test both have sat' : ''
    } — on that evidence the extra spend buys nothing you can point at.`;
  }

  if (lead.sd >= TIER_SD) {
    const level = gaps.filter((g) => g.sd <= NOISE_SD).map((g) => on(g));
    const tail = level.length
      ? ` They are level on ${list(level)}, so the premium only pays off on ${lead.row.label.toLowerCase()} work.`
      : '';
    return `Not the same tier: ${dearer.name} leads ${cheaper.name} by ${by(lead)}, for ${ratio} the price.${tail}`;
  }

  return `${dearer.name} is ${ratio} dearer for ${by(lead)} — worth it only if that is your bottleneck.`;
}
