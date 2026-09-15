import { swatchRingFor, type BoardPalette } from '../theme/boardTokens';

export interface SwatchChipProps {
  swatch: string;
  palette: BoardPalette;
  /** The panel the chip sits on, so the outer ring can separate itself from it. */
  surface?: string;
  /** Card number, shown on the chip and matched by the numbers drawn on the video. */
  number?: number;
  size?: number;
}

/**
 * A counter's real colour, ringed so a black counter on a dark panel (or a white one on
 * a light panel) is still visible, and numbered so colour is never the only way to tell
 * two counters apart.
 */
export function SwatchChip({ swatch, palette, surface, number, size = 28 }: SwatchChipProps): JSX.Element {
  const { inner, outer } = swatchRingFor(swatch, surface ?? palette.raised, palette);
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: swatch,
        boxShadow: `0 0 0 2px ${inner}, 0 0 0 4px ${outer}`,
        color: inner,
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
      }}
    >
      {number ?? ''}
    </span>
  );
}
