import { contrastRatio, swatchRingFor, type BoardPalette } from '../theme/boardTokens';

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
 * A counter's real colour as a flat disc (L3), ringed only when it would otherwise vanish:
 * a black counter on a dark panel, or a white one on a light panel. Numbered, so colour is
 * never the only way to tell two counters apart.
 */
export function SwatchChip({ swatch, palette, surface, number, size = 28 }: SwatchChipProps): JSX.Element {
  const on = surface ?? palette.raised;
  const { inner, outer } = swatchRingFor(swatch, on, palette);
  const needsRing = contrastRatio(swatch, on) < 3;
  return (
    <span
      aria-hidden="true"
      // The numeral is drawn to fit the round swatch (size x 0.45), not set in the text scale.
      data-swatch
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: swatch,
        boxShadow: needsRing ? `0 0 0 2px ${inner}, 0 0 0 4px ${outer}` : undefined,
        color: inner,
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
      }}
    >
      {number ?? ''}
    </span>
  );
}
