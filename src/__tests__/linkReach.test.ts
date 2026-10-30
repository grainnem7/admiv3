import { describe, it, expect } from 'vitest';
import {
  checkReach, heardFromOther, HEARTBEAT_MS, LINK_REACH_START, LOST_AFTER_MS, RECOVER_MS, type LinkReach,
} from '../remote/linkReach';

/** The other side speaks every `every` ms from `from` to `to`, looked at every 250 ms. */
function run(s: LinkReach, from: number, to: number, every: number | null, up = true): { s: LinkReach; flips: number } {
  let flips = 0;
  let next = from;
  for (let t = from; t <= to; t += 50) {
    const was = s.reaching;
    if (every !== null && t >= next) { s = heardFromOther(s, t); next = t + every; }
    if (t % 250 === 0) s = checkReach(s, t, up);
    if (s.reaching !== was) flips += 1;
  }
  return { s, flips };
}

describe('is the other side of the iPad link reaching this one (B2)', () => {
  it('the lost time is at least three heartbeats, and about 3–4 s', () => {
    expect(LOST_AFTER_MS).toBeGreaterThanOrEqual(3 * HEARTBEAT_MS);
    expect(LOST_AFTER_MS).toBeGreaterThanOrEqual(3000);
    expect(LOST_AFTER_MS).toBeLessThanOrEqual(4000);
  });

  it('the first message counts at once: a new iPad shows as connected straight away', () => {
    expect(heardFromOther(LINK_REACH_START, 1000).reaching).toBe(true);
  });

  it('a stalled link: lost about 3.5 s after the last message, never before 3 s', () => {
    let s = run(LINK_REACH_START, 0, 10_000, HEARTBEAT_MS).s;
    expect(s.reaching).toBe(true);
    // The last heartbeat was at 10 000 ms; then nothing gets through.
    s = checkReach(s, 13_000, true);
    expect(s.reaching).toBe(true);
    s = checkReach(s, 13_600, true);
    expect(s.reaching).toBe(false);
  });

  it('a socket that drops is lost at once', () => {
    const s = run(LINK_REACH_START, 0, 3000, HEARTBEAT_MS).s;
    expect(checkReach(s, 3100, false).reaching).toBe(false);
  });

  it('a short hiccup under load (heartbeats 2.5 s late) never flickers it', () => {
    let s = run(LINK_REACH_START, 0, 5000, HEARTBEAT_MS).s;
    const late = run(s, 5050, 20_000, 2500);
    s = late.s;
    expect(late.flips).toBe(0);
    expect(s.reaching).toBe(true);
  });

  it('once lost, it comes back only after steady contact, and a lone message does not bring it back', () => {
    let s = run(LINK_REACH_START, 0, 5000, HEARTBEAT_MS).s;
    s = run(s, 5050, 10_000, null).s;
    expect(s.reaching).toBe(false);
    // One message gets through, then silence again: still lost.
    s = heardFromOther(s, 10_100);
    expect(s.reaching).toBe(false);
    s = run(s, 10_150, 14_000, null).s;
    expect(s.reaching).toBe(false);
    // Steady again: back once it has held for RECOVER_MS, not before.
    s = heardFromOther(s, 14_100);
    s = heardFromOther(s, 14_100 + RECOVER_MS - 600);
    expect(s.reaching).toBe(false);
    s = heardFromOther(s, 14_100 + RECOVER_MS + 100);
    expect(s.reaching).toBe(true);
  });

  it('a link that comes and goes every second shows as lost, without flickering back and forth', () => {
    let s = run(LINK_REACH_START, 0, 5000, HEARTBEAT_MS).s;
    s = run(s, 5050, 9000, null).s;
    expect(s.reaching).toBe(false);
    // Bursts of contact shorter than the recovery time, with silences between that break it.
    let flips = 0;
    for (let k = 0; k < 5; k++) {
      const a = 9000 + k * 4000;
      const burst = run(s, a, a + 1000, 500);
      const quiet = run(burst.s, a + 1050, a + 3950, null);
      flips += burst.flips + quiet.flips;
      s = quiet.s;
    }
    expect(flips).toBe(0);
    expect(s.reaching).toBe(false);
  });
});
