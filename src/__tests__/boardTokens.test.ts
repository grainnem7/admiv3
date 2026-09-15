import { describe, it, expect } from 'vitest';
import {
  BOARD_TOKENS, SURFACE_KEYS, contrastRatio, swatchRingFor, parseHex,
  type BoardMode, type BoardPalette,
} from '../ui/screens/boardSequencer/theme/boardTokens';

const MODES: BoardMode[] = ['dark', 'light'];
const TEXT_KEYS = ['fg', 'fg2', 'fg3', 'accent', 'warn', 'danger'] as const;
const STATE_KEYS = ['borderControl', 'focus', 'accent'] as const;
/** State indicators sit on panels, not on the warning tint. */
const STATE_SURFACES = ['bg', 'raised', 'elev'] as const;

const forEachMode = (fn: (palette: BoardPalette, mode: BoardMode) => void): void => {
  for (const mode of MODES) fn(BOARD_TOKENS.calm[mode], mode);
};

describe('contrastRatio', () => {
  it('matches the known extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(parseHex('#abc')).toEqual(parseHex('#aabbcc'));
  });
});

describe('Calm contrast contract', () => {
  it('(a) text colours reach 4.5:1 on every surface, in both modes', () => {
    forEachMode((p, mode) => {
      for (const text of TEXT_KEYS) {
        for (const surface of SURFACE_KEYS) {
          // Name the pair in the failure message: which one fell short matters.
          const pair = `${mode} ${text} on ${surface}`;
          expect({ pair, ok: contrastRatio(p[text], p[surface]) >= 4.5 }).toEqual({ pair, ok: true });
        }
      }
    });
  });

  it('(b) each accent/warn/danger foreground reaches 4.5:1 on its own fill', () => {
    forEachMode((p) => {
      expect(contrastRatio(p.accentFg, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.warnFg, p.warn)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.dangerFg, p.danger)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('(c) borders, focus and state accents reach 3:1 on the panels', () => {
    forEachMode((p) => {
      for (const key of STATE_KEYS) {
        for (const surface of STATE_SURFACES) {
          expect(contrastRatio(p[key], p[surface])).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });
});

describe('swatchRingFor', () => {
  it('keeps black and white counters visible on a panel in both modes', () => {
    forEachMode((p) => {
      for (const swatch of ['#000000', '#ffffff']) {
        const { inner, outer } = swatchRingFor(swatch, p.raised, p);
        expect(contrastRatio(inner, swatch)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(outer, p.raised)).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('a mid-tone counter still gets a ring that separates it', () => {
    const p = BOARD_TOKENS.calm.dark;
    const { inner } = swatchRingFor('#e53935', p.raised, p);
    expect(contrastRatio(inner, '#e53935')).toBeGreaterThanOrEqual(3);
  });
});
