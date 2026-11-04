import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOARD_TOKENS, CAP_RED, SURFACE_KEYS, contrastRatio, swatchRingFor, parseHex,
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

describe('■ Stop: a neutral fill, the strongest button (B13 follow-up)', () => {
  it('its words (the page colour on the text colour) reach 4.5:1, and the button 3:1 against every panel, in both modes', () => {
    forEachMode((p, mode) => {
      expect(contrastRatio(p.bg, p.fg), `${mode} words`).toBeGreaterThanOrEqual(4.5);
      for (const surface of SURFACE_KEYS) {
        expect(contrastRatio(p.fg, p[surface]), `${mode} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

describe('the Simple iPad page: the blue of New idea and the teal of the chosen sound (spec 2026-11-04)', () => {
  it('their words reach 4.5:1 on their own fill, and each fill 3:1 against every surface, in both modes', () => {
    forEachMode((p, mode) => {
      expect(contrastRatio(p.cueFg, p.cue), `${mode} New idea words`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.pickFg, p.pick), `${mode} chosen sound words`).toBeGreaterThanOrEqual(4.5);
      for (const surface of SURFACE_KEYS) {
        expect(contrastRatio(p.cue, p[surface]), `${mode} New idea on ${surface}`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(p.pick, p[surface]), `${mode} chosen sound on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('they are not the text colour and not the warning colour, so each row looks different', () => {
    forEachMode((p) => {
      for (const c of [p.cue, p.pick]) {
        expect(c).not.toBe(p.fg);
        expect(c).not.toBe(p.warn);
      }
      expect(p.cue).not.toBe(p.pick);
    });
  });

  it('the stylesheet mirrors them', () => {
    const css = readFileSync('src/ui/screens/boardSequencer/theme/boardTheme.css', 'utf8');
    for (const mode of MODES) {
      const p = BOARD_TOKENS.calm[mode];
      const block = css.slice(css.indexOf(`[data-bs-mode='${mode}'] {`));
      for (const [key, name] of [['cue', 'cue'], ['cueFg', 'cue-fg'], ['pick', 'pick'], ['pickFg', 'pick-fg'], ['lit', 'lit'], ['litFg', 'lit-fg'], ['litGlow', 'lit-glow']] as const) {
        expect(block.slice(0, block.indexOf('}')), `${mode} ${name}`).toContain(`--bs-${name}: ${p[key]};`);
      }
    }
  });
});

describe('the Simple iPad page: playing is lit, silent is dark (owner, 4 Nov 2026)', () => {
  it('the lit fill: its words reach 4.5:1, and its edge 3:1 against every surface, in both modes', () => {
    forEachMode((p, mode) => {
      expect(contrastRatio(p.litFg, p.lit), `${mode} words on lit`).toBeGreaterThanOrEqual(4.5);
      for (const surface of SURFACE_KEYS) {
        expect(contrastRatio(p.lit, p[surface]), `${mode} lit on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('lit is its own colour: not the blue of New idea, the teal of a chosen sound, the text colour or a warning', () => {
    forEachMode((p) => {
      for (const other of [p.cue, p.pick, p.fg, p.warn, p.danger]) expect(p.lit).not.toBe(other);
    });
  });

  it('the glow is the lit colour, see-through', () => {
    forEachMode((p) => {
      const { r, g, b } = parseHex(p.lit);
      expect(p.litGlow).toMatch(new RegExp(`^rgba\\(${r}, ${g}, ${b}, 0\\.\\d+\\)$`));
    });
  });
});

describe("Timbo's cap red (the logo, and the hat's marker on the audience screen)", () => {
  it('is seen at 3:1 on both grounds, dark and light, and on every surface', () => {
    expect(contrastRatio(CAP_RED, BOARD_TOKENS.calm.dark.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(CAP_RED, BOARD_TOKENS.calm.light.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(CAP_RED, '#0e0f11')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(CAP_RED, '#f4f4f5')).toBeGreaterThanOrEqual(3);
    forEachMode((p) => {
      for (const surface of SURFACE_KEYS) expect(contrastRatio(CAP_RED, p[surface]), surface).toBeGreaterThanOrEqual(3);
    });
    // The audience screen's own dark.
    expect(contrastRatio(CAP_RED, '#05060a')).toBeGreaterThanOrEqual(3);
  });

  it('is a clear red: red well above green and blue', () => {
    const { r, g, b } = parseHex(CAP_RED);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(r * 0.35);
    expect(b).toBeLessThan(r * 0.35);
  });
});
