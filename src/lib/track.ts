/**
 * Custom events, guarded.
 *
 * `window.va` is Vercel Web Analytics' queue. It is absent in dev, absent
 * before the script loads, and absent whenever a visitor blocks it — which on
 * a site whose audience is developers is a large share of them. Every call has
 * to survive that, and none may ever break an interaction: a metric is not
 * worth a broken button.
 *
 * Custom events need a paid Vercel plan; on Hobby these calls are accepted and
 * dropped. Left in deliberately — page views work either way, and the day the
 * plan changes the two signals a pricing comparator cannot get anywhere else
 * start arriving with no code change.
 *
 * Only which providers get compared and which models get priced are sent. No
 * prompt text, no token counts, no costs.
 */
declare global {
  interface Window {
    va?: (event: 'event' | 'beforeSend' | 'pageview', properties?: unknown) => void;
  }
}

export function track(name: string, data?: Record<string, unknown>): void {
  try {
    window.va?.('event', { name, data });
  } catch {
    /* analytics is never load-bearing */
  }
}
