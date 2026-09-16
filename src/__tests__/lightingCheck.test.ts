import { describe, it, expect } from 'vitest';
import {
  readLighting, lightingProblem, nextLightingProblem, describeLighting,
  MAX_UNEVENNESS, type LightingProblem,
} from '../tracking/lightingCheck';

const W = 30;
const H = 30;

/** A frame whose pixel value is decided by where the pixel is. */
function frame(valueAt: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = valueAt(x, y);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  return d;
}

const read = (d: Uint8ClampedArray) => readLighting(d, W, H, 1);

describe('readLighting', () => {
  it('an evenly lit board is clean on every count', () => {
    const r = read(frame(() => 140))!;
    expect(r.blown).toBe(0);
    expect(r.crushed).toBe(0);
    expect(r.unevenness).toBeCloseTo(1, 6);
    expect(lightingProblem(r)).toBeNull();
  });

  it('spots a light bouncing off the board', () => {
    // A blown patch: the squares under it are all the same white, so there is no board
    // left to learn, and it also emits duplicate corners that collapse board-finding.
    const r = read(frame((x, y) => (x < 9 && y < 9 ? 255 : 130)))!;
    expect(r.blown).toBeGreaterThan(0.06);
    expect(lightingProblem(r)).toBe('glare');
  });

  it('spots a room too dark to read', () => {
    const r = read(frame(() => 8))!;
    expect(r.crushed).toBeGreaterThan(0.25);
    expect(lightingProblem(r)).toBe('too-dark');
  });

  it('spots a lamp on one side', () => {
    // The measured breaking point for colour detection is about 2.5 : 1.
    const r = read(frame((x) => (x < W / 2 ? 60 : 160)))!;
    expect(r.unevenness).toBeGreaterThan(MAX_UNEVENNESS);
    expect(lightingProblem(r)).toBe('uneven');
  });

  it('tolerates the gentle falloff any real room has', () => {
    const r = read(frame((x) => 120 + Math.round((x / W) * 30)))!;
    expect(lightingProblem(r)).toBeNull();
  });

  it('a dark room is reported as dark, not as wildly uneven', () => {
    // Dividing by a near-black patch mean would claim a huge ratio about an empty room.
    const r = read(frame(() => 2))!;
    expect(r.unevenness).toBe(1);
    expect(lightingProblem(r)).toBe('too-dark');
  });

  it('has nothing to say about an empty frame', () => {
    expect(readLighting(new Uint8ClampedArray(0), 0, 0)).toBeNull();
    expect(lightingProblem(null)).toBeNull();
  });
});

describe('nextLightingProblem', () => {
  const good = read(frame(() => 140));
  const glary = read(frame((x, y) => (x < 9 && y < 9 ? 255 : 130)));

  it('holds the warning until the picture is clearly better, not just barely', () => {
    expect(nextLightingProblem(null, glary)).toBe('glare');
    // 49 blown pixels of 900 = 0.054: under the 0.06 warn line but over the 0.048 clear
    // line, i.e. exactly the feed that must not flash the warning on and off.
    const borderline = read(frame((x, y) => (x < 7 && y < 7 ? 255 : 130)));
    expect(lightingProblem(borderline)).toBeNull();
    expect(nextLightingProblem('glare', borderline)).toBe('glare');
    expect(nextLightingProblem('glare', good)).toBeNull();
  });

  it('keeps what it knew when there is nothing to measure', () => {
    expect(nextLightingProblem('uneven', null)).toBe('uneven');
  });

  it('a new problem replaces the old one straight away', () => {
    expect(nextLightingProblem('too-dark', glary)).toBe('glare');
  });
});

describe('describeLighting', () => {
  it('says what is wrong AND what to do about it', () => {
    for (const p of ['glare', 'too-dark', 'uneven'] as LightingProblem[]) {
      const text = describeLighting(p);
      expect(text).toBeTruthy();
      // A warning with no action is a dead end for the person holding the lamp.
      expect(text!.length).toBeGreaterThan(40);
    }
    expect(describeLighting(null)).toBeNull();
  });
});
