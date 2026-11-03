/**
 * The Board Sequencer's design tokens, in one place.
 *
 * `boardTheme.css` mirrors these values as CSS custom properties; this module is the
 * source of truth and is what the contrast test checks. Keeping the numbers here also
 * lets components compute against them (see `swatchRingFor`), and makes a second style
 * (Swiss minimal) a matter of adding another block rather than editing components.
 */

export type BoardStyle = 'calm';
export type BoardMode = 'dark' | 'light';

export interface BoardPalette {
  bg: string;
  raised: string;
  elev: string;
  hi: string;
  warnTint: string;
  fg: string;
  fg2: string;
  fg3: string;
  accent: string;
  accentFg: string;
  ok: string;
  warn: string;
  warnFg: string;
  danger: string;
  dangerFg: string;
  border: string;
  borderControl: string;
  focus: string;
  swatchRingLight: string;
  swatchRingDark: string;
}

export const BOARD_TOKENS: Record<BoardStyle, Record<BoardMode, BoardPalette>> = {
  // The instrument look (spec 2026-11-03): a near-black ground, the chrome monochrome, the
  // accent the text colour itself. Colour is for the counters and the warnings.
  calm: {
    dark: {
      bg: '#0e0f11',
      raised: '#16181b',
      elev: '#1c1e22',
      hi: '#24262b',
      warnTint: '#26231a',
      fg: '#f2f2f2',
      fg2: '#a6aab2',
      fg3: '#8e929a',
      accent: '#f2f2f2',
      accentFg: '#0e0f11',
      ok: '#f2f2f2',
      warn: '#e9cf8f',
      warnFg: '#2a2413',
      danger: '#f0a598',
      dangerFg: '#2a1512',
      border: '#202226',
      borderControl: '#6f747d',
      focus: '#f2f2f2',
      swatchRingLight: '#f2f2f2',
      swatchRingDark: '#0e0f11',
    },
    light: {
      bg: '#f4f4f5',
      raised: '#ebebed',
      elev: '#e2e3e6',
      hi: '#d8d9dd',
      warnTint: '#f3eddc',
      fg: '#141414',
      fg2: '#4a4e56',
      fg3: '#585c64',
      accent: '#141414',
      accentFg: '#ffffff',
      ok: '#141414',
      warn: '#6e5410',
      warnFg: '#ffffff',
      danger: '#a4231b',
      dangerFg: '#ffffff',
      border: '#e0e1e4',
      borderControl: '#7a7e86',
      focus: '#141414',
      swatchRingLight: '#ffffff',
      swatchRingDark: '#141414',
    },
  },
};

/** Surfaces any text or control can sit on. The contrast contract covers all of them. */
export const SURFACE_KEYS = ['bg', 'raised', 'elev', 'hi', 'warnTint'] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

export interface Rgb { r: number; g: number; b: number }

/** Parse `#rgb` or `#rrggbb` (the only forms used by the tokens). */
export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance(colour: string | Rgb): number {
  const { r, g, b } = typeof colour === 'string' ? parseHex(colour) : colour;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio, 1:1 … 21:1. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The ring to draw around a counter swatch so both the swatch and the ring stay visible.
 * A black counter on a dark panel, and a white one on a light panel, would otherwise
 * vanish into the surface: the inner ring separates the swatch, the outer one separates
 * the ring from the surface. Colour is never the only signal, but it must still be seen.
 */
export function swatchRingFor(
  swatch: string, surface: string, palette: BoardPalette,
): { inner: string; outer: string } {
  const light = palette.swatchRingLight;
  const dark = palette.swatchRingDark;
  const inner = contrastRatio(light, swatch) >= contrastRatio(dark, swatch) ? light : dark;
  const outer = contrastRatio(light, surface) >= contrastRatio(dark, surface) ? light : dark;
  return { inner, outer };
}

/**
 * The playhead's marker on the board: the text colour, well over 3:1 against the column's
 * tint in both modes (B9). Never a counter hue.
 */
export function playheadColour(palette: BoardPalette): string {
  return palette.fg;
}
