import { Note } from './explain';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  hint?: string;
}

/** An on/off control that reads as a switch, with the state in text as well as position. */
export function Switch({ label, checked, onChange, disabled = false, hint }: SwitchProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // Words and a track on the page (L1): no box round them.
        style={{
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
          minHeight: 'var(--bs-target)', borderRadius: 0, padding: 0,
          background: 'transparent', border: 'none', textAlign: 'left',
        }}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            color: checked ? 'var(--bs-fg)' : 'var(--bs-fg3)', fontWeight: 600,
          }}
        >
          {/* The word, not only the track position: state is never shape or colour alone. */}
          {checked ? 'On' : 'Off'}
          <span
            style={{
              width: 34, height: 20, borderRadius: 999, position: 'relative', boxSizing: 'border-box',
              background: checked ? 'var(--bs-fg)' : 'transparent',
              border: `1px solid ${checked ? 'var(--bs-fg)' : 'var(--bs-border-control)'}`,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14,
              borderRadius: '50%', background: checked ? 'var(--bs-bg)' : 'var(--bs-fg3)',
            }}
            />
          </span>
        </span>
      </button>
      {hint && <Note>{hint}</Note>}
    </div>
  );
}
