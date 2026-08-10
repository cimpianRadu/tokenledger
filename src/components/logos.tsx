/**
 * Provider marks, inline and monochrome.
 *
 * These are simplified in-house glyphs, not the providers' official brand
 * assets — a comparison table needs a recognisable per-row anchor, not an
 * exact trademark reproduction. They inherit `currentColor`, so one set works
 * in both themes; swapping in official SVGs later only means replacing the
 * paths here.
 */
import type { JSX } from 'react';

const box = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const MARKS: Record<string, JSX.Element> = {
  // Six-fold knot.
  openai: (
    <svg {...box}>
      <path d="M12 3.2 18.6 7v7.6L12 18.4 5.4 14.6V7Z" />
      <path d="M12 3.2v7.6l6.6 3.8M12 10.8 5.4 14.6" />
    </svg>
  ),
  // Splayed A.
  anthropic: (
    <svg {...box}>
      <path d="M4.2 19.4 10.4 4.6h3.2l6.2 14.8" />
      <path d="M8.2 14.2h7.6" />
    </svg>
  ),
  // Four-point sparkle.
  gemini: (
    <svg {...box}>
      <path d="M12 3c0 5 4 9 9 9-5 0-9 4-9 9 0-5-4-9-9-9 5 0 9-4 9-9Z" />
    </svg>
  ),
  // Monogram X.
  xai: (
    <svg {...box}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  ),
  // Diving curve.
  deepseek: (
    <svg {...box}>
      <path d="M3.5 9c4.5-3.4 9-1.6 11.4 1.6 1.6 2.2 3.2 2.6 5.6 1.6" />
      <path d="M20.5 12.2c-1.4 5-6.2 8-11.3 6.6C5.6 17.8 3.5 14.6 3.5 9" />
      <circle cx="15.8" cy="8.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  // Crescent.
  moonshot: (
    <svg {...box}>
      <path d="M19.4 14.6A8.2 8.2 0 0 1 9.4 4.6a8.2 8.2 0 1 0 10 10Z" />
    </svg>
  ),
  // Stacked bands.
  mistral: (
    <svg {...box}>
      <path d="M3.5 6.5h6M14.5 6.5h6M3.5 12h17M3.5 17.5h6M14.5 17.5h6" />
    </svg>
  ),
  // Interlocked query.
  perplexity: (
    <svg {...box}>
      <path d="M12 4.5v15" />
      <path d="M12 8.2 6.4 4.5v6.3H3.6v6.4h2.8v2.3L12 15.8" />
      <path d="M12 8.2l5.6-3.7v6.3h2.8v6.4h-2.8v2.3L12 15.8" />
    </svg>
  ),
  // Linked rings.
  cohere_chat: (
    <svg {...box}>
      <path d="M9.6 8.4a4.6 4.6 0 1 0 0 7.2" />
      <path d="M14.4 15.6a4.6 4.6 0 1 0 0-7.2" />
    </svg>
  ),
  // Signal chevrons.
  groq: (
    <svg {...box}>
      <path d="M13.4 3.5 5.5 13.4h5.4l-1.3 7.1 8-9.9h-5.5Z" />
    </svg>
  ),
  // Die with pins.
  cerebras: (
    <svg {...box}>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.4" />
      <path d="M10 4v3.5M14 4v3.5M10 16.5V20M14 16.5V20M4 10h3.5M4 14h3.5M16.5 10H20M16.5 14H20" />
    </svg>
  ),
  // Ascending steps.
  ai21: (
    <svg {...box}>
      <path d="M4 19V13h4.7V8h4.6V4H20v15Z" />
    </svg>
  ),
};

/** Neutral fallback so an unmapped provider still lines up on the grid. */
const FALLBACK = (
  <svg {...box}>
    <circle cx="12" cy="12" r="7.5" />
  </svg>
);

export function providerMark(key: string): JSX.Element {
  return MARKS[key] ?? FALLBACK;
}
