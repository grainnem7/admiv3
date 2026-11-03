// A row of named steps (Off / A little / More) instead of a slider: a few places to land.
import { SegmentedControl } from '../ui/SegmentedControl';
import { nearest, type Step } from '../../../../audio/soundSteps';
import { Note, NOTE_STYLE } from '../ui/explain';
import { CAPTION_STYLE } from '../ui/text';

/** `hint` explains the choice (shown while Explain the choices is on); `reason` says why it is off (always). */
export function StepRow({ label, steps, value, onPick, disabled = false, hint, reason }: {
  label: string; steps: Step[]; value: number; onPick(v: number): void; disabled?: boolean; hint?: string | null; reason?: string | null;
}): JSX.Element {
  const i = nearest(steps, value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={CAPTION_STYLE}>{label}</span>
      <SegmentedControl<number>
        label={label}
        value={i}
        disabled={disabled}
        onChange={(k) => onPick(steps[k].value)}
        options={steps.map((s, k) => ({ value: k, label: s.label }))}
      />
      {reason && <span style={NOTE_STYLE}>{reason}</span>}
      {hint && <Note>{hint}</Note>}
    </div>
  );
}
