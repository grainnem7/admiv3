// A row of named steps (Off / A little / More) instead of a slider: a few places to land.
import { SegmentedControl } from '../ui/SegmentedControl';
import { nearest, type Step } from '../../../../audio/soundSteps';

export function StepRow({ label, steps, value, onPick, disabled = false, hint }: {
  label: string; steps: Step[]; value: number; onPick(v: number): void; disabled?: boolean; hint?: string | null;
}): JSX.Element {
  const i = nearest(steps, value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{label}</span>
      <SegmentedControl<number>
        label={label}
        value={i}
        disabled={disabled}
        onChange={(k) => onPick(steps[k].value)}
        options={steps.map((s, k) => ({ value: k, label: s.label }))}
      />
      {hint && <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{hint}</span>}
    </div>
  );
}
