import { describe, it, expect } from 'vitest';
import {
  bandBump, BLOOM_SEC, bloomAt, boardLayout, DIM_PRESENCE, FADE_SEC, glideTint, INITIAL_LIGHT, isAwake, lightGlow,
  LOST_LEVEL, MAX_LIGHT_SPEED, MAX_PULSE_HZ, pulseHz, pulseLevel, stepLight, stepPresence, stepPulse, worldTint,
  type LightState, type Rgb,
} from '../audience/light';
import type { AudienceHat } from '../audience/protocol';

const follow = (x: number, y: number, warmth: number | null = 0.5): AudienceHat => ({ mode: 'follow', x, y, warmth });
const LOST: AudienceHat = { mode: 'lost', x: null, y: null, warmth: null };
const FREE: AudienceHat = { mode: 'free', x: null, y: null, warmth: null };

/** Run the light for `sec` seconds at 60 frames a second, from `st`. */
function run(st: LightState, hat: AudienceHat, sec: number, t0 = 0): { st: LightState; maxStep: number } {
  let s = st;
  let maxStep = 0;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(sec * 60); i++) {
    const next = stepLight(s, hat, dt, t0 + i * dt);
    maxStep = Math.max(maxStep, Math.hypot(next.x - s.x, next.y - s.y));
    s = next;
  }
  return { st: s, maxStep };
}

describe("Tim's light follows the hat", () => {
  it('goes left and right with side to side, and up and down with up and down', () => {
    const right = run(INITIAL_LIGHT, follow(1, 0.5), 3).st;
    const left = run(INITIAL_LIGHT, follow(0, 0.5), 3).st;
    expect(right.x).toBeGreaterThan(0.8);
    expect(left.x).toBeLessThan(0.2);
    // Up the hat is up the screen (smaller y on the screen).
    const up = run(INITIAL_LIGHT, follow(0.5, 1), 3).st;
    const down = run(INITIAL_LIGHT, follow(0.5, 0), 3).st;
    expect(up.y).toBeLessThan(0.25);
    expect(down.y).toBeGreaterThan(0.75);
  });

  it("uses the hat's learnt range: a position across Tim's range crosses most of the screen", () => {
    const a = run(INITIAL_LIGHT, follow(0.1, 0.5), 3).st;
    const b = run(INITIAL_LIGHT, follow(0.9, 0.5), 3).st;
    expect(b.x - a.x).toBeGreaterThan(0.55);
  });

  it('gets warmer and brighter as the Brightness goes up', () => {
    const dull = run(INITIAL_LIGHT, follow(0.5, 0.5, 0), 3).st;
    const bright = run(INITIAL_LIGHT, follow(0.5, 0.5, 1), 3).st;
    expect(bright.warmth).toBeGreaterThan(0.9);
    expect(dull.warmth).toBeLessThan(0.1);
    const tint: Rgb = [120, 170, 255];
    const g0 = lightGlow(dull, tint);
    const g1 = lightGlow(bright, tint);
    expect(g1.alpha).toBeGreaterThan(g0.alpha);
    // Warmer: more red against blue than the dull light.
    expect(g1.core[0] - g1.core[2]).toBeGreaterThan(g0.core[0] - g0.core[2]);
  });

  it('never jumps, whatever the hat does', () => {
    // Out of sight on the left, then seen at once on the far right, then lost, then the hat goes off.
    let s = run(INITIAL_LIGHT, follow(0, 0), 2).st;
    let worst = 0;
    for (const hat of [follow(1, 1), LOST, FREE, follow(0, 1), LOST]) {
      const r = run(s, hat, 2);
      worst = Math.max(worst, r.maxStep);
      s = r.st;
    }
    expect(worst).toBeLessThanOrEqual(MAX_LIGHT_SPEED / 60 + 1e-9);
  });
});

describe('out of sight', () => {
  it('stays where it was and dims a little, and never vanishes', () => {
    const seen = run(INITIAL_LIGHT, follow(0.9, 0.9), 3).st;
    const lost = run(seen, LOST, 6, 3).st;
    expect(Math.hypot(lost.x - seen.x, lost.y - seen.y)).toBeLessThan(0.05);
    expect(lost.level).toBeLessThan(seen.level);
    expect(lost.level).toBeCloseTo(LOST_LEVEL, 1);
    expect(lost.level).toBeGreaterThan(0.5);
  });

  it('keeps its warmth while the hat is out of sight', () => {
    const seen = run(INITIAL_LIGHT, follow(0.5, 0.5, 1), 3).st;
    const lost = run(seen, LOST, 4, 3).st;
    expect(lost.warmth).toBeCloseTo(seen.warmth, 2);
  });

  it('with no hat in use, drifts gently on its own (it moves, but slowly and within the screen)', () => {
    const r = run(INITIAL_LIGHT, FREE, 20);
    const later = run(r.st, FREE, 5, 20);
    expect(Math.hypot(later.st.x - r.st.x, later.st.y - r.st.y)).toBeGreaterThan(0.005);
    expect(later.maxStep).toBeLessThan(0.2 / 60);
    for (const s of [r.st, later.st]) {
      expect(s.x).toBeGreaterThan(0.15); expect(s.x).toBeLessThan(0.85);
      expect(s.y).toBeGreaterThan(0.15); expect(s.y).toBeLessThan(0.85);
    }
  });
});

describe('the pulse', () => {
  it('follows the speed', () => {
    expect(pulseHz(60, true)).toBeCloseTo(1, 6);
    expect(pulseHz(120, true)).toBeCloseTo(2, 6);
    expect(pulseHz(150, true)).toBeGreaterThan(pulseHz(120, true));
  });

  it('never goes over 3 a second, at any speed up to 240', () => {
    for (let bpm = 20; bpm <= 240; bpm += 1) {
      expect(pulseHz(bpm, true)).toBeLessThanOrEqual(MAX_PULSE_HZ);
      expect(pulseHz(bpm, true)).toBeGreaterThan(0);
    }
    expect(pulseHz(240, true)).toBeCloseTo(2, 6);
    expect(pulseHz(1000, true)).toBeLessThanOrEqual(MAX_PULSE_HZ);
  });

  it('is a slow breath when nothing plays', () => {
    expect(pulseHz(120, false)).toBeLessThan(0.5);
  });

  it('changes speed without a jump in the light', () => {
    let phase = 0.3;
    const before = pulseLevel(phase);
    phase = stepPulse(phase, 3, 1 / 60);
    expect(Math.abs(pulseLevel(phase) - before)).toBeLessThan(0.2);
    expect(stepPulse(0.99, 1, 0.02)).toBeCloseTo(0.01, 6);
  });
});

describe('the sound world tints the light', () => {
  it('gives each world its own tint', () => {
    const tints = (['none', 'warm', 'lofi', 'ambient', 'electronic'] as const).map((w) => worldTint(w).join());
    expect(new Set(tints).size).toBe(5);
    const [r, , b] = worldTint('ambient');
    expect(b).toBeGreaterThan(r); // soft blue
    const [wr, , wb] = worldTint('warm');
    expect(wr).toBeGreaterThan(wb); // amber
  });

  it('an unknown world is the neutral one', () => {
    expect(worldTint('nonsense')).toEqual(worldTint('none'));
  });

  it('glides over a few seconds, never cuts', () => {
    let t: Rgb = worldTint('warm');
    const target = worldTint('ambient');
    const first = glideTint(t, target, 1 / 60);
    expect(Math.abs(first[2] - t[2])).toBeLessThan(Math.abs(target[2] - t[2]) * 0.05);
    for (let i = 0; i < 60; i++) t = glideTint(t, target, 1 / 60);
    expect(Math.abs(t[2] - target[2])).toBeGreaterThan(5); // not there after 1 s
    for (let i = 0; i < 240; i++) t = glideTint(t, target, 1 / 60);
    expect(Math.abs(t[2] - target[2])).toBeLessThan(5); // there after 5 s
  });
});

describe('before and after the piece', () => {
  it('wakes up only with the first note of a running piece, while connected', () => {
    expect(isAwake({ playing: true, heard: false, connected: true })).toBe(false);
    expect(isAwake({ playing: true, heard: true, connected: true })).toBe(true);
    expect(isAwake({ playing: false, heard: true, connected: true })).toBe(false);
    expect(isAwake({ playing: true, heard: true, connected: false })).toBe(false);
  });

  it('fades slowly (about 8 s) back to the same dim board after the piece', () => {
    let p = 1;
    for (let i = 0; i < 60 * 4; i++) p = stepPresence(p, false, 1 / 60);
    expect(p).toBeGreaterThan(DIM_PRESENCE + 0.2); // still fading after 4 s
    for (let i = 0; i < 60 * (FADE_SEC - 4 + 0.5); i++) p = stepPresence(p, false, 1 / 60);
    expect(p).toBeCloseTo(DIM_PRESENCE, 6);
    for (let i = 0; i < 60; i++) p = stepPresence(p, false, 1 / 60);
    expect(p).toBeCloseTo(DIM_PRESENCE, 6); // and stays there
  });

  it('wakes up quicker than it fades, and never goes above full', () => {
    let p = DIM_PRESENCE;
    for (let i = 0; i < 60 * 3; i++) p = stepPresence(p, true, 1 / 60);
    expect(p).toBe(1);
  });
});

describe('blooms', () => {
  it('swell and brighten, with a ripple, then end', () => {
    const early = bloomAt(0.1 * BLOOM_SEC, false)!;
    expect(early.scale).toBeGreaterThan(1);
    expect(early.glow).toBeGreaterThan(0);
    expect(early.ripple).not.toBeNull();
    expect(bloomAt(BLOOM_SEC + 0.01, false)).toBeNull();
    expect(bloomAt(-0.01, false)).toBeNull();
  });

  it('with less motion asked for: no ripple and no swell, it only brightens', () => {
    const b = bloomAt(0.1 * BLOOM_SEC, true)!;
    expect(b.ripple).toBeNull();
    expect(b.scale).toBe(1);
    expect(b.glow).toBeGreaterThan(0);
  });
});

describe('the band light', () => {
  it('bumps on a band note, but never more than 3 times a second', () => {
    let last = -Infinity;
    let bumps = 0;
    // Band notes 8 a second for 3 s.
    for (let t = 0; t < 3; t += 0.125) {
      if (bandBump(last, t)) { bumps++; last = t; }
    }
    expect(bumps).toBeLessThanOrEqual(9);
    expect(bumps).toBeGreaterThanOrEqual(6);
  });
});

describe('the board on the screen', () => {
  it('is as big as the screen allows, centred, with square cells', () => {
    const l = boardLayout(1920, 1080, 8, 8);
    expect(l.cell * 8).toBeGreaterThan(1080 * 0.75);
    expect(l.x0 + (l.cell * 8) / 2).toBeCloseTo(960, 0);
    const wide = boardLayout(1920, 1080, 4, 16);
    expect(wide.cell * 16).toBeGreaterThan(1920 * 0.75);
    expect(wide.cell * 16).toBeLessThanOrEqual(1920);
  });
});
