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
  calm: {
    dark: {
      bg: '#1f2430',
      raised: '#262c39',
      elev: '#2f3645',
      hi: '#353d4e',
      warnTint: '#343536',
      fg: '#e7e9ee',
      fg2: '#c3c8d3',
      fg3: '#a3aab8',
      accent: '#9fd8c4',
      accentFg: '#14201c',
      ok: '#9fd8c4',
      warn: '#e9cf8f',
      warnFg: '#2a2413',
      danger: '#f0a598',
      dangerFg: '#2a1512',
      border: '#343c4d',
      borderControl: '#7a8497',
      focus: '#9fd8c4',
      swatchRingLight: '#e7e9ee',
      swatchRingDark: '#14171f',
    },
    light: {
      bg: '#eef0f3',
      raised: '#ffffff',
      elev: '#e6eaf0',
      hi: '#dce1e8',
      warnTint: '#f5efdf',
      fg: '#232833',
      fg2: '#434a58',
      fg3: '#555c6b',
      accent: '#23675a',
      accentFg: '#ffffff',
      ok: '#23675a',
      warn: '#6e5410',
      warnFg: '#ffffff',
      danger: '#a4231b',
      dangerFg: '#ffffff',
      border: '#e1e5eb',
      borderControl: '#7b8494',
      focus: '#23675a',
      swatchRingLight: '#ffffff',
      swatchRingDark: '#232833',
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
