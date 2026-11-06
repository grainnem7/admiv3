import { describe, it, expect, vi, afterEach } from 'vitest';
import { startTicker } from '../songs/ticker';

/** The engine's heartbeat runs from a worker, which a hidden page doesn't slow down. */
describe('the ticker', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('uses a worker when there is one: started at the pace asked, stopped and ended', () => {
    const made: { posted: unknown[]; terminated: boolean; onmessage: (() => void) | null }[] = [];
    class FakeWorker {
      posted: unknown[] = [];
      terminated = false;
      onmessage: (() => void) | null = null;
      constructor() { made.push(this); }
      postMessage(m: unknown): void { this.posted.push(m); }
      terminate(): void { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const u = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const had = { create: u.createObjectURL, revoke: u.revokeObjectURL };
    u.createObjectURL = () => 'blob:ticker';
    u.revokeObjectURL = () => undefined;
    const tick = vi.fn();
    const t = startTicker(tick, 25);
    expect(made).toHaveLength(1);
    expect(made[0].posted).toEqual([25]);
    made[0].onmessage?.();
    expect(tick).toHaveBeenCalledTimes(1);
    t.stop();
    expect(made[0].terminated).toBe(true);
    u.createObjectURL = had.create;
    u.revokeObjectURL = had.revoke;
  });

  it('without a worker: a plain interval', () => {
    vi.stubGlobal('Worker', undefined);
    vi.useFakeTimers();
    const tick = vi.fn();
    const t = startTicker(tick, 25);
    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(4);
    t.stop();
    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(4);
  });
});
