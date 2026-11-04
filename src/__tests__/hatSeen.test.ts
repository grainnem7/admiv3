import { describe, it, expect } from 'vitest';
import { hatSeenOver, hatSeenWords, trimSeen, HAT_SEEN_LOW, HAT_SEEN_WINDOW_MS, type SeenSample } from '../tracking/cap/hatSeen';

/** `n` pictures a second over `seconds`, each with the source the pattern gives it. */
function pictures(seconds: number, perSec: number, at: (i: number) => SeenSample['source']): SeenSample[] {
  const out: SeenSample[] = [];
  for (let i = 0; i < seconds * perSec; i++) out.push({ t: (i * 1000) / perSec, source: at(i) });
  return out;
}

describe('how well the hat is seen, over the last 10 seconds', () => {
  it('seen in every picture: 100%, never lost, and the pictures a second', () => {
    const r = hatSeenOver(pictures(10, 30, () => 'cap'), 10_000)!;
    expect(r.cap).toBeCloseTo(1, 5);
    expect(r.face).toBe(0);
    expect(r.lost).toBe(0);
    expect(r.fps).toBeCloseTo(30, 0);
  });

  it('shares of the pictures: the cap, the face standing in, and nothing', () => {
    // 6 s cap, 3 s face, 1 s nothing.
    const r = hatSeenOver(pictures(10, 20, (i) => (i < 120 ? 'cap' : i < 180 ? 'face' : 'none')), 10_000)!;
    expect(r.cap).toBeCloseTo(0.6, 5);
    expect(r.face).toBeCloseTo(0.3, 5);
    expect(r.lost).toBe(1);
  });

  it('"lost" counts each time the cap goes out of sight, not the pictures it is out for', () => {
    // Out for 10 pictures, three separate times.
    const r = hatSeenOver(pictures(10, 30, (i) => ((i >= 50 && i < 60) || (i >= 150 && i < 160) || (i >= 250 && i < 260) ? 'none' : 'cap')), 10_000)!;
    expect(r.lost).toBe(3);
    expect(r.cap).toBeCloseTo(0.9, 5);
  });

  it('only the last 10 seconds count, and under a second of pictures is too little to say', () => {
    const old = pictures(10, 30, () => 'none');
    const recent = pictures(10, 30, () => 'cap').map((s) => ({ ...s, t: s.t + 10_000 }));
    expect(hatSeenOver([...old, ...recent], 20_000)!.cap).toBeCloseTo(1, 5);
    expect(hatSeenOver(pictures(0.5, 30, () => 'cap'), 500)).toBeNull();
    expect(hatSeenOver([], 0)).toBeNull();
  });

  it('trimSeen keeps the window, so the list never grows for a whole show', () => {
    const all = pictures(60, 30, () => 'cap');
    const kept = trimSeen(all, 60_000, HAT_SEEN_WINDOW_MS);
    expect(kept.length).toBeLessThanOrEqual(10 * 30 + 1);
    expect(kept[0].t).toBeGreaterThanOrEqual(60_000 - HAT_SEEN_WINDOW_MS);
  });

  it('says it in words a facilitator can read at a glance', () => {
    expect(hatSeenWords({ cap: 0.96, face: 0.03, lost: 1, fps: 28.4, seconds: 10 }))
      .toBe('Hat seen 96% of the last 10 s · out of sight once · 28 pictures a second');
    expect(hatSeenWords({ cap: 0.62, face: 0.2, lost: 4, fps: 12.1, seconds: 10 }))
      .toBe('Hat seen 62% of the last 10 s (the face stood in 20%) · out of sight 4 times · 12 pictures a second');
    expect(hatSeenWords({ cap: 1, face: 0, lost: 0, fps: 30, seconds: 4 }))
      .toBe('Hat seen 100% of the last 4 s · never out of sight · 30 pictures a second');
  });

  it('90% is the line under which Show and the Ready check say so', () => {
    expect(HAT_SEEN_LOW).toBe(0.9);
  });
});
