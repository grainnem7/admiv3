/**
 * The instrument look (spec 2026-11-03, L1): circles, dots and lines on a near-black ground,
 * nothing boxed, the chrome monochrome. These checks keep the stylesheet and the tokens to it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BOARD_TOKENS, contrastRatio, relativeLuminance } from '../ui/screens/boardSequencer/theme/boardTokens';

const css = readFileSync('src/ui/screens/boardSequencer/theme/boardTheme.css', 'utf8');

describe('L1: the tokens are monochrome, the ground near black or near white', () => {
  it('the accent is the text colour in both modes: colour is for the counters', () => {
    for (const mode of ['dark', 'light'] as const) {
      const p = BOARD_TOKENS.calm[mode];
      expect(p.accent).toBe(p.fg);
      expect(p.focus).toBe(p.fg);
      expect(p.ok).toBe(p.fg);
    }
  });

  it('dark is near black, light near white, and the surfaces step by a little', () => {
    const d = BOARD_TOKENS.calm.dark;
    const l = BOARD_TOKENS.calm.light;
    expect(relativeLuminance(d.bg)).toBeLessThan(0.01);
    expect(relativeLuminance(l.bg)).toBeGreaterThan(0.88);
    for (const p of [d, l]) {
      expect(contrastRatio(p.bg, p.raised)).toBeLessThan(1.4);
      expect(contrastRatio(p.raised, p.elev)).toBeLessThan(1.4);
    }
  });

  it('the stylesheet mirrors the tokens', () => {
    for (const mode of ['dark', 'light'] as const) {
      const p = BOARD_TOKENS.calm[mode];
      const block = css.slice(css.indexOf(`[data-bs-mode='${mode}'] {`));
      for (const [key, name] of [['bg', 'bg'], ['raised', 'raised'], ['elev', 'elev'], ['hi', 'hi'], ['fg', 'fg'], ['fg2', 'fg2'], ['fg3', 'fg3'], ['accent', 'accent'], ['border', 'border'], ['borderControl', 'border-control']] as const) {
        expect(block, `${mode} ${name}`).toContain(`--bs-${name}: ${p[key]};`);
      }
    }
  });
});

describe('L1: nothing boxed', () => {
  it('no shadows anywhere in the stylesheet', () => {
    expect(css).toContain('--bs-shadow: none;');
    expect(css.split('\n').filter((l) => /box-shadow:/.test(l) && !/box-shadow:\s*(none|var\(--bs-shadow\))\s*;/.test(l))).toEqual([]);
  });

  it('the panel is not a card: no edge, no fill of its own, and only its padding', () => {
    const panel = css.slice(css.indexOf('.bs-root .bs-panel {'));
    const rule = panel.slice(0, panel.indexOf('}'));
    expect(rule).not.toMatch(/border:/);
    expect(rule).not.toMatch(/background/);
    expect(css).not.toMatch(/\.bs-panel \{\s*background: #/);
  });

  it('a pressed or chosen control is never tinted: the stylesheet draws no ● and no tint', () => {
    expect(css).not.toContain('.bs-selected::before');
  });

  it('the radii are small, with the pill kept for buttons', () => {
    expect(css).toMatch(/--bs-radius-sm: 4px;/);
    expect(css).toMatch(/--bs-radius-md: 6px;/);
    expect(css).toMatch(/--bs-radius-pill: 999px;/);
  });
});
