/**
 * The audience view's colours and sparks (owner, 7 Nov 2026: "not primary colours and looking
 * simple and childish; the hue could change as the piece changes"). Pure.
 *
 * - Each counter's colour is turned into a richer, softer shade within the scene's palette: its
 *   hue is laid round the scene's own hue (keeping the counters' colours apart), its saturation
 *   eased and its lightness lifted, so nothing is a flat primary and nothing is too dark to see.
 * - Each scene has its own hue (a few moods: teal, indigo, violet, rose, amber, sea), the same
 *   every time; the screen glides to the next scene's over a few seconds, the short way round.
 * - A note lets a few sparks go: they drift up and fade.
 */
import type { Rgb } from './light';

/** The moods a scene's hue is chosen from: teal, indigo, violet, rose, amber, sea. */
const MOODS = [185, 235, 275, 330, 35, 160];
/** With no scene, a calm blue. */
const NO_SCENE_HUE = 210;
/** How far a counter's own hue spreads round the scene's: its difference from red, scaled. */
const SPREAD = 0.45;

export function hslOf([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function rgbOf(h: number, s: number, l: number): Rgb {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** A counter's colour as the audience sees it, within the scene's hue `base`. */
export function refine(rgb: Rgb, base: number): Rgb {
  const { h, s, l } = hslOf(rgb);
  // Grey, white or black: a pale light in the scene's own hue.
  if (s < 0.12) return rgbOf(((base % 360) + 360) % 360, 0.28, 0.7);
  const off = ((h + 540) % 360) - 180;
  const hue = (((base + off * SPREAD) % 360) + 360) % 360;
  const sat = Math.min(0.66, 0.42 + 0.22 * s);
  const light = Math.max(0.56, Math.min(0.72, 0.5 + 0.25 * l));
  return rgbOf(hue, sat, light);
}

/** A scene's hue, the same every time; with none, a calm blue. */
export function sceneHue(scene: string | null): number {
  if (!scene) return NO_SCENE_HUE;
  // FNV-1a: neighbouring names land far apart.
  let n = 0x811c9dc5;
  for (let i = 0; i < scene.length; i++) { n ^= scene.charCodeAt(i); n = Math.imul(n, 0x01000193) >>> 0; }
  return MOODS[n % MOODS.length];
}

/** The hue `dt` seconds on, gliding to `target` the short way round (most of the way in about 6 s). */
export function glideHue(cur: number, target: number, dt: number): number {
  const d = ((target - cur + 540) % 360) - 180;
  const k = 1 - Math.exp(-dt / 2.5);
  return (((cur + d * k) % 360) + 360) % 360;
}

/** A note's sparks: how many, how long they last, how far they rise (in squares). */
export const SPARK = { count: 5, seconds: 2.4, rise: 1.6 } as const;

/** Where a note's sparks are `age` seconds on, off its light (in squares), and how bright. */
export function sparksOf(row: number, col: number, age: number, reduced: boolean): { dx: number; dy: number; alpha: number; size: number }[] {
  if (reduced || age < 0 || age > SPARK.seconds) return [];
  const u = age / SPARK.seconds;
  const out: { dx: number; dy: number; alpha: number; size: number }[] = [];
  for (let i = 0; i < SPARK.count; i++) {
    const seed = Math.sin((row * 97 + col * 13 + i * 7.7) * 12.9898) * 43758.5453;
    const r = seed - Math.floor(seed);
    const side = (r - 0.5) * 0.9;
    const rise = SPARK.rise * (0.6 + 0.4 * ((r * 3.1) % 1));
    out.push({
      dx: side * u + 0.08 * Math.sin(age * 3 + i),
      dy: -rise * (1 - (1 - u) ** 2),
      alpha: 0.55 * (1 - u) ** 1.4,
      size: 0.05 + 0.04 * ((r * 5.3) % 1),
    });
  }
  return out;
}
