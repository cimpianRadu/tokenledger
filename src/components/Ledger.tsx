import { useMemo, useRef, useState, useDeferredValue } from 'react';
import { encode, decode } from 'gpt-tokenizer/encoding/o200k_base';
import { tierOf, TIER_LABEL, byRecency, type Tier } from '../lib/families';
import { rampColor } from '../lib/ramp';
import { track } from '../lib/track';
import { providerMark } from './logos';
import type { Model, Provider } from '../lib/models';

interface Props {
  models: Model[];
  providers: Provider[];
  /** Provider key → model slug the card starts on. */
  defaults: Record<string, string>;
  /** Provider keys included in the ranking on first paint. */
  active: string[];
}

const SAMPLE = `Summarise the following support thread and list every action item with an owner and a due date. If a date is missing, say "unspecified" rather than guessing.`;

/** Non-OpenAI families have no public tokenizer; these are published ratios. */
const DRIFT: Record<string, number> = {
  openai: 1,
  anthropic: 1.15,
  gemini: 1.05,
  deepseek: 1.08,
  mistral: 1.1,
  xai: 1.06,
  cohere_chat: 1.09,
  moonshot: 1.08,
  perplexity: 1.05,
  ai21: 1.1,
  cerebras: 1.08,
  groq: 1.08,
};

/** Output length presets — "how long will the reply be" is the input everyone
 *  gets wrong. Ratios are of the prompt length. */
const PRESETS = [
  { id: 'rag', label: 'RAG / Q&A', ratio: 0.15 },
  { id: 'chat', label: 'Chat reply', ratio: 0.5 },
  { id: 'full', label: 'Full answer', ratio: 1.5 },
  { id: 'long', label: 'Long generation', ratio: 6 },
];

const CALL_STEPS = [
  { value: 1, label: '1' },
  { value: 100, label: '100' },
  { value: 1_000, label: '1K' },
  { value: 10_000, label: '10K' },
  { value: 100_000, label: '100K' },
];

const TIERS: Tier[] = ['current', 'legacy', 'deprecated'];

/**
 * One decimal count for every figure on the page, chosen from the smallest one
 * shown. Switching format per magnitude — $0.0283 next to $1.16 — breaks the
 * decimal point that tabular figures exist to line up.
 */
function decimalsFor(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return 2;
  const min = Math.min(...positive);
  if (min >= 1000) return 0;
  if (min >= 1) return 2;
  if (min >= 0.01) return 4;
  return 6;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}K`;
  return n.toLocaleString();
}

/** Per-million list rate, for the line under each card's select. */
function rate(v: number | null): string {
  if (v === null) return '—';
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(3).replace(/0$/, '')}`;
}

export default function Ledger({ models, providers, defaults, active }: Props) {
  const [text, setText] = useState(SAMPLE);
  const [preset, setPreset] = useState('chat');
  const [calls, setCalls] = useState(1000);
  const [cached, setCached] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>(defaults);
  const [on, setOnState] = useState<string[]>(active);
  const [copied, setCopied] = useState(false);

  /**
   * Mirrors `on`, but updated synchronously. State read from a handler is the
   * value from the last render, so two clicks landing in the same tick both
   * see the pre-click set — enough to fire the `compare` event twice for a
   * single add-then-remove. Every mutation goes through `setActive`, which
   * keeps this the one authoritative copy.
   */
  const onRef = useRef<string[]>(active);

  function setActive(next: string[] | ((prev: string[]) => string[])) {
    const value = typeof next === 'function' ? next(onRef.current) : next;
    onRef.current = value;
    setOnState(value);
  }

  const deferred = useDeferredValue(text);

  const tokens = useMemo(() => {
    if (!deferred) return [];
    try {
      return encode(deferred);
    } catch {
      return [];
    }
  }, [deferred]);

  const words = useMemo(() => {
    const t = deferred.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [deferred]);

  const chips = useMemo(
    () =>
      tokens.slice(0, 300).map((t, i) => {
        let piece = '';
        try {
          piece = decode([t]);
        } catch {
          piece = '�';
        }
        return { i, piece };
      }),
    [tokens]
  );

  const outputTokens = Math.round(
    tokens.length * (PRESETS.find((p) => p.id === preset)?.ratio ?? 0.5)
  );

  const index = useMemo(() => new Map(models.map((m) => [m.slug, m])), [models]);

  /**
   * Every model, grouped by provider and then by tier so the <select> can offer
   * all of them. The chip grid this replaced capped each provider at six and
   * sliced from the raw dataset order, which routinely hid the model you had
   * selected behind a "+8" that was not even clickable.
   */
  const catalog = useMemo(() => {
    const map = new Map<string, Record<Tier, Model[]>>();
    for (const m of models) {
      if (!map.has(m.provider))
        map.set(m.provider, { current: [], legacy: [], deprecated: [] });
      map.get(m.provider)![tierOf(m)].push(m);
    }
    for (const groups of map.values())
      for (const t of TIERS) groups[t].sort(byRecency);
    return map;
  }, [models]);

  /** Priced for every provider, not just the active ones — a card stays
   *  informative while it is switched off, and one decimal scale covers the
   *  whole page. */
  const priced = useMemo(
    () =>
      providers.map((p) => {
        const model = index.get(picks[p.key]);
        if (!model) return { provider: p, model: null, cost: 0, inTok: 0, overTier: false, usedCache: false };

        const inTok = Math.round(tokens.length * (DRIFT[p.key] ?? 1.1));

        // Apply the long-context rate when the prompt actually crosses the
        // threshold, instead of making the reader pick the right variant.
        const overTier = model.tier !== null && inTok > model.tier.threshold;
        const listIn = overTier ? model.tier!.input ?? model.input : model.input;
        const outRate = overTier
          ? model.tier!.output ?? model.output
          : model.output;

        const cacheRate = overTier
          ? model.tier!.cachedInput ?? model.cachedInput
          : model.cachedInput;
        const usedCache = cached && cacheRate !== null;
        const inRate = usedCache ? cacheRate! : listIn;

        const cost =
          ((inTok * inRate) / 1_000_000 + (outputTokens * outRate) / 1_000_000) *
          calls;
        return { provider: p, model, cost, inTok, overTier, usedCache };
      }),
    [providers, index, picks, tokens.length, outputTokens, calls, cached]
  );

  const rows = useMemo(
    () =>
      priced
        .filter((r) => r.model && on.includes(r.provider.key))
        .sort((a, b) => a.cost - b.cost),
    [priced, on]
  );

  /** Driven by the ranked rows, not by all twelve — otherwise one cheap
   *  provider nobody switched on pushes every figure to six decimals. */
  const decimals = decimalsFor(rows.map((r) => r.cost));
  const money = (n: number) =>
    `$${n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;

  /**
   * Bars are log-spaced. Prices span three orders of magnitude, so a linear bar
   * gives the cheapest model a two-pixel stub next to a full-width one and the
   * comparison — the entire point of the row — reads as "one of these is free".
   */
  const scale = useMemo(() => {
    const costs = rows.map((r) => r.cost).filter((c) => c > 0);
    if (!costs.length) return () => 0;
    const lo = Math.log(Math.min(...costs));
    const hi = Math.log(Math.max(...costs));
    return (c: number) => (c <= 0 ? 0 : hi === lo ? 1 : (Math.log(c) - lo) / (hi - lo));
  }, [rows]);

  const cheapest = rows.find((r) => r.cost > 0)?.cost ?? 0;

  function toggle(key: string) {
    const adding = !onRef.current.includes(key);
    // Additions only — a removal is usually undoing a misclick, and counting
    // both would make every pair of clicks look like interest.
    if (adding) track('compare', { provider: key, model: picks[key] });
    setActive((s) => (adding ? [...s, key] : s.filter((x) => x !== key)));
  }

  async function copyEstimate() {
    const lines = rows.map(
      (r) =>
        `${r.model!.name.padEnd(28)} ${money(r.cost).padStart(12)}  ${r.provider.brand}`
    );
    const body = [
      `Price Per Token estimate`,
      `${tokens.length.toLocaleString()} in / ~${outputTokens.toLocaleString()} out × ${calls.toLocaleString()} calls${cached ? ' (cached input)' : ''}`,
      '',
      ...lines,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the table is on screen anyway */
    }
  }

  return (
    <div className="ledger">
      <div className="ledger__labelrow">
        <label className="ledger__label" htmlFor="prompt">
          Your prompt
        </label>
        {text && (
          <button type="button" className="ledger__clear" onClick={() => setText('')}>
            Clear text
          </button>
        )}
      </div>
      <textarea
        id="prompt"
        className="ledger__input mono"
        value={text}
        rows={4}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a prompt, a document, code, or a JSON payload."
      />

      <div className="ledger__meter">
        <strong className="mono">{tokens.length.toLocaleString()}</strong>
        <span>tokens</span>
        <span className="ledger__sep" />
        <strong className="mono">{words.toLocaleString()}</strong>
        <span>words</span>
        <span className="ledger__sep" />
        <strong className="mono">{text.length.toLocaleString()}</strong>
        <span>characters</span>
        <span className="ledger__sep" />
        <span className="ledger__note">o200k_base, counted in your browser</span>
      </div>

      {chips.length > 0 && (
        <details className="strip">
          <summary className="strip__summary">
            Show the token split
            <span className="strip__count mono">
              {tokens.length.toLocaleString()} pieces
            </span>
          </summary>
          <div className="strip__body" aria-hidden="true">
            {chips.map(({ i, piece }) => (
              <span key={i} className="strip__tok" data-alt={i % 2}>
                {piece === '\n' ? '⏎' : piece === ' ' ? '␣' : piece}
              </span>
            ))}
            {tokens.length > chips.length && (
              <span className="strip__more">
                +{(tokens.length - chips.length).toLocaleString()} more
              </span>
            )}
          </div>
        </details>
      )}

      <div className="controls">
        <fieldset className="control">
          <legend>Expected reply</legend>
          <div className="seg">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="seg__btn"
                aria-pressed={preset === p.id}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="control__derived mono">
            ≈ {outputTokens.toLocaleString()} output tokens
          </span>
        </fieldset>

        <fieldset className="control">
          <legend>Calls</legend>
          <div className="seg">
            {CALL_STEPS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="seg__btn mono"
                aria-pressed={calls === c.value}
                onClick={() => setCalls(c.value)}
              >
                {c.label}
              </button>
            ))}
            <input
              type="number"
              className="seg__input mono"
              min={1}
              step={1}
              value={calls}
              aria-label="Number of calls"
              onChange={(e) => setCalls(Math.max(1, +e.target.value || 1))}
            />
          </div>
          <span className="control__derived mono">
            {compact(tokens.length * calls)} input tokens billed
          </span>
        </fieldset>

        <fieldset className="control">
          <legend>Cache</legend>
          <label className="switch">
            <input
              type="checkbox"
              checked={cached}
              onChange={(e) => setCached(e.target.checked)}
            />
            <span>Prompt prefix already cached</span>
          </label>
          <span className="control__derived">
            Providers without a published cache rate stay at list price.
          </span>
        </fieldset>
      </div>

      <div className="grid">
        <div className="grid__head">
          <span className="eyebrow">
            Providers — {on.length} of {providers.length} in the ranking
          </span>
          <div className="grid__actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setActive(providers.map((p) => p.key))}
            >
              Select all
            </button>
            <button type="button" className="ghost" onClick={() => setActive([])}>
              Clear
            </button>
          </div>
        </div>

        <div className="grid__cards">
          {priced.map(({ provider, model, cost, overTier, usedCache }) => {
            const groups = catalog.get(provider.key);
            const isOn = on.includes(provider.key);
            return (
              <div
                key={provider.key}
                className="pcard"
                data-on={isOn}
                data-lead={isOn && rows.length > 1 && rows[0]?.provider.key === provider.key}
              >
                <button
                  type="button"
                  className="pcard__toggle"
                  aria-pressed={isOn}
                  onClick={() => toggle(provider.key)}
                >
                  <span className="pcard__mark">{providerMark(provider.key)}</span>
                  <span className="pcard__brand">{provider.brand}</span>
                  <span className="pcard__state" aria-hidden="true">
                    {isOn ? '✓' : '+'}
                  </span>
                </button>

                <select
                  className="pcard__select mono"
                  value={picks[provider.key] ?? ''}
                  aria-label={`${provider.brand} model`}
                  onChange={(e) => {
                    const slug = e.target.value;
                    track('model', { provider: provider.key, model: slug });
                    setPicks((s) => ({ ...s, [provider.key]: slug }));
                    // Choosing a model is the intent to price it; making the
                    // reader then find the toggle is a second step for nothing.
                    setActive((s) => (s.includes(provider.key) ? s : [...s, provider.key]));
                  }}
                >
                  {TIERS.map((t) => {
                    const list = groups?.[t] ?? [];
                    if (!list.length) return null;
                    return (
                      <optgroup key={t} label={`${TIER_LABEL[t]} · ${list.length}`}>
                        {list.map((m) => (
                          <option key={m.slug} value={m.slug}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

                {model && (
                  <>
                    <div className="pcard__rates mono">
                      <span>
                        {rate(usedCache ? model.cachedInput : model.input)} in
                        {usedCache && <em> cached</em>}
                      </span>
                      <span className="pcard__dot">·</span>
                      <span>{rate(model.output)} out</span>
                      {overTier && (
                        <span className="pcard__tier">
                          {model.tier!.threshold / 1000}K+ rate
                        </span>
                      )}
                    </div>
                    <div className="pcard__foot">
                      <span className={`badge badge--${model.counting}`}>
                        {model.counting}
                      </span>
                      <span className="pcard__total mono">{money(cost)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="results">
        <div className="grid__head">
          <span className="eyebrow">
            {rows.length ? `Ranked cheapest first · ${calls.toLocaleString()} calls` : 'Ranking'}
          </span>
          {rows.length > 1 && (
            <button type="button" className="ghost" onClick={copyEstimate}>
              {copied ? 'Copied' : 'Copy estimate'}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="ledger__empty">
            Switch on a provider above to price this prompt.
          </p>
        ) : (
          <ol className="ladder">
            {rows.map(({ provider, model, cost, inTok, overTier }) => {
              const p = scale(cost);
              return (
                <li key={provider.key} className="ladder__row">
                  <div className="ladder__head">
                    <span className="ladder__mark">{providerMark(provider.key)}</span>
                    <a href={`/models/${model!.slug}`}>{model!.name}</a>
                    {overTier && (
                      <span
                        className="badge badge--tier"
                        title={`Priced at the long-context rate: this prompt is over ${
                          model!.tier!.threshold / 1000
                        }K tokens.`}
                      >
                        {model!.tier!.threshold / 1000}K+
                      </span>
                    )}
                  </div>
                  <div className="ladder__track">
                    <div
                      className="ladder__bar"
                      style={
                        {
                          '--p': p,
                          background: rampColor(p),
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  <div className="ladder__figures mono">
                    <span>{money(cost)}</span>
                    <span className="ladder__sub">
                      {cheapest > 0 && cost > cheapest
                        ? `×${(cost / cheapest).toFixed(1)} · ${inTok.toLocaleString()} in`
                        : `cheapest · ${inTok.toLocaleString()} in`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <style>{`
        .ledger { margin-block: 1.5rem 0; }
        .ledger__labelrow { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: .5rem; }
        .ledger__label {
          font-family: var(--font-mono); font-size: .7rem;
          letter-spacing: .11em; text-transform: uppercase; color: var(--ink-faint);
        }
        .ledger__clear {
          font-size: .74rem; cursor: pointer; background: none; border: 0; padding: 0;
          color: var(--ink-faint); text-decoration: underline; text-underline-offset: .2em;
        }
        .ledger__clear:hover { color: var(--ink); }
        .ledger__input {
          width: 100%; padding: .9rem 1rem; font-size: .92rem; line-height: 1.5;
          color: var(--ink); background: var(--paper-raised);
          border: 1px solid var(--rule-strong); border-radius: var(--radius);
          resize: vertical;
        }
        .ledger__meter {
          display: flex; align-items: baseline; gap: .45rem; flex-wrap: wrap;
          margin-top: .7rem; font-size: .85rem; color: var(--ink-soft);
        }
        .ledger__meter strong { font-size: 1.05rem; color: var(--ink); font-weight: 600; }
        .ledger__sep { width: 1px; height: .9em; background: var(--rule-strong); margin-inline: .35rem; }
        .ledger__note { color: var(--ink-faint); font-size: .8rem; }

        /* Collapsed by default: it is a curiosity, not a step in the task. */
        .strip { margin-top: .9rem; }
        .strip__summary {
          display: flex; align-items: baseline; gap: .6rem; cursor: pointer;
          font-size: .78rem; color: var(--ink-faint); list-style: none;
        }
        .strip__summary::-webkit-details-marker { display: none; }
        .strip__summary::before { content: '▸'; font-size: .7em; }
        .strip[open] .strip__summary::before { content: '▾'; }
        .strip__summary:hover { color: var(--ink); }
        .strip__count { margin-left: auto; }
        .strip__body {
          display: flex; flex-wrap: wrap; gap: 2px; margin-top: .6rem;
          padding: .75rem; max-height: 9rem; overflow-y: auto;
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--paper-raised);
        }
        /* Alternating tint only — the cheap→dear ramp means cost everywhere
           else on the site, and a token's index is not a cost. */
        .strip__tok {
          font-family: var(--font-mono); font-size: .78rem; line-height: 1.35;
          padding: .1em .28em; border-radius: 2px; white-space: pre; color: var(--ink);
        }
        .strip__tok[data-alt="0"] { background: color-mix(in oklab, var(--ink) 8%, transparent); }
        .strip__tok[data-alt="1"] { background: color-mix(in oklab, var(--ink) 14%, transparent); }
        .strip__more { font-family: var(--font-mono); font-size: .75rem; color: var(--ink-faint); align-self: center; padding-left: .4rem; }

        .controls {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
          gap: 1.25rem 2rem; margin-top: 1.75rem; padding-top: 1.25rem;
          border-top: 1px solid var(--rule);
        }
        .control { border: 0; padding: 0; margin: 0; display: grid; gap: .5rem; align-content: start; }
        .control legend {
          font-family: var(--font-mono); font-size: .7rem; letter-spacing: .11em;
          text-transform: uppercase; color: var(--ink-faint); padding: 0;
        }
        .control__derived { font-size: .74rem; color: var(--ink-faint); }

        /* One joined control instead of loose buttons plus a spinner box.
           The 1px gap over a filled background draws the dividers, so a row
           that wraps gets a clean horizontal rule instead of a ragged edge. */
        .seg {
          display: flex; flex-wrap: wrap; align-items: stretch; gap: 1px;
          background: var(--rule-strong);
          border: 1px solid var(--rule-strong); border-radius: var(--radius);
          overflow: hidden; width: 100%;
        }
        .seg__btn {
          flex: 1 1 auto; font-size: .78rem; cursor: pointer; padding: .4em .75em;
          background: var(--paper-raised); color: var(--ink-soft); border: 0;
          white-space: nowrap;
        }
        .seg__btn:hover { color: var(--ink); }
        .seg__btn[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
        .seg__input {
          flex: 1 1 5rem; min-width: 0; padding: .4em .6em; font-size: .78rem;
          color: var(--ink); background: var(--paper); border: 0;
          -moz-appearance: textfield; appearance: textfield;
        }
        .seg__input::-webkit-outer-spin-button,
        .seg__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .switch { display: flex; align-items: center; gap: .45rem; font-size: .82rem; color: var(--ink-soft); cursor: pointer; }

        .grid { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
        .grid__head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 1rem; flex-wrap: wrap; margin-bottom: .9rem;
        }
        .grid__head .eyebrow { margin-bottom: 0; }
        .grid__actions { display: flex; gap: .5rem; }
        .ghost {
          font-size: .74rem; cursor: pointer; padding: .3em .6em; background: transparent;
          color: var(--ink-soft); border: 1px solid var(--rule-strong); border-radius: var(--radius);
        }
        .ghost:hover { color: var(--ink); border-color: var(--ink); }

        .grid__cards {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
          gap: .6rem;
        }
        .pcard {
          display: grid; gap: .5rem; align-content: start; padding: .7rem .75rem;
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--paper-raised);
        }
        .pcard[data-on="true"] { border-color: var(--accent); }
        .pcard[data-lead="true"] { box-shadow: inset 3px 0 0 var(--cheap); }
        .pcard[data-on="false"] { opacity: .62; }
        .pcard[data-on="false"]:hover { opacity: 1; }

        .pcard__toggle {
          display: flex; align-items: center; gap: .5rem; width: 100%;
          background: none; border: 0; padding: 0; cursor: pointer; color: var(--ink);
          text-align: left;
        }
        .pcard__mark { display: inline-flex; color: var(--ink-soft); flex: none; }
        .pcard[data-on="true"] .pcard__mark { color: var(--accent); }
        .pcard__brand {
          font-family: var(--font-display); font-weight: 700; font-size: .98rem;
          letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pcard__state {
          margin-left: auto; flex: none; width: 1.25rem; height: 1.25rem;
          display: grid; place-items: center; font-size: .72rem; border-radius: var(--radius);
          border: 1px solid var(--rule-strong); color: var(--ink-faint);
        }
        .pcard[data-on="true"] .pcard__state {
          background: var(--accent); border-color: var(--accent); color: var(--paper);
        }

        .pcard__select {
          width: 100%; font-size: .76rem; padding: .4em 1.8em .4em .5em;
          color: var(--ink); background: var(--paper);
          border: 1px solid var(--rule-strong); border-radius: var(--radius);
          appearance: none; cursor: pointer;
          background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                            linear-gradient(135deg, currentColor 50%, transparent 50%);
          background-position: right 0.85em top 55%, right 0.55em top 55%;
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
        }
        .pcard__rates { font-size: .72rem; color: var(--ink-soft); display: flex; flex-wrap: wrap; gap: .3em; align-items: baseline; }
        .pcard__rates em { font-style: normal; color: var(--cheap); }
        .pcard__dot { color: var(--ink-faint); }
        .pcard__tier { color: var(--dear); }
        .pcard__foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
        .pcard__total { font-size: 1rem; font-weight: 600; }

        .results { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
        .ladder { list-style: none; margin: 0; padding: 0; }
        .ladder__row {
          display: grid; grid-template-columns: minmax(0, 16rem) 1fr auto;
          gap: 1rem; align-items: center; padding: .7rem 0; border-bottom: 1px solid var(--rule);
        }
        .ladder__head { display: flex; align-items: center; gap: .45rem; min-width: 0; }
        .ladder__mark { display: inline-flex; color: var(--ink-faint); flex: none; }
        .ladder__head a {
          font-weight: 500; font-size: .9rem; text-decoration: none; color: var(--ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ladder__head a:hover { text-decoration: underline; }
        .badge--tier { color: var(--dear); flex: none; }

        .ladder__track { min-width: 0; }
        /* Colour is set inline from rampColor(); only the length lives here. */
        .ladder__bar {
          height: 10px; border-radius: 2px;
          width: calc(6% + var(--p) * 94%);
        }
        .ladder__figures { display: flex; flex-direction: column; align-items: flex-end; }
        .ladder__figures > span:first-child { font-size: 1rem; font-weight: 600; }
        .ladder__sub { font-size: .7rem; color: var(--ink-faint); white-space: nowrap; }
        .ledger__empty { color: var(--ink-soft); margin: 0; }

        @media (max-width: 640px) {
          .ladder__row { grid-template-columns: 1fr auto; }
          .ladder__track { grid-column: 1 / -1; order: 3; }
          .grid__cards { grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
          .seg { width: 100%; }
          .seg__input { flex: 1 1 4rem; width: auto; }
        }
      `}</style>
    </div>
  );
}
