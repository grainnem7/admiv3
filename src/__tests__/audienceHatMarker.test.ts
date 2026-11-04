import { describe, it, expect } from 'vitest';
import {
  INITIAL_MARKER, MARKER_ALPHA, MARKER_RADIUS, markerHatMode, markerMode, markerShare, markerSize, stepMarker, trailSegments, TRAIL_SEC,
  type MarkerState,
} from '../audience/hatMarker';
import { BLOOM_LIGHT_BUDGET, INITIAL_LIGHT, MAX_LIGHT_SPEED, stepLight, type LightState } from '../audience/light';
import type { AudienceHat } from '../audience/protocol';

const follow = (x: number, y: number): AudienceHat => ({ mode: 'follow', x, y, warmth: 0.5 });
const LOST: AudienceHat = { mode: 'lost', x: null, y: null, warmth: null };
const FREE: AudienceHat = { mode: 'free', x: null, y: null, warmth: null };

/** Light and marker together for `sec` seconds at 30 frames a second (the screen's own rate). */
function run(
  start: { light: LightState; marker: MarkerState; t: number },
  hat: AudienceHat,
  sec: number,
  reduced = false,
): { light: LightState; marker: MarkerState; t: number; maxStep: number; maxAlphaStep: number } {
  let { light, marker, t } = start;
  let maxStep = 0;
  let maxAlphaStep = 0;
  const dt = 1 / 30;
  for (let i = 0; i < Math.round(sec * 30); i++) {
    t += dt;
    light = stepLight(light, hat, dt, t);
    const next = stepMarker(marker, hat.mode, light, dt, t, reduced);
    if (marker.alpha > 0.02 && next.alpha > 0.02) maxStep = Math.max(maxStep, Math.hypot(next.x - marker.x, next.y - marker.y));
    maxAlphaStep = Math.max(maxAlphaStep, Math.abs(next.alpha - marker.alpha));
    marker = next;
  }
  return { light, marker, t, maxStep, maxAlphaStep };
}
const START = { light: INITIAL_LIGHT, marker: INITIAL_MARKER, t: 0 };

describe("the hat's marker follows the hat", () => {
  it('goes where the light goes while the hat steers, clearly seen', () => {
    const r = run(START, follow(0.9, 0.8), 3);
    expect(Math.hypot(r.marker.x - r.light.x, r.marker.y - r.light.y)).toBeLessThan(0.01);
    expect(r.marker.x).toBeGreaterThan(0.75);
    expect(r.marker.y).toBeLessThan(0.3);
    expect(r.marker.alpha).toBeCloseTo(MARKER_ALPHA.follow, 2);
    expect(markerMode('follow')).toBe('follow');
  });

  it('never jumps and never blinks, whatever the hat does', () => {
    let s = run(START, follow(0, 0), 2);
    let worst = 0;
    let worstAlpha = 0;
    for (const hat of [follow(1, 1), LOST, follow(0, 1), FREE, follow(1, 0), LOST, follow(0.5, 0.5)]) {
      s = run(s, hat, 1.5);
      worst = Math.max(worst, s.maxStep);
      worstAlpha = Math.max(worstAlpha, s.maxAlphaStep);
    }
    expect(worst).toBeLessThanOrEqual(MAX_LIGHT_SPEED / 30 + 1e-9);
    // A change of mode fades over several frames, never at once.
    expect(worstAlpha).toBeLessThan(0.2);
  });

  it('leaves a short trail of where it has just been: about a second, oldest faintest', () => {
    let s = run(START, follow(0, 0.5), 2);
    s = run(s, follow(1, 0.5), 0.6);
    const segs = trailSegments(s.marker.trail, s.t, s.marker.alpha);
    expect(segs.length).toBeGreaterThan(3);
    for (const p of s.marker.trail) expect(s.t - p.t).toBeLessThanOrEqual(TRAIL_SEC + 1e-9);
    // Oldest first, and fading towards the old end.
    expect(segs[0].alpha).toBeLessThan(segs[segs.length - 1].alpha);
    expect(segs[0].width).toBeLessThan(segs[segs.length - 1].width);
    for (const seg of segs) expect(seg.alpha).toBeLessThanOrEqual(s.marker.alpha);
    // Held still for longer than the trail, the trail is gone.
    const still = run(s, follow(1, 0.5), TRAIL_SEC + 1.5);
    expect(trailSegments(still.marker.trail, still.t, still.marker.alpha).every((seg) => seg.alpha < 0.05 || Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) < 1e-3)).toBe(true);
  });

  it('keeps the trail short, however long the hat moves', () => {
    let s = START as { light: LightState; marker: MarkerState; t: number };
    for (let i = 0; i < 20; i++) s = run(s, follow(i % 2, (i * 0.37) % 1), 0.5);
    expect(s.marker.trail.length).toBeLessThanOrEqual(40);
  });

  it('draws no trail when less motion is asked for, and still moves', () => {
    let s = run(START, follow(0, 0.5), 2, true);
    s = run(s, follow(1, 0.5), 0.6, true);
    expect(s.marker.trail).toEqual([]);
    expect(s.marker.x).toBeGreaterThan(0.4);
  });
});

describe('out of sight, and no hat', () => {
  it('lost: stays where it was and dims to about 40 %, dashed; the trail runs out', () => {
    const seen = run(START, follow(0.8, 0.8), 3);
    const lost = run(seen, LOST, 3);
    expect(Math.hypot(lost.marker.x - seen.marker.x, lost.marker.y - seen.marker.y)).toBeLessThan(1e-6);
    expect(lost.marker.alpha).toBeCloseTo(MARKER_ALPHA.lost, 2);
    expect(MARKER_ALPHA.lost).toBeCloseTo(0.4, 5);
    expect(markerMode('lost')).toBe('lost');
    expect(trailSegments(lost.marker.trail, lost.t, lost.marker.alpha)).toEqual([]);
  });

  it('seen again: it glides from where it was held to the hat', () => {
    const seen = run(START, follow(0.1, 0.5), 3);
    const lost = run(seen, LOST, 2);
    const back = run(lost, follow(0.9, 0.5), 0.1);
    expect(back.maxStep).toBeLessThanOrEqual(MAX_LIGHT_SPEED / 30 + 1e-9);
    expect(back.marker.x).toBeLessThan(0.5);
    expect(run(back, follow(0.9, 0.5), 2).marker.x).toBeGreaterThan(0.75);
  });

  it('free (no hat in use): not drawn at all; it fades out and the light wanders on its own', () => {
    expect(MARKER_ALPHA.free).toBe(0);
    expect(markerMode('free')).toBe('off');
    const never = run(START, FREE, 5);
    expect(never.marker.alpha).toBe(0);
    const seen = run(START, follow(0.8, 0.2), 2);
    const off = run(seen, FREE, 3);
    expect(off.marker.alpha).toBeLessThan(0.01);
  });
});

describe('size and light', () => {
  it('is about 5 to 7 % of the shorter side across its radius, on any screen', () => {
    expect(MARKER_RADIUS).toBeGreaterThanOrEqual(0.05);
    expect(MARKER_RADIUS).toBeLessThanOrEqual(0.07);
    expect(markerSize(1920, 1080)).toBeCloseTo(1080 * MARKER_RADIUS, 6);
    expect(markerSize(720, 1280)).toBeCloseTo(720 * MARKER_RADIUS, 6);
  });

  it('adds so little light to any third of the screen that it cannot flash, even with every bloom at its most', () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768], [3840, 2160]]) {
      const share = markerShare(w, h);
      expect(share).toBeGreaterThan(0);
      // WCAG 2.3.1 counts a flash only from a swing of 0.1; half that is the test's own line.
      expect(share).toBeLessThan(0.01);
      expect(share + BLOOM_LIGHT_BUDGET).toBeLessThan(0.1);
    }
  });
});

describe('when the laptop goes quiet', () => {
  it('a marker in use holds, dimmed (lost); with no hat in use it stays off', () => {
    expect(markerHatMode(null, 'follow')).toBe('lost');
    expect(markerHatMode(null, 'lost')).toBe('lost');
    expect(markerHatMode(null, 'free')).toBe('free');
    expect(markerHatMode('follow', 'free')).toBe('follow');
  });
});
