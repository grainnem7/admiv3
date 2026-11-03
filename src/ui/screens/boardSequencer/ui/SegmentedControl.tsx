import { useId, useRef } from 'react';
import { CAPTION_STYLE, UNDERLINE_OFF, UNDERLINE_ON } from './text';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  /** Extra context for screen readers, e.g. a hint about a non-dividing grid size. */
  hint?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange(value: T): void;
  disabled?: boolean;
  name?: string;
  /**
   * Show the question above the choices (A14). Off where the words just above already ask
   * it ("Band" over Off / Quiet / Full), so it is never said twice.
   */
  showLabel?: boolean;
}

/**
 * A radiogroup rendered as a row of words (L1): the chosen one in the text colour, semibold,
 * with a thin underline under its words; the rest grey. Arrow keys move the selection (as a
 * radiogroup should), and only the selected option is in the tab order, so Tab still steps
 * through the form rather than through every option. Each word is still a 44 px target.
 */
export function SegmentedControl<T extends string | number>({
  label, value, options, onChange, disabled = false, name, showLabel = false,
}: SegmentedControlProps<T>): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // A generated id, because the label is prose: "How a loop pad works-hint-hold" parses as
  // several IDREFs that don't exist, so the hint was never announced at all.
  const base = useId();
  const hintId = (value: string): string => `${base}-hint-${value.replace(/\W+/g, '-')}`;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (delta: number): void => {
    if (disabled || options.length === 0) return;
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const group = (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', columnGap: 18, rowGap: 0, flexWrap: 'wrap' }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Home') { e.preventDefault(); move(-index); }
        else if (e.key === 'End') { e.preventDefault(); move(options.length - 1 - index); }
      }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            aria-describedby={o.hint ? hintId(String(o.value)) : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              minHeight: 'var(--bs-target)',
              padding: 0,
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 0,
              color: selected ? 'var(--bs-fg)' : 'var(--bs-fg3)',
              fontWeight: selected ? 600 : 500,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span data-words="" style={{ borderBottom: selected ? UNDERLINE_ON : UNDERLINE_OFF, paddingBottom: 1 }}>{o.label}</span>
            {o.hint && (
              <span id={hintId(String(o.value))} hidden>{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
  if (!showLabel) return group;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span aria-hidden="true" style={CAPTION_STYLE}>{label}</span>
      {group}
    </div>
  );
}
