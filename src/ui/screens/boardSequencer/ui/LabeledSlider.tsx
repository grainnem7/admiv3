import { useId } from 'react';

export interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  /** The value as the player reads it, e.g. "96 BPM" or "62%". */
  display?: string;
  disabled?: boolean;
  /** Why it's disabled; shown in reserved space and used as the description. */
  reason?: string | null;
}

/**
 * A slider with a real `<label for>`, its value in text, and a reason when it's disabled.
 * The minimum always sits at the left, in both handedness layouts.
 */
export function LabeledSlider({
  label, value, min, max, step = 1, onChange, display, disabled = false, reason = null,
}: LabeledSliderProps): JSX.Element {
  const id = useId();
  const reasonId = `${id}-reason`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--bs-fg2)' }}>{display ?? String(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled || reason !== null}
        aria-describedby={reason ? reasonId : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ minHeight: 'var(--bs-target)', background: 'transparent', border: 'none' }}
      />
      {/* Reserved space so a reason appearing never shifts the layout under the pointer. */}
      <span id={reasonId} style={{ minHeight: 16, fontSize: 12, color: 'var(--bs-fg2)' }}>
        {reason ?? ''}
      </span>
    </div>
  );
}
