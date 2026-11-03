import { forwardRef, useId } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { UNDERLINE_ON } from './text';

/**
 * primary: the one main action of a view (a filled pill in the text colour). selected: a choice
 * that is on (semibold, its words underlined, L1), never filled. danger: ■ Stop, filled in the
 * text colour, bold, never a hue. secondary: a pill with a hairline edge. quiet: plain words.
 */
export type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger' | 'selected';

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
  primary: { background: 'var(--bs-accent)', color: 'var(--bs-accent-fg)', borderColor: 'var(--bs-accent)', fontWeight: 600 },
  secondary: { background: 'transparent', color: 'var(--bs-fg)', borderColor: 'var(--bs-border-control)', fontWeight: 500 },
  quiet: { background: 'transparent', color: 'var(--bs-fg2)', borderColor: 'transparent', fontWeight: 500 },
  // ■ Stop and the like: the strongest button by weight, never by hue. The danger colours are
  // close to the red and orange counters, which are reserved for the board.
  danger: { background: 'var(--bs-fg)', color: 'var(--bs-bg)', borderColor: 'var(--bs-fg)', fontWeight: 800 },
  // Semibold with its words underlined (L1): no tint, no edge, never colour alone.
  selected: { background: 'transparent', color: 'var(--bs-fg)', borderColor: 'transparent', fontWeight: 600 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'secondary', children, reason = null, reserveReason = false, full = false, disabled, style, className, ...rest }, ref,
) {
  const reasonId = useId();
  const describedBy = [rest['aria-describedby'], reason ? reasonId : null].filter(Boolean).join(' ') || undefined;
  const button = (
    <button
      ref={ref}
      type="button"
      className={className}
      disabled={disabled || reason !== null}
      style={{
        ...TONE_STYLE[tone],
        // The edge a pressed button keeps (the stylesheet beats the app's orange ring with it).
        ['--bs-pressed-edge' as string]: TONE_STYLE[tone].borderColor,
        minHeight: 'var(--bs-target)',
        borderRadius: 'var(--bs-radius-pill)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        ...style,
      } as CSSProperties}
      {...rest}
      aria-describedby={describedBy}
    >
      {tone === 'selected'
        ? <span data-words="" style={{ borderBottom: UNDERLINE_ON, paddingBottom: 1 }}>{children}</span>
        : children}
    </button>
  );
  if (reason === null && !reserveReason) return button;
  return (
    <span style={{ display: full ? 'block' : 'inline-block', ...(reserveReason ? { position: 'relative', paddingBottom: 16 } : {}) }}>
      {button}
      {/* Reserved space: showing a reason must never shift what sits under the pointer. */}
      <span id={reasonId} style={{
        display: 'block', minHeight: 16, fontSize: 14, color: 'var(--bs-fg2)',
        // Reserved: exactly one line, whatever the reason says, so its coming and going
        // moves nothing (a wrapped reason was taller than the space kept for it). Out of the
        // flow, so a reason wider than the button never widens its place either: the header
        // re-wrapped when "Stop playing to switch player" came (B25).
        ...(reserveReason ? { position: 'absolute', right: 0, bottom: 0, height: 16, lineHeight: '16px', whiteSpace: 'nowrap' } : {}),
      }}
      >
        {reason}
      </span>
    </span>
  );
});
