import { useRef } from 'react';

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
}

/**
 * A radiogroup rendered as a row of buttons. Arrow keys move the selection (as a
 * radiogroup should), and only the selected option is in the tab order, so Tab still
 * steps through the form rather than through every option.
 */
export function SegmentedControl<T extends string | number>({
  label, value, options, onChange, disabled = false, name,
}: SegmentedControlProps<T>): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (delta: number): void => {
    if (disabled || options.length === 0) return;
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
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
            aria-describedby={o.hint ? `${name ?? label}-hint-${String(o.value)}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              minHeight: 'var(--bs-target)',
              borderRadius: 'var(--bs-radius-md)',
              // Selected state carries a fill AND a heavier border: never colour alone.
              background: selected ? 'var(--bs-accent)' : 'var(--bs-raised)',
              color: selected ? 'var(--bs-accent-fg)' : 'var(--bs-fg)',
              borderColor: selected ? 'var(--bs-accent)' : 'var(--bs-border-control)',
              borderWidth: selected ? 2 : 1,
              fontWeight: selected ? 600 : 400,
            }}
          >
            {o.label}
            {o.hint && (
              <span id={`${name ?? label}-hint-${String(o.value)}`} hidden>{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
