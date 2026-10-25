import { describe, it, expect } from 'vitest';
import {
  capColourAt, DEFAULT_CAP_COLOUR, DEFAULT_CAP_SETTINGS, findCap, fitSideArc, fuseWithFace, initialCapState, quantise,
  sanitizeCapSettings, stepCap, capPauseReason, handOverAxis, CAP_RESUME_MAX_MS, type CapSettings, type Frame,
} from '../tracking/cap/capTracker';
import type { ControlRange, FaderRole } from '../profiles/BoardSequencerConfig';

const W = 160;
const H = 120;
const RED: [number, number, number] = [200, 30, 40];
const SKIN: [number, number, number] = [205, 150, 125];
const WALL: [number, number, number] = [120, 120, 125];

/** A picture: a wall, optionally a face (skin) and a red cap as a disc. */
function picture(cap: { x: number; y: number; r?: number } | null, extras: { x: number; y: number; r: number; rgb: [number, number, number] }[] = []): Frame {
  const data = new Uint8ClampedArray(W * H * 4);
  const shapes = [...extras, ...(cap ? [{ x: cap.x, y: cap.y, r: cap.r ?? 0.07, rgb: RED }] : [])];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = WALL;
      for (const s of shapes) if (Math.hypot(x / W - s.x, (y / H - s.y) * (H / W)) < s.r) c = s.rgb;
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const ranges: Record<FaderRole, ControlRange> = {
  volume: { min: 0.2, max: 1 }, reverb: { min: 0, max: 0.6 }, delay: { min: 0, max: 0.6 },
  tone: { min: 0, max: 1 }, tempo: { min: 70, max: 130 }, fill: { min: 0, max: 1 }, evolve: { min: 0, max: 1 },
};
const settings = (over: Partial<CapSettings> = {}): CapSettings => ({ ...DEFAULT_CAP_SETTINGS, enabled: true, ...over });

/** Run frames until the glide has settled, and return the last reading. */
function settle(s: CapSettings, at: { x: number; y: number } | null, st = initialCapState(), frames = 120) {
  let r = stepCap(st, at ? { ...at, area: 0.01 } : null, s, ranges, 33);
  for (let i = 1; i < frames; i++) r = stepCap(r.state, at ? { ...at, area: 0.01 } : null, s, ranges, 33);
  return r;
}

describe('finding the cap', () => {
  it('finds a red cap where it is', () => {
    const s = findCap(picture({ x: 0.3, y: 0.4 }), DEFAULT_CAP_COLOUR)!;
    expect(s.x).toBeCloseTo(0.3, 1);
    expect(s.y).toBeCloseTo(0.4, 1);
  });

  it('is not fooled by a face (skin is less saturated than a red cap)', () => {
    const s = findCap(picture({ x: 0.7, y: 0.3 }, [{ x: 0.5, y: 0.5, r: 0.15, rgb: SKIN }]), DEFAULT_CAP_COLOUR)!;
    expect(s.x).toBeCloseTo(0.7, 1);
    expect(findCap(picture(null, [{ x: 0.5, y: 0.5, r: 0.15, rgb: SKIN }]), DEFAULT_CAP_COLOUR)).toBeNull();
  });

  it('ignores a red speck, and with two red things prefers the one where the cap just was', () => {
    expect(findCap(picture(null, [{ x: 0.5, y: 0.5, r: 0.01, rgb: RED }]), DEFAULT_CAP_COLOUR)).toBeNull();
    const two = picture({ x: 0.25, y: 0.5, r: 0.06 }, [{ x: 0.8, y: 0.5, r: 0.08, rgb: RED }]);
    expect(findCap(two, DEFAULT_CAP_COLOUR, { x: 0.26, y: 0.5 })!.x).toBeCloseTo(0.25, 1);
  });

  it('learns the cap colour from a tap on it', () => {
    const c = capColourAt(picture({ x: 0.5, y: 0.5 }), 0.5, 0.5)!;
    expect(Math.min(c.hue, 360 - c.hue)).toBeLessThan(10);
    expect(capColourAt(picture(null), 0.5, 0.5)).toBeNull(); // the grey wall is no colour
  });
});

describe('from where the cap is to the controls', () => {
  it('left–right drives speed and up–down volume, across their whole ranges', () => {
    expect(settle(settings(), { x: 0, y: 1 }).values).toMatchObject({ tempo: 70, volume: 0.2 });
    expect(settle(settings(), { x: 1, y: 0 }).values).toMatchObject({ tempo: 130, volume: 1 });
  });

  it("the player's learnt reach is stretched to the whole control", () => {
    const s = settings({ reachX: { min: 0.4, max: 0.6 } });
    expect(settle(s, { x: 0.6, y: 0.5 }).values.tempo).toBe(130);
    expect(settle(s, { x: 0.4, y: 0.5 }).values.tempo).toBe(70);
    expect(settle(s, { x: 0.5, y: 0.5 }).values.tempo).toBe(100);
  });

  it('small wobbles are ignored', () => {
    const at = settle(settings(), { x: 0.5, y: 0.5 });
    const wobble = settle(settings(), { x: 0.52, y: 0.49 }, at.state);
    expect(wobble.values).toEqual(at.values);
  });

  it('changes glide rather than jump', () => {
    const at = settle(settings(), { x: 0, y: 0.5 });
    const next = stepCap(at.state, { x: 1, y: 0.5, area: 0.01 }, settings(), ranges, 33);
    expect(next.values.tempo!).toBeGreaterThan(70);
    expect(next.values.tempo!).toBeLessThan(90);
  });

  it('when the cap is lost, the values hold', () => {
    const at = settle(settings(), { x: 0.8, y: 0.3 });
    const lost = settle(settings(), null, at.state);
    expect(lost.values).toEqual(at.values);
    expect(lost.seen).toBe(false);
  });

  it('locked: the values stay where they are, wherever the cap goes', () => {
    const at = settle(settings(), { x: 0.2, y: 0.2 });
    expect(settle(settings({ locked: true }), { x: 0.9, y: 0.9 }, at.state).values).toEqual(at.values);
  });

  it('in steps: a few clear values, and no flicker at a boundary', () => {
    const s = settings({ steps: 5 });
    expect(settle(s, { x: 0.27, y: 0.5 }).values.tempo).toBe(85);
    expect(quantise(0.375, 5, 1)).toBe(1);   // just past halfway to the next step: stays
    expect(quantise(0.45, 5, 1)).toBe(2);    // well into it: moves
  });

  it('either direction can be off', () => {
    const r = settle(settings({ yRole: 'off' }), { x: 0.5, y: 0.5 });
    expect(Object.keys(r.values)).toEqual(['tempo']);
  });

  it('settings survive a save, with safe defaults for anything missing', () => {
    expect(sanitizeCapSettings({})).toEqual(DEFAULT_CAP_SETTINGS);
    const s = sanitizeCapSettings({ enabled: true, xRole: 'reverb', steps: 3, reachX: { min: 0.3, max: 0.7 }, reachY: { min: 0.5, max: 0.51 } });
    expect(s).toMatchObject({ enabled: true, xRole: 'reverb', steps: 3, reachX: { min: 0.3, max: 0.7 }, reachY: null });
  });
});

describe('reinforced by the face', () => {
  const face = { x: 0.4, y: 0.4, w: 0.2, h: 0.25 };   // centre (0.5, 0.525)

  it('a red patch on the head is the cap, and where it sits on the face is learnt', () => {
    const f = fuseWithFace({ x: 0.5, y: 0.33, area: 0.01 }, face, null);
    expect(f.source).toBe('cap');
    expect(f.offset!.dy).toBeLessThan(0);
  });

  it('a red jumper across the room is not the cap: the face is followed instead', () => {
    const f = fuseWithFace({ x: 0.9, y: 0.9, area: 0.05 }, face, { dx: 0, dy: -0.2 });
    expect(f.source).toBe('face');
    expect(f.sighting!.x).toBeCloseTo(0.5, 5);
    expect(f.sighting!.y).toBeCloseTo(0.325, 5);
  });

  it('cap hidden for a moment: the face carries on where the cap was', () => {
    const f = fuseWithFace(null, { ...face, x: 0.5 }, { dx: 0, dy: -0.2 });
    expect(f.source).toBe('face');
    expect(f.sighting!.x).toBeCloseTo(0.6, 5);
  });

  it('no face (or face tracking off): the cap alone, as before', () => {
    expect(fuseWithFace({ x: 0.9, y: 0.9, area: 0.05 }, null, null).source).toBe('cap');
    expect(fuseWithFace(null, null, null).sighting).toBeNull();
  });
});

describe('keeping the two directions apart', () => {
  // Seen with the real cap: turning right to speed up also lowers the head a little (it
  // moves in an arc), which read as "quieter".
  /** Glide the head from one point to another over `ms`, frame by frame. */
  function move(st: ReturnType<typeof initialCapState>, s: CapSettings, from: { x: number; y: number }, to: { x: number; y: number }, ms = 1200) {
    let r = stepCap(st, { ...from, area: 0.01 }, s, ranges, 33);
    for (let t = 33; t <= ms; t += 33) {
      const k = t / ms;
      r = stepCap(r.state, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, area: 0.01 }, s, ranges, 33);
    }
    for (let i = 0; i < 60; i++) r = stepCap(r.state, { ...to, area: 0.01 }, s, ranges, 33); // then rest there
    return r;
  }

  it('turning to the side with a natural droop speeds up without getting quieter', () => {
    const s = settings();
    const start = settle(s, { x: 0.5, y: 0.5 });
    const after = move(start.state, s, { x: 0.5, y: 0.5 }, { x: 0.85, y: 0.6 }); // right, and 0.1 lower
    expect(after.values.tempo!).toBeGreaterThan(start.values.tempo! + 15);
    expect(after.values.volume!).toBeCloseTo(start.values.volume!, 3);
  });

  it('without "one direction at a time" the droop does change the volume (why it exists)', () => {
    const s = settings({ oneAtATime: false });
    const start = settle(s, { x: 0.5, y: 0.5 });
    const after = move(start.state, s, { x: 0.5, y: 0.5 }, { x: 0.85, y: 0.6 });
    expect(after.values.volume!).toBeLessThan(start.values.volume! - 0.05);
  });

  it('a deliberate nod still moves the volume, and leaves the speed alone', () => {
    const s = settings();
    const start = settle(s, { x: 0.5, y: 0.5 });
    const after = move(start.state, s, { x: 0.5, y: 0.5 }, { x: 0.52, y: 0.25 });
    expect(after.values.volume!).toBeGreaterThan(start.values.volume! + 0.1);
    expect(after.values.tempo).toBe(start.values.tempo);
  });

  it('a clear diagonal moves both', () => {
    const s = settings();
    const start = settle(s, { x: 0.5, y: 0.5 });
    const after = move(start.state, s, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.25 });
    expect(after.values.tempo!).toBeGreaterThan(start.values.tempo!);
    expect(after.values.volume!).toBeGreaterThan(start.values.volume!);
  });

  it("the learnt side-to-side curve: moving along it isn't up or down at all", () => {
    // The head's natural arc: lower at the sides.
    const arcY = (x: number): number => 0.5 + 0.8 * (x - 0.5) ** 2;
    const pts = Array.from({ length: 40 }, (_, i) => { const x = 0.2 + (i / 39) * 0.6; return { x, y: arcY(x) }; });
    const arc = fitSideArc(pts)!;
    expect(arc.c).toBeCloseTo(0.8, 2);
    const s = settings({ oneAtATime: false, sideArc: arc });
    const middle = settle(s, { x: 0.5, y: arcY(0.5) });
    const side = settle(s, { x: 0.8, y: arcY(0.8) });
    expect(side.values.volume!).toBeCloseTo(middle.values.volume!, 2);
    expect(fitSideArc(pts.map((p) => ({ x: 0.5, y: p.y })))).toBeNull(); // no sideways movement: nothing to learn
  });
});

describe('pausing while counters are moved', () => {
  // The head moves before the hand reaches the board, so a pause has to undo the start of
  // the reach, not merely freeze where it got to.
  const s = settings({ xRole: 'tempo', yRole: 'off', oneAtATime: false, rewindMs: 500 });
  const at = (x: number) => ({ x, y: 0.5, area: 0.01 });

  it('pauses while a hand is on the board, and lets a resting hand go after a while', () => {
    const quiet = { lastChangeMs: null, handSinceMs: null };
    expect(capPauseReason(quiet, 10_000, s)).toBeNull();
    expect(capPauseReason({ lastChangeMs: 9_900, handSinceMs: 9_900 }, 10_000, s)).toBe('hands');
    // A hand lying still on the board for longer than "resting" no longer holds the cap.
    expect(capPauseReason({ lastChangeMs: 1_000, handSinceMs: 1_000 }, 1_000 + s.restMs + 1, s)).toBeNull();
    // A counter that appeared with no hand seen (the laptop board, or the guard not ready).
    expect(capPauseReason({ lastChangeMs: 9_900, handSinceMs: null }, 10_000, s)).toBe('board');
    expect(capPauseReason({ lastChangeMs: 9_900, handSinceMs: null }, 9_900 + s.resumeAfterMs + 1, s)).toBeNull();
    expect(capPauseReason({ lastChangeMs: 9_900, handSinceMs: 9_900 }, 10_000, { ...s, pauseOnBoard: false })).toBeNull();
  });

  it('slides back to where things were before the reach began, and holds there', () => {
    let r = settle(s, at(0.3));
    const before = r.values.tempo!;
    // The head leans towards the board for 400 ms before the hand gets there.
    for (let i = 0; i < 12; i++) r = stepCap(r.state, at(0.3 + 0.04 * i), s, ranges, 33);
    expect(r.values.tempo!).toBeGreaterThan(before + 3);
    // The hand arrives: paused. The head stays leaning over the board.
    for (let i = 0; i < 90; i++) r = stepCap(r.state, at(0.8), s, ranges, 33, true);
    expect(r.values.tempo!).toBeCloseTo(before, 0);
  });

  it('after the pause, waits for the head to settle before following again', () => {
    let r = settle(s, at(0.3));
    const before = r.values.tempo!;
    for (let i = 0; i < 30; i++) r = stepCap(r.state, at(0.3), s, ranges, 33, true);
    // The pause ends while the head is still on its way back: nothing follows yet.
    for (let i = 0; i < 6; i++) r = stepCap(r.state, at(0.8 - 0.08 * i), s, ranges, 33);
    expect(r.values.tempo!).toBeCloseTo(before, 0);
    // Once it has been still for a moment, it follows again.
    r = settle(s, at(0.7), r.state);
    expect(r.values.tempo!).toBeGreaterThan(before + 10);
  });

  it('keeps the timings within safe limits when loading', () => {
    const d = sanitizeCapSettings({});
    expect(d.pauseOnBoard).toBe(true);
    const odd = sanitizeCapSettings({ pauseOnBoard: false, resumeAfterMs: 99_999, rewindMs: -5, restMs: 'x' });
    expect(odd.pauseOnBoard).toBe(false);
    expect(odd.resumeAfterMs).toBe(CAP_RESUME_MAX_MS);
    expect(odd.rewindMs).toBe(0);
    expect(odd.restMs).toBe(DEFAULT_CAP_SETTINGS.restMs);
  });
});

describe('handing a control over to the iPad', () => {
  const s = settings({ xRole: 'tempo', yRole: 'off', oneAtATime: false });
  const at = (x: number) => ({ x, y: 0.5, area: 0.01 });

  it("keeps the iPad's value until the head moves, then follows the head again", () => {
    let r = settle(s, at(0.3));
    // The iPad sets the speed to the very top; the head stays where it was.
    let st = handOverAxis(r.state, 'x', 1);
    for (let i = 0; i < 60; i++) { r = stepCap(st, at(0.3), s, ranges, 33); st = r.state; }
    expect(r.values.tempo).toBe(130);
    // A real move of the head takes it back, gliding from the iPad's value.
    r = stepCap(st, at(0.6), s, ranges, 33);
    expect(r.values.tempo!).toBeGreaterThan(110);
    r = settle(s, at(0.6), r.state);
    expect(r.values.tempo!).toBeCloseTo(70 + 0.6 * 60, 0);
  });
});
