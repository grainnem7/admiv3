import { describe, it, expect, vi } from 'vitest';

const fromUrl = vi.fn((url: string) => Promise.resolve({ url }));
vi.mock('tone', () => {
  class Sampler {
    opts: { urls: Record<string, unknown>; onload?: () => void };
    constructor(opts: { urls: Record<string, unknown>; onload?: () => void }) { this.opts = opts; }
    connect = vi.fn();
    dispose = vi.fn();
    triggerAttackRelease = vi.fn();
  }
  return {
    Sampler,
    ToneAudioBuffer: { fromUrl: (url: string) => fromUrl(url) },
    Frequency: () => ({ toNote: () => 'C4' }),
    now: () => 0,
  };
});

import { SamplerPlayer } from '../songs/voices/SamplerPlayer';

/** Samples are fetched and decoded once a session, however many instruments use them. */
describe('the sample cache', () => {
  it('two instruments with the same samples load each file once, and both become ready', async () => {
    const opts = { urls: { C4: 'C4.mp3', C5: 'C5.mp3' }, baseUrl: '/samples/piano/' };
    const a = new SamplerPlayer(opts, {} as AudioNode);
    const b = new SamplerPlayer(opts, {} as AudioNode);
    await new Promise((r) => setTimeout(r, 0));
    expect(fromUrl).toHaveBeenCalledTimes(2);
    expect(fromUrl.mock.calls.map((c) => c[0]).sort()).toEqual(['/samples/piano/C4.mp3', '/samples/piano/C5.mp3']);
    expect(a.isReady()).toBe(true);
    expect(b.isReady()).toBe(true);
  });

  it('an instrument freed before its samples arrive stays silent and never builds', async () => {
    const opts = { urls: { D4: 'D4.mp3' }, baseUrl: '/samples/harp/' };
    const p = new SamplerPlayer(opts, {} as AudioNode);
    p.dispose();
    await new Promise((r) => setTimeout(r, 0));
    expect(p.isReady()).toBe(false);
  });
});
