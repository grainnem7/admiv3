import { describe, it, expect } from 'vitest';
import {
  CONFIRM_FRAMES, DRIFT_HUE, driftColour, followCap, growMask, initialFollow, LOST_FRAMES, mergePieces, seenColour, type FollowState,
} from '../tracking/cap/capFollow';
import {
  CAP_HANDS_HOLD_MAX_MS, capColourAt, capMask, capPatches, capPauseReason, DEFAULT_CAP_SETTINGS, hatTempoBounds, initialCapState, stepCap, type CapColour, type CapPatch, type FaceBox, type Frame,
} from '../tracking/cap/capTracker';
import type { ControlRange, FaderRole } from '../profiles/BoardSequencerConfig';

/**
 * The hat, performance ready (owner, 2026-11-07): one hat not its pieces, never grabbed by
 * a flash of red, the colour following the light, the speed kept musical.
 */

const patch = (x: number, y: number, size: number, id = 1): CapPatch => ({
  x, y, area: size * size, x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2, id,
});

function run(frames: CapPatch[][], from: FollowState = initialFollow()): { seen: ({ x: number; y: number } | null)[]; state: FollowState } {
  let st = from;
  const seen: ({ x: number; y: number } | null)[] = [];
  for (const ps of frames) {
    const r = followCap(ps, st);
    st = r.state;
    seen.push(r.sighting ? { x: r.sighting.x, y: r.sighting.y } : null);
  }
  return { seen, state: st };
}

describe('following the hat', () => {
  it('a hat split in two by a shadow is one hat: its centre between the pieces, weighted by size', () => {
    const left = patch(0.45, 0.3, 0.08, 1);
    const right = patch(0.55, 0.3, 0.04, 2);
    const s = mergePieces(left, [left, right]);
    expect(s.x).toBeGreaterThan(0.45);
    expect(s.x).toBeLessThan(0.5);
    expect(s.area).toBeCloseTo(left.area + right.area, 6);
  });

  it('a bigger red thing across the room for a moment never takes the hat while the hat is there', () => {
    const hat = patch(0.5, 0.3, 0.06);
    const jumper = patch(0.15, 0.8, 0.2, 2);
    const { seen } = run([[hat], ...Array.from({ length: 20 }, () => [hat, jumper])]);
    for (const s of seen) expect(s?.x).toBeCloseTo(0.5, 2);
  });

  it('with the hat gone, a flash of red elsewhere holds (nothing moves) until it has stayed for a few frames', () => {
    const hat = patch(0.5, 0.3, 0.06);
    const flash = patch(0.15, 0.8, 0.06, 2);
    const { seen } = run([[hat], [flash], [flash], [], [flash]]);
    expect(seen.slice(1)).toEqual([null, null, null, null]);
    const steady = run([[hat], ...Array.from({ length: CONFIRM_FRAMES }, () => [flash])]);
    expect(steady.seen[CONFIRM_FRAMES]?.x).toBeCloseTo(0.15, 2);
  });

  it('lost for half a second, the hat is taken again at once wherever it is (it really moved, or the camera did)', () => {
    const hat = patch(0.5, 0.3, 0.06);
    const moved = patch(0.2, 0.6, 0.06);
    const { seen } = run([[hat], ...Array.from({ length: LOST_FRAMES }, () => []), [moved]]);
    expect(seen[seen.length - 1]?.x).toBeCloseTo(0.2, 2);
  });

  it('a hat moving across the picture is followed every frame', () => {
    const frames = Array.from({ length: 20 }, (_, i) => [patch(0.2 + i * 0.03, 0.3, 0.06)]);
    const { seen } = run(frames);
    seen.forEach((s, i) => expect(s?.x).toBeCloseTo(0.2 + i * 0.03, 2));
  });
});

describe('the hat in the picture', () => {
  const W = 40; const H = 30;
  const frame = (paint: (x: number, y: number) => [number, number, number]): Frame => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return { data, width: W, height: H };
  };

  it('a seam across the hat (one dark column) no longer splits it in two once the mask is grown', () => {
    const f = frame((x, y) => (x >= 10 && x < 30 && y >= 5 && y < 15 && x !== 20 ? [220, 20, 30] : [60, 60, 60]));
    const red: CapColour = { hue: 356, hueTolerance: 18, minSaturation: 50, minValue: 25 };
    const raw = capMask(f, red);
    expect(capPatches(raw, W, H).patches).toHaveLength(2);
    expect(capPatches(growMask(raw, W, H), W, H).patches).toHaveLength(1);
  });

  it('clicking the hat: a tight band in even light, a wider one (never past 30°) when its colour varies', () => {
    const even = frame(() => [220, 20, 30]);
    expect(capColourAt(even, 0.5, 0.5)?.hueTolerance).toBe(14);
    const mixed = frame((x, y) => ((x + y) % 2 === 0 ? [220, 20, 30] : [220, 70, 20]));
    const tol = capColourAt(mixed, 0.5, 0.5)?.hueTolerance ?? 0;
    expect(tol).toBeGreaterThan(14);
    expect(tol).toBeLessThanOrEqual(30);
  });

  it('the colour follows the light, a step at a time, never further than the drift allows from what was clicked', () => {
    const clicked: CapColour = { hue: 0, hueTolerance: 18, minSaturation: 60, minValue: 40 };
    let now = clicked;
    // The stage light turns the red towards orange (30°) and dims it.
    for (let i = 0; i < 200; i++) now = driftColour(clicked, now, { hue: 30, s: 70, v: 50 });
    expect(now.hue).toBeCloseTo(DRIFT_HUE, 5);
    expect(now.minValue).toBeLessThanOrEqual(clicked.minValue);
    expect(now.minSaturation).toBeLessThanOrEqual(clicked.minSaturation);
    // The light comes back: so does the colour.
    for (let i = 0; i < 200; i++) now = driftColour(clicked, now, { hue: 0, s: 95, v: 90 });
    expect(Math.min(now.hue, 360 - now.hue)).toBeLessThan(1);
  });

  it('the hat as seen now: its hue from its own pixels only', () => {
    const f = frame((x) => (x < 20 ? [220, 20, 30] : [30, 30, 220]));
    const mask = new Uint8Array(W * H).map((_, i) => (i % W < 20 ? 1 : 0));
    const seen = seenColour(f, mask, { x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(seen).not.toBeNull();
    expect(Math.min(seen?.hue ?? 0, 360 - (seen?.hue ?? 0))).toBeLessThan(8);
  });
});

describe('the hat on Speed stays musical', () => {
  const ranges = {
    volume: { min: 0.2, max: 1 }, reverb: { min: 0, max: 0.6 }, delay: { min: 0, max: 0.6 }, tone: { min: 0, max: 1 },
    tempo: { min: 60, max: 240 }, fill: { min: 0, max: 1 }, evolve: { min: 0, max: 1 },
  } as Record<FaderRole, ControlRange>;

  it('with a span of 15 %, a whole head turn moves the speed only that far either side of the scene’s, never to 60 or 240', () => {
    const s = { ...DEFAULT_CAP_SETTINGS, xRole: 'tempo' as const, yRole: 'off' as const, oneAtATime: false, tempoSpan: 0.15 };
    let st = initialCapState();
    const at = (x: number): number | undefined => {
      for (let i = 0; i < 40; i++) {
        const r = stepCap(st, { x, y: 0.5, area: 0.02 }, s, ranges, 40, false, 87);
        st = r.state;
      }
      return stepCap(st, { x, y: 0.5, area: 0.02 }, s, ranges, 40, false, 87).values.tempo;
    };
    const right = at(1);
    const left = at(0);
    expect(right).toBeLessThanOrEqual(Math.round(87 * 1.15));
    expect(right).toBeGreaterThanOrEqual(Math.round(87 * 1.15) - 1);
    expect(left).toBeGreaterThanOrEqual(Math.round(87 * 0.85));
    expect(left).toBeLessThanOrEqual(Math.round(87 * 0.85) + 1);
  });

  it('the whole range by default (as before); a span never goes past the player’s Slowest and Fastest', () => {
    expect(DEFAULT_CAP_SETTINGS.tempoSpan).toBe(1);
    expect(hatTempoBounds(87, 60, 240, 1)).toEqual({ lo: 60, hi: 240 });
    expect(hatTempoBounds(87, 80, 90, 0.5)).toEqual({ lo: 80, hi: 90 });
    expect(hatTempoBounds(100, 60, 240, 0.2)).toEqual({ lo: 80, hi: 120 });
  });
});

describe('a move far across the picture reaches the music', () => {
  it('the hat jumping to the other side (a few frames unseen while it is confirmed) still moves the speed, one direction at a time or not', () => {
    const ranges = {
      volume: { min: 0.2, max: 1 }, reverb: { min: 0, max: 0.6 }, delay: { min: 0, max: 0.6 }, tone: { min: 0, max: 1 },
      tempo: { min: 60, max: 240 }, fill: { min: 0, max: 1 }, evolve: { min: 0, max: 1 },
    } as Record<FaderRole, ControlRange>;
    const s = { ...DEFAULT_CAP_SETTINGS, xRole: 'tempo' as const, yRole: 'off' as const, oneAtATime: true };
    let st = initialCapState();
    let follow = initialFollow();
    let tempo: number | undefined;
    const frame = (x: number): void => {
      const r = followCap([patch(x, 0.4, 0.1)], follow);
      follow = r.state;
      const c = stepCap(st, r.sighting, s, ranges, 40, false, 90);
      st = c.state;
      tempo = c.values.tempo ?? tempo;
    };
    for (let i = 0; i < 40; i++) frame(0.5);
    expect(tempo).toBe(90);
    for (let i = 0; i < 80; i++) frame(0.95);
    expect(tempo).toBeGreaterThan(200);
  });
});

describe('the face reinforces the following', () => {
  // The player's face, in the middle of the picture; the hat sits just above it.
  const face: FaceBox = { x: 0.44, y: 0.4, w: 0.12, h: 0.16 };
  const hatAt = (x: number) => patch(x, 0.36, 0.06, 1);

  it('a bigger red thing next to the hat (a red jumper below the face) is never taken while the hat is on the head', () => {
    const jumper = patch(0.5, 0.52, 0.16, 2);
    const { seen } = run([[hatAt(0.5)], ...Array.from({ length: 10 }, () => [hatAt(0.5), jumper])], initialFollow());
    // Without the face, the jumper is near enough and bigger: it takes over.
    expect(seen.at(-1)?.y).toBeGreaterThan(0.45);
    let st = initialFollow();
    for (let i = 0; i < 10; i++) st = followCap([hatAt(0.5), jumper], st, face).state;
    const r = followCap([hatAt(0.5), jumper], st, face);
    expect(r.sighting?.y).toBeCloseTo(0.36, 2);
  });

  it('the hat on the head is taken at once wherever it is: a quick turn of the head waits for nothing', () => {
    let st = followCap([patch(0.15, 0.36, 0.06)], initialFollow()).state;
    const moved: FaceBox = { x: 0.74, y: 0.4, w: 0.12, h: 0.16 };
    const r = followCap([patch(0.8, 0.36, 0.06)], st, moved);
    st = r.state;
    expect(r.sighting?.x).toBeCloseTo(0.8, 2);
    expect(st.candidate).toBeNull();
  });

  it('with the face seen but no red on the head, the far patch still has to hold its place (the face stands in meanwhile)', () => {
    const st = followCap([hatAt(0.5)], initialFollow(), face).state;
    expect(followCap([patch(0.1, 0.9, 0.08, 2)], st, face).sighting).toBeNull();
  });
});

describe('hands on the board hold the hat for a moment only (owner, 7 Nov 2026: the hat was seen but never shaped the music)', () => {
  const s = { ...DEFAULT_CAP_SETTINGS, pauseOnBoard: true };
  it('a hand coming onto the board holds the hat; still there after a few seconds, the hat shapes the music again, however the board flickers under it', () => {
    expect(capPauseReason({ handSinceMs: 10_000, lastChangeMs: 10_000 }, 10_200, s)).toBe('hands');
    // The hand stays, the counters under it flicker: the hold ends all the same.
    expect(capPauseReason({ handSinceMs: 10_000, lastChangeMs: 10_000 + CAP_HANDS_HOLD_MAX_MS }, 10_000 + CAP_HANDS_HOLD_MAX_MS + 50, s)).toBeNull();
    expect(CAP_HANDS_HOLD_MAX_MS).toBeLessThanOrEqual(3000);
    // A counter put down with no hand seen (the laptop board): the short hold, as before.
    expect(capPauseReason({ handSinceMs: null, lastChangeMs: 10_000 }, 10_100, s)).toBe('board');
    expect(capPauseReason({ handSinceMs: null, lastChangeMs: 10_000 }, 10_000 + s.resumeAfterMs + 1, s)).toBeNull();
    // Switched off: never held.
    expect(capPauseReason({ handSinceMs: 10_000, lastChangeMs: 10_000 }, 10_100, { ...s, pauseOnBoard: false })).toBeNull();
  });
});
