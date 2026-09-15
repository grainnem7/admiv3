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
        style={{
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
          minHeight: 'var(--bs-target)', borderRadius: 'var(--bs-radius-md)',
          background: 'var(--bs-raised)', textAlign: 'left',
        }}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: checked ? 'var(--bs-accent)' : 'var(--bs-fg2)', fontWeight: 600,
          }}
        >
          {/* The word, not only the track position: state is never shape or colour alone. */}
          {checked ? 'On' : 'Off'}
          <span
            style={{
              width: 34, height: 20, borderRadius: 999, position: 'relative',
              background: checked ? 'var(--bs-accent)' : 'var(--bs-elev)',
              border: '1px solid var(--bs-border-control)',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14,
              borderRadius: '50%', background: checked ? 'var(--bs-accent-fg)' : 'var(--bs-fg2)',
            }}
            />
          </span>
        </span>
      </button>
      {hint && <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{hint}</span>}
    </div>
  );
}
