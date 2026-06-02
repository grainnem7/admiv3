// src/__tests__/RoundRobinDrumKit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each Tone.Player records its url + a shared start spy tagged with the
// sample's basename (the kit loads via the full `samples/drums/<kit>/<file>`
// path, but tests assert on the bare filename), so we can see WHICH sample fired.
const { startSpy, players } = vi.hoisted(() => ({
  startSpy: vi.fn(),
  players: [] as { url: string }[],
}));

vi.mock('tone', () => {
  // A url containing 'BAD' simulates a 404: fires onerror and reports loaded=false.
  const Player = vi
    .fn()
    .mockImplementation((opts: { url: string; onload?: () => void; onerror?: (e?: unknown) => void }) => {
      players.push({ url: opts.url });
      const bad = opts.url.includes('BAD');
      if (bad) opts.onerror?.(new Error('404'));
      else opts.onload?.();
      return {
        url: opts.url,
        loaded: !bad,
        connect: vi.fn(),
        start: (t?: number) => startSpy(opts.url.split('/').pop(), t),
        dispose: vi.fn(),
        volume: { value: 0 },
      };
    });
  return { Player };
});

import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';

const MANIFEST = {
  kick: ['kick-01.wav', 'kick-02.wav'],
  snare: ['snare-01.wav'],
  hat: ['hat-closed-01.wav'],
  crash: ['crash-01.wav'],
};

function mockFetchOk() {
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(MANIFEST),
  }) as unknown as typeof fetch;
}
function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  players.length = 0;
});

describe('RoundRobinDrumKit', () => {
  it('loads a Player per sample listed in the manifest and becomes ready', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(kit.isReady()).toBe(true);
    expect(players.length).toBe(5); // 2 kick + 1 snare + 1 hat + 1 crash
  });

  it('rotates through a drum’s samples on successive hits', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    kit.play('kick', 0.8);
    kit.play('kick', 0.8);
    kit.play('kick', 0.8);
    const fired = startSpy.mock.calls.map((c) => c[0] as string);
    expect(fired).toEqual(['kick-01.wav', 'kick-02.wav', 'kick-01.wav']); // wraps
  });

  it('kickCrash fires both a kick and a crash', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    kit.play('kickCrash', 0.9);
    const fired = startSpy.mock.calls.map((c) => c[0] as string);
    expect(fired).toContain('kick-01.wav');
    expect(fired).toContain('crash-01.wav');
  });

  it('no-ops play before ready', () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit'); // not awaited
    kit.play('snare', 0.5);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('stays not-ready and no-ops if the manifest fetch fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(kit.isReady()).toBe(false);
    expect(() => kit.play('kick', 1)).not.toThrow();
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('disposes every player', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(() => kit.dispose()).not.toThrow();
    expect(kit.isReady()).toBe(false);
  });

  it('still loads and plays the rest when one sample 404s', async () => {
    // kick has a bad sample among two; snare's only sample is bad.
    (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          kick: ['kick-01.wav', 'kick-BAD.wav'],
          snare: ['snare-BAD.wav'],
          hat: ['hat-closed-01.wav'],
        }),
    }) as unknown as typeof fetch;

    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(kit.isReady()).toBe(true); // one bad sample doesn't wedge the kit

    // kick only ever fires the good sample (the 404'd one is pruned).
    kit.play('kick', 0.8);
    kit.play('kick', 0.8);
    const kicks = startSpy.mock.calls.map((c) => c[0] as string);
    expect(kicks).toEqual(['kick-01.wav', 'kick-01.wav']);

    // snare had only a bad sample → that drum is dropped → play() is a no-op.
    startSpy.mockClear();
    kit.play('snare', 0.8);
    expect(startSpy).not.toHaveBeenCalled();
  });
});
