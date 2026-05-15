import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadStemBuffers } from '../remix/loadStemBuffers';

function fakeCtx(): AudioContext {
  return {
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 5 } as AudioBuffer),
  } as unknown as AudioContext;
}

beforeEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }) as unknown as typeof fetch;
});

describe('loadStemBuffers', () => {
  it('decodes every stem URL into a buffer map keyed by stem id', async () => {
    const ctx = fakeCtx();
    const map = await loadStemBuffers(ctx, {
      vocals: 'a/vocals.wav',
      drums: 'a/drums.wav',
    });
    expect([...map.keys()].sort()).toEqual(['drums', 'vocals']);
    expect(map.get('vocals')).toEqual({ duration: 5 });
  });

  it('reports progress as each stem finishes', async () => {
    const ctx = fakeCtx();
    const progress: Array<[number, number]> = [];
    await loadStemBuffers(
      ctx,
      { vocals: 'a/v.wav', drums: 'a/d.wav', bass: 'a/b.wav', other: 'a/o.wav' },
      (loaded, total) => progress.push([loaded, total]),
    );
    expect(progress.length).toBe(4);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  it('throws when a stem URL fails to fetch', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }) as unknown as typeof fetch;
    await expect(
      loadStemBuffers(fakeCtx(), { vocals: 'missing.wav' }),
    ).rejects.toThrow('missing.wav');
  });
});
