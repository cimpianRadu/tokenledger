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
  intelligence: number | null;
  coding: number | null;
  math: number | null;
  mmluPro: number | null;
  gpqa: number | null;
  livecodebench: number | null;
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
    key: 'intelligence' as const,
    label: 'General',
    blurb: 'summarising, extraction, classification, chat',
    source: 'Artificial Analysis Intelligence Index',
  },
  {
    key: 'coding' as const,
    label: 'Coding',
    blurb: 'writing and fixing code, agentic tool use',
    source: 'Artificial Analysis Coding Index',
  },
  {
    key: 'math' as const,
    label: 'Reasoning',
    blurb: 'multi-step logic, maths, analysis',
    source: 'Artificial Analysis Math Index',
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
 * How far apart two scores have to be before we call it a real difference.
 *
 * Judgment calls, not measurements. `NOISE` is the band inside which we tell
 * someone to just take the cheaper model; `TIER` is where we stop calling them
 * alternatives at all. Both are named here rather than inlined because the
 * honest thing is to re-tune them against the real spread once the dataset
 * lands, and that should be a one-line change.
 */
const NOISE = 3;
const TIER = 10;

/** Below this the price difference is not worth mentioning as a reason. */
const PRICE_TIE = 1.15;

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

  const ia = pick(ba, 'intelligence');
  const ib = pick(bb, 'intelligence');

  return {
    rows,
    comparable,
    cheaper,
    dearer,
    priceRatio,
    valueA: ia === null || pa === 0 ? null : ia / pa,
    valueB: ib === null || pb === 0 ? null : ib / pb,
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
  const gaps = comparable.map((r) => ({ row: r, gap: (r.delta as number) * flip }));

  const ratio = `${priceRatio.toFixed(1)}×`;
  const lead = gaps.reduce((best, g) => (g.gap > best.gap ? g : best));
  const behind = gaps.filter((g) => g.gap < -NOISE);

  // Cheaper *and* better is the one case worth stating outright.
  if (lead.gap <= NOISE && behind.length > 0) {
    // Naming all three lenses is longer and says less than "every lens".
    const on =
      behind.length === gaps.length && gaps.length > 1
        ? 'every lens'
        : list(behind.map((g) => g.row.label.toLowerCase()));
    return priceRatio >= PRICE_TIE
      ? `${cheaper.name} is ${ratio} cheaper than ${dearer.name} and scores higher on ${on} — there is no case for paying more here.`
      : `${cheaper.name} and ${dearer.name} cost about the same, but ${cheaper.name} scores higher on ${on}.`;
  }

  if (priceRatio < PRICE_TIE) {
    return lead.gap > NOISE
      ? `Both are priced within ${Math.round((PRICE_TIE - 1) * 100)}% of each other, so capability decides it: ${dearer.name} leads by ${lead.gap.toFixed(1)} points on ${lead.row.label.toLowerCase()}.`
      : `${a.name} and ${dearer.slug === a.slug ? cheaper.name : dearer.name} are close on both price and measured capability — either will do.`;
  }

  if (lead.gap <= NOISE) {
    return `${dearer.name} costs ${ratio} more than ${cheaper.name} and measures within ${NOISE} points of it across every lens — for these tasks the extra spend buys nothing measurable.`;
  }

  if (lead.gap >= TIER) {
    const weak = gaps.filter((g) => g.gap <= NOISE).map((g) => g.row.label.toLowerCase());
    const tail = weak.length
      ? ` They are level on ${list(weak)}, so the premium only pays off on ${lead.row.label.toLowerCase()} work.`
      : '';
    return `Not the same tier: ${dearer.name} leads ${cheaper.name} by ${lead.gap.toFixed(1)} points on ${lead.row.label.toLowerCase()}, for ${ratio} the price.${tail}`;
  }

  return `${dearer.name} is ${ratio} dearer for ${lead.gap.toFixed(1)} more points on ${lead.row.label.toLowerCase()} — worth it only if that is your bottleneck.`;
}
