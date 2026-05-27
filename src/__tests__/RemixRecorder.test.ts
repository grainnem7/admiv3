import { describe, it, expect } from 'vitest';
import { RemixRecorder } from '../remix/recording/RemixRecorder';

describe('RemixRecorder', () => {
  it('does nothing when disarmed', () => {
    const r = new RemixRecorder();
    r.capture({ kind: 'percussion', velocity: 0.8 }, 5);
    expect(r.commitTake().events).toEqual([]);
  });

  it('captures events with t relative to section start', () => {
    const r = new RemixRecorder();
    r.arm(4, 8); // section starts at 4s, length 8s
    r.capture({ kind: 'percussion', velocity: 0.8 }, 6); // t = 2
    const take = r.commitTake();
    expect(take.events).toEqual([{ t: 2, kind: 'percussion', velocity: 0.8 }]);
    expect(take.muted).toBe(false);
    expect(typeof take.id).toBe('string');
  });

  it('wraps t into [0,length) when transport passes the section end', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 1 }, 9); // 9 % 8 = 1
    expect(r.commitTake().events[0].t).toBeCloseTo(1, 5);
  });

  it('dedups unchanged continuous params but keeps changes', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 1); // unchanged → dropped
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.9 }, 2); // changed → kept
    const take = r.commitTake();
    expect(take.events.map((e) => (e as { value: number }).value)).toEqual([0.5, 0.9]);
  });

  it('always records every percussion hit (never deduped)', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 0.8 }, 0);
    r.capture({ kind: 'percussion', velocity: 0.8 }, 1);
    expect(r.commitTake().events).toHaveLength(2);
  });

  it('commitTake clears the buffer and resets continuous baseline', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    r.commitTake();
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    expect(r.commitTake().events).toHaveLength(1);
  });

  it('events are sorted by t on commit', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 1 }, 5);
    r.capture({ kind: 'percussion', velocity: 1 }, 2);
    expect(r.commitTake().events.map((e) => e.t)).toEqual([2, 5]);
  });
});
