import { useMemo, useState, useDeferredValue } from 'react';
import { encode, decode } from 'gpt-tokenizer/encoding/o200k_base';
import type { Model } from '../lib/models';

interface Props {
  models: Model[];
  featured: string[];
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

function money(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.0001) return '<$0.0001';
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function Ledger({ models, featured }: Props) {
  const [text, setText] = useState(SAMPLE);
  const [preset, setPreset] = useState('chat');
  const [calls, setCalls] = useState(1000);
  const [selected, setSelected] = useState<string[]>(featured);
  const [query, setQuery] = useState('');
  const [showDeprecated, setShowDeprecated] = useState(false);

  const deferred = useDeferredValue(text);

  const tokens = useMemo(() => {
    if (!deferred) return [];
    try {
      return encode(deferred);
    } catch {
      return [];
    }
  }, [deferred]);

  const chips = useMemo(
    () =>
      tokens.slice(0, 300).map((t, i) => {
        let piece = '';
        try {
          piece = decode([t]);
        } catch {
          piece = '\uFFFD';
        }
        return { i, piece };
      }),
    [tokens]
  );

  const outputTokens = Math.round(
    tokens.length * (PRESETS.find((p) => p.id === preset)?.ratio ?? 0.5)
  );

  const rows = useMemo(
    () =>
      models
        .filter((m) => selected.includes(m.slug))
        .map((m) => {
          const inTok = Math.round(tokens.length * (DRIFT[m.provider] ?? 1.1));

          // Apply the long-context rate when the prompt actually crosses the
          // threshold, instead of making the reader pick the right variant.
          const overTier = m.tier !== null && inTok > m.tier.threshold;
          const inRate = overTier ? m.tier!.input ?? m.input : m.input;
          const outRate = overTier ? m.tier!.output ?? m.output : m.output;

          const cost =
            ((inTok * inRate) / 1_000_000 +
              (outputTokens * outRate) / 1_000_000) *
            calls;
          return { model: m, inTok, cost, overTier };
        })
        .sort((a, b) => a.cost - b.cost),
    [models, selected, tokens.length, outputTokens, calls]
  );

  const max = rows.length ? rows[rows.length - 1].cost : 0;

  const pool = useMemo(
    () => models.filter((m) => showDeprecated || !m.deprecatedOn),
    [models, showDeprecated]
  );

  /** Grouped by provider — a flat wall of 250 chips was the noisiest thing
   *  on the page. */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { name: string; models: Model[] }>();
    for (const m of pool) {
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.providerName.toLowerCase().includes(q) &&
        !m.brand.toLowerCase().includes(q)
      )
        continue;
      if (!map.has(m.provider))
        map.set(m.provider, { name: m.brand, models: [] });
      map.get(m.provider)!.models.push(m);
    }
    const cap = q ? 12 : 6;
    return [...map.values()].map((g) => ({
      name: g.name,
      models: g.models.slice(0, cap),
      hidden: Math.max(0, g.models.length - cap),
    }));
  }, [pool, query]);

  function toggle(slug: string) {
    setSelected((s) =>
      s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]
    );
  }

  return (
    <div className="ledger">
      <label className="ledger__label" htmlFor="prompt">
        Your prompt
      </label>
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
        <strong className="mono">{text.length.toLocaleString()}</strong>
        <span>characters</span>
        <span className="ledger__sep" />
        <span className="ledger__note">o200k_base, counted in your browser</span>
      </div>

      {chips.length > 0 && (
        <div className="strip" aria-hidden="true">
          {chips.map(({ i, piece }) => (
            <span key={i} className="strip__tok" data-mod={i % 6}>
              {piece === '\n' ? '⏎' : piece === ' ' ? '␣' : piece}
            </span>
          ))}
          {tokens.length > chips.length && (
            <span className="strip__more">
              +{(tokens.length - chips.length).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <fieldset className="controls">
        <legend>Expected reply</legend>
        <div className="controls__presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="controls__preset"
              aria-pressed={preset === p.id}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <span className="controls__derived mono">
            ≈ {outputTokens.toLocaleString()} out
          </span>
        </div>
        <label className="controls__calls">
          Calls
          <input
            type="number"
            className="mono"
            min={1}
            step={100}
            value={calls}
            onChange={(e) => setCalls(Math.max(1, +e.target.value || 1))}
          />
        </label>
      </fieldset>

      {rows.length === 0 ? (
        <p className="ledger__empty">Pick a model below to price this prompt.</p>
      ) : (
        <ol className="ladder">
          {rows.map(({ model, inTok, cost, overTier }) => (
            <li key={model.slug} className="ladder__row">
              <div className="ladder__head">
                <a href={`/models/${model.slug}`}>{model.name}</a>
                <span
                  className={`badge badge--${model.counting}`}
                  title={
                    model.counting === 'exact'
                      ? 'Counted with this model’s own tokenizer.'
                      : 'No public tokenizer for this family — approximated and labelled.'
                  }
                >
                  {model.counting}
                </span>
                {overTier && (
                  <span
                    className="badge badge--tier"
                    title={`Priced at the long-context rate: this prompt is over ${
                      model.tier!.threshold / 1000
                    }K tokens.`}
                  >
                    {model.tier!.threshold / 1000}K+ rate
                  </span>
                )}
              </div>
              <div
                className="ladder__bar"
                style={
                  {
                    '--w': `${max ? (cost / max) * 100 : 0}%`,
                  } as React.CSSProperties
                }
              />
              <div className="ladder__figures mono">
                <span>{money(cost)}</span>
                <span className="ladder__sub">
                  {inTok.toLocaleString()} in · {model.brand}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="picker">
        <div className="picker__bar">
          <input
            type="search"
            className="picker__search"
            value={query}
            placeholder="Filter by model or provider"
            aria-label="Filter models"
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="picker__toggle">
            <input
              type="checkbox"
              checked={showDeprecated}
              onChange={(e) => setShowDeprecated(e.target.checked)}
            />
            Show deprecated
          </label>
          {selected.length > 0 && (
            <button
              type="button"
              className="picker__clear"
              onClick={() => setSelected([])}
            >
              Clear {selected.length}
            </button>
          )}
        </div>

        {groups.map((g) => (
          <div key={g.name} className="picker__group">
            <span className="picker__provider">{g.name}</span>
            <div className="picker__chips">
              {g.models.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  className="picker__chip"
                  aria-pressed={selected.includes(m.slug)}
                  onClick={() => toggle(m.slug)}
                  title={`$${m.input} in / $${m.output} out per 1M`}
                >
                  {m.name}
                  {m.deprecatedOn && <span className="picker__dep">dep</span>}
                </button>
              ))}
              {g.hidden > 0 && <span className="picker__hidden">+{g.hidden}</span>}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <p className="ledger__empty">
            Nothing matches “{query}”. Try a provider like “claude” or “kimi”.
          </p>
        )}
      </div>

      <style>{`
        .ledger { margin-block: 1.5rem 0; }
        .ledger__label {
          display: block; font-family: var(--font-mono); font-size: .7rem;
          letter-spacing: .11em; text-transform: uppercase; color: var(--ink-faint);
          margin-bottom: .5rem;
        }
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

        .strip {
          display: flex; flex-wrap: wrap; gap: 2px; margin-top: 1rem;
          padding: .75rem; max-height: 9rem; overflow-y: auto;
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--paper-raised);
        }
        .strip__tok {
          font-family: var(--font-mono); font-size: .78rem; line-height: 1.35;
          padding: .1em .28em; border-radius: 2px; white-space: pre; color: var(--ink);
        }
        .strip__tok[data-mod="0"] { background: color-mix(in oklab, var(--cheap) 18%, transparent); }
        .strip__tok[data-mod="1"] { background: color-mix(in oklab, var(--mid) 16%, transparent); }
        .strip__tok[data-mod="2"] { background: color-mix(in oklab, var(--dear) 14%, transparent); }
        .strip__tok[data-mod="3"] { background: color-mix(in oklab, var(--cheap) 30%, transparent); }
        .strip__tok[data-mod="4"] { background: color-mix(in oklab, var(--mid) 28%, transparent); }
        .strip__tok[data-mod="5"] { background: color-mix(in oklab, var(--dear) 24%, transparent); }
        .strip__more { font-family: var(--font-mono); font-size: .75rem; color: var(--ink-faint); align-self: center; padding-left: .4rem; }

        .controls {
          border: 0; border-top: 1px solid var(--rule); padding: 1.25rem 0 0;
          margin: 1.5rem 0 0; display: flex; gap: 2rem; flex-wrap: wrap; align-items: flex-end;
        }
        .controls legend {
          font-family: var(--font-mono); font-size: .7rem; letter-spacing: .11em;
          text-transform: uppercase; color: var(--ink-faint); padding: 0;
        }
        .controls__presets { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; }
        .controls__preset {
          font-size: .8rem; cursor: pointer; padding: .35em .7em;
          border: 1px solid var(--rule-strong); border-radius: var(--radius);
          background: transparent; color: var(--ink-soft);
        }
        .controls__preset[aria-pressed="true"] {
          background: var(--ink); color: var(--paper); border-color: var(--ink);
        }
        .controls__derived { font-size: .78rem; color: var(--ink-faint); margin-left: .3rem; }
        .controls__calls {
          display: flex; flex-direction: column; gap: .3rem; font-size: .78rem; color: var(--ink-soft);
        }
        .controls__calls input {
          width: 7rem; padding: .35em .55em; font-size: .9rem; color: var(--ink);
          background: var(--paper-raised); border: 1px solid var(--rule-strong);
          border-radius: var(--radius);
        }

        .ladder { list-style: none; margin: 2rem 0 0; padding: 0; }
        .ladder__row {
          display: grid; grid-template-columns: minmax(0, 16rem) 1fr auto;
          gap: 1rem; align-items: center; padding: .7rem 0; border-bottom: 1px solid var(--rule);
        }
        .ladder__head { display: flex; align-items: center; gap: .4rem; min-width: 0; flex-wrap: wrap; }
        .ladder__head a {
          font-weight: 500; font-size: .9rem; text-decoration: none; color: var(--ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ladder__head a:hover { text-decoration: underline; }
        .badge--tier { color: var(--dear); }
        .ladder__bar {
          height: 10px; border-radius: 2px; min-width: 2px; width: var(--w);
          background: linear-gradient(90deg, var(--cheap), var(--mid) 55%, var(--dear));
          background-size: 40rem 100%;
        }
        .ladder__figures { display: flex; flex-direction: column; align-items: flex-end; }
        .ladder__figures > span:first-child { font-size: 1rem; font-weight: 600; }
        .ladder__sub { font-size: .7rem; color: var(--ink-faint); }
        .ledger__empty { color: var(--ink-soft); margin-top: 1.5rem; }

        .picker { margin-top: 2.25rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
        .picker__bar { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .picker__search {
          flex: 1 1 14rem; min-width: 0; padding: .45rem .65rem; font-size: .88rem;
          font-family: var(--font-body); color: var(--ink); background: var(--paper-raised);
          border: 1px solid var(--rule-strong); border-radius: var(--radius);
        }
        .picker__toggle { display: flex; align-items: center; gap: .35rem; font-size: .78rem; color: var(--ink-soft); white-space: nowrap; }
        .picker__clear {
          font-size: .74rem; cursor: pointer; padding: .3em .6em; background: transparent;
          color: var(--ink-soft); border: 1px solid var(--rule-strong); border-radius: var(--radius);
        }
        .picker__clear:hover { color: var(--ink); border-color: var(--ink); }

        .picker__group {
          display: grid; grid-template-columns: 6.5rem 1fr; gap: 1rem;
          align-items: start; padding: .45rem 0;
        }
        .picker__provider {
          font-family: var(--font-mono); font-size: .7rem; letter-spacing: .06em;
          text-transform: uppercase; color: var(--ink-faint); padding-top: .4em;
        }
        .picker__chips { display: flex; flex-wrap: wrap; gap: .3rem; }
        .picker__chip {
          display: inline-flex; align-items: center; gap: .3em;
          font-family: var(--font-mono); font-size: .73rem; cursor: pointer;
          padding: .28em .6em; border-radius: var(--radius);
          border: 1px solid var(--rule); background: transparent; color: var(--ink-soft);
        }
        .picker__chip:hover { border-color: var(--rule-strong); color: var(--ink); }
        .picker__chip[aria-pressed="true"] {
          background: var(--ink); color: var(--paper); border-color: var(--ink);
        }
        .picker__dep { font-size: .62rem; opacity: .65; text-transform: uppercase; }
        .picker__hidden { font-family: var(--font-mono); font-size: .7rem; color: var(--ink-faint); align-self: center; }

        @media (max-width: 640px) {
          .ladder__row { grid-template-columns: 1fr auto; }
          .ladder__bar { grid-column: 1 / -1; order: 3; }
          .picker__group { grid-template-columns: 1fr; gap: .35rem; }
        }
      `}</style>
    </div>
  );
}
