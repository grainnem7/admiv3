import type { CSSProperties } from 'react';

/**
 * The instrument look's type (L1): three jobs for text beyond the body.
 * - A caption names a section or a control: small capitals in the third text colour.
 * - A readout is a number read at a glance (the speed, the step, the clock): light and tabular.
 * - A unit sits beside a readout, as a caption does.
 * Sizes stay on the 14 / 16 / 20 scale (A10).
 */
export const CAPTION_STYLE: CSSProperties = {
  fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bs-fg3)',
};

export const READOUT_STYLE: CSSProperties = {
  fontSize: 20, fontWeight: 300, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1,
};

export const UNIT_STYLE: CSSProperties = { ...CAPTION_STYLE };

/** The thin line under a chosen word (a choice, a tab, a view): never colour alone. */
export const UNDERLINE_ON = '1px solid currentColor';
export const UNDERLINE_OFF = '1px solid transparent';
