/**
 * Umami custom events, guarded.
 *
 * `window.umami` is absent in dev, absent when no website id is configured,
 * and absent whenever a visitor blocks the script — which on a site whose
 * audience is developers is a large share of them. Every call has to survive
 * that, and none of them may ever break an interaction: a metric is not worth
 * a broken button.
 *
 * Only the two facts a pricing comparator cannot get anywhere else are sent —
 * which providers get compared and which models get priced. No prompt text,
 * no token counts, no costs.
 */
declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

export function track(event: string, data?: Record<string, unknown>): void {
  try {
    window.umami?.track(event, data);
  } catch {
    /* analytics is never load-bearing */
  }
}
