import { describe, it, expect } from 'vitest';
import { glideHue, hslOf, refine, sceneHue, SPARK, sparksOf } from '../audience/palette';
import type { Rgb } from '../audience/light';

/**
 * The audience view's colours (owner, 7 Nov 2026: "not primary colours and looking simple and
 * childish; the hue could change as the piece changes"): each counter's colour turned into a
 * richer, softer shade within the scene's own palette, which glides as the piece moves on.
 */
const RED: Rgb = [229, 57, 53]; const GREEN: Rgb = [67, 160, 71]; const BLUE: Rgb = [30, 136, 229]; const YELLOW: Rgb = [253, 216, 53];
const BLACK: Rgb = [20, 20, 24]; const WHITE: Rgb = [240, 240, 240];
const hueGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('the colours: no primaries, the scene’s palette', () => {
  it('every counter colour comes out softer and lighter: never a full primary, never too dark to see', () => {
    for (const base of [0, 90, 185, 275]) {
      for (const c of [RED, GREEN, BLUE, YELLOW, BLACK, WHITE]) {
        const out = hslOf(refine(c, base));
        expect(out.s, `${c} at ${base}`).toBeLessThanOrEqual(0.7);
        expect(out.l).toBeGreaterThanOrEqual(0.52);
        expect(out.l).toBeLessThanOrEqual(0.78);
      }
    }
  });

  it('the four counter colours stay told apart, and turn with the scene’s hue', () => {
    const hues = [RED, GREEN, BLUE, YELLOW].map((c) => hslOf(refine(c, 200)).h);
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) expect(hueGap(hues[i], hues[j])).toBeGreaterThan(15);
    const a = hslOf(refine(RED, 200)).h; const b = hslOf(refine(RED, 260)).h;
    expect(hueGap(a + 60, b)).toBeLessThan(2);
  });

  it('each scene has its own hue, the same every time; no scene, a calm blue', () => {
    expect(sceneHue('Breakdown')).toBe(sceneHue('Breakdown'));
    const hues = ['Drums', 'Brass', 'Guitar', 'Groove', 'Winds hook', 'Intrigue', 'Drop', 'Breakdown', 'Summit'].map(sceneHue);
    expect(new Set(hues).size).toBeGreaterThanOrEqual(4);
    expect(sceneHue(null)).toBe(210);
  });

  it('the hue glides to the next scene’s the short way round, over seconds', () => {
    let h = 350;
    h = glideHue(h, 20, 0.1);
    expect(h > 350 || h < 20).toBe(true);
    for (let i = 0; i < 300; i++) h = glideHue(h, 20, 0.1);
    expect(hueGap(h, 20)).toBeLessThan(1);
    expect(hueGap(glideHue(100, 200, 0.1), 100)).toBeLessThan(5);
  });
});

describe('the sparks a note lets go', () => {
  it('a few, drifting up and fading over a couple of seconds; none for a viewer who asks for less motion', () => {
    const early = sparksOf(3, 4, 0.2, false);
    expect(early.length).toBe(SPARK.count);
    for (const s of early) expect(s.dy).toBeLessThanOrEqual(0);
    const later = sparksOf(3, 4, SPARK.seconds * 0.8, false);
    expect(Math.max(...later.map((s) => s.alpha))).toBeLessThan(Math.max(...early.map((s) => s.alpha)));
    expect(Math.min(...later.map((s) => s.dy))).toBeLessThan(Math.min(...early.map((s) => s.dy)));
    expect(sparksOf(3, 4, SPARK.seconds + 0.1, false)).toEqual([]);
    expect(sparksOf(3, 4, 0.5, true)).toEqual([]);
  });
});
