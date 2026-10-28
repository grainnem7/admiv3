import { forwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  tone?: ButtonTone;
  children: ReactNode;
  /**
   * Why the button is disabled, shown in reserved space beneath it and tied to the button
   * as its description, so a screen reader says why too — a disabled control that doesn't
   * say why is a dead end.
   */
  reason?: string | null;
  /**
   * Keep the reason's space even with no reason: for a button whose reason comes and goes
   * while the player works (the Player button while playing), so nothing near it moves.
   */
  reserveReason?: boolean;
  full?: boolean;
}

const TONE_STYLE: Record<ButtonTone, CSSProperties> = {
  primary: { background: 'var(--bs-accent)', color: 'var(--bs-accent-fg)', borderColor: 'var(--bs-accent)' },
  secondary: { background: 'var(--bs-raised)', color: 'var(--bs-fg)' },
  quiet: { background: 'transparent', color: 'var(--bs-fg2)', borderColor: 'transparent' },
  danger: { background: 'var(--bs-danger)', color: 'var(--bs-danger-fg)', borderColor: 'var(--bs-danger)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'secondary', children, reason = null, reserveReason = false, full = false, disabled, style, ...rest }, ref,
) {
  const reasonId = useId();
  const describedBy = [rest['aria-describedby'], reason ? reasonId : null].filter(Boolean).join(' ') || undefined;
  const button = (
    <button
      ref={ref}
      type="button"
      disabled={disabled || reason !== null}
      style={{
        ...TONE_STYLE[tone],
        minHeight: 'var(--bs-target)',
        borderRadius: 'var(--bs-radius-md)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        ...style,
      }}
      {...rest}
      aria-describedby={describedBy}
    >
      {children}
    </button>
  );
  if (reason === null && !reserveReason) return button;
  return (
    <span style={{ display: full ? 'block' : 'inline-block' }}>
      {button}
      {/* Reserved space: showing a reason must never shift what sits under the pointer. */}
      <span id={reasonId} style={{
        display: 'block', minHeight: 16, fontSize: 12, color: 'var(--bs-fg2)',
        // Reserved: exactly one line, whatever the reason says, so its coming and going
        // moves nothing (a wrapped reason was taller than the space kept for it).
        ...(reserveReason ? { height: 16, lineHeight: '16px', whiteSpace: 'nowrap' } : {}),
      }}
      >
        {reason}
      </span>
    </span>
  );
});
