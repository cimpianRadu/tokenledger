/**
 * The cheap → dear colour ramp, as a CSS colour string.
 *
 * Data-free on purpose: the static pages and the React island both need it,
 * and importing it from `models.ts` would pull `models.json` into the client
 * bundle alongside the copy Astro already serialises into the island's props.
 *
 * Two segments with one `color-mix` each. Nesting the mixes — cheap into (mid
 * into dear) — desaturates the middle of the range to grey, because oklab
 * interpolates a teal/blue blend straight through the neutral axis, so exactly
 * the mid-priced models the scale exists to place lose their colour.
 */
export function rampColor(position: number): string {
  const t = Math.min(1, Math.max(0, position));
  const pct = (v: number) => `${(v * 200).toFixed(1)}%`;
  return t <= 0.5
    ? `color-mix(in oklab, var(--cheap), var(--mid) ${pct(t)})`
    : `color-mix(in oklab, var(--mid), var(--dear) ${pct(t - 0.5)})`;
}
