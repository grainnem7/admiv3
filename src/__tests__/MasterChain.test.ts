// src/__tests__/MasterChain.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Wrapped in vi.hoisted so the hoisted vi.mock factory below can reference
// these spies at factory-evaluation time (e.g. `connect: connectSpy`) without
// hitting a temporal-dead-zone ReferenceError under Vitest's mock hoisting.
const { disposeSpy, connectSpy, chainSpy, toDestSpy } = vi.hoisted(() => ({
  disposeSpy: vi.fn(),
  connectSpy: vi.fn(),
  chainSpy: vi.fn(),
  toDestSpy: vi.fn(),
}));

vi.mock('tone', () => {
  const node = () => ({
    chain: chainSpy,
    toDestination: toDestSpy,
    dispose: disposeSpy,
    connect: vi.fn(),
    disconnect: vi.fn(),
    wet: { value: 1 },
    gain: { value: 1 },
  });
  return {
    EQ3: vi.fn(() => node()),
    Compressor: vi.fn(() => node()),
    WaveShaper: vi.fn(() => node()),
    Limiter: vi.fn(() => node()),
    connect: connectSpy,
    getDestination: vi.fn(() => node()),
  };
});

import { MasterChain } from '../audio/MasterChain';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return {
    createGain: vi.fn(() => fakeNode()),
    destination: {},
  } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('MasterChain', () => {
  it('exposes a raw input node from the context', () => {
    const ctx = fakeCtx();
    const mc = new MasterChain(ctx);
    expect(ctx.createGain).toHaveBeenCalled();
    expect(mc.input).toBeDefined();
  });

  it('builds the full Tone chain when Tone is available', async () => {
    const Tone = await import('tone');
    const mc = new MasterChain(fakeCtx());
    expect(Tone.EQ3).toHaveBeenCalledTimes(1);
    expect(Tone.Compressor).toHaveBeenCalledTimes(1);
    expect(Tone.WaveShaper).toHaveBeenCalledTimes(1);
    expect(Tone.Limiter).toHaveBeenCalledTimes(1);
    // raw input bridged into the first Tone node, and limiter → destination
    expect(connectSpy).toHaveBeenCalled();
    expect(toDestSpy).toHaveBeenCalled();
    mc.dispose();
  });

  it('disposes every Tone node it created', () => {
    const mc = new MasterChain(fakeCtx());
    mc.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(4); // eq, comp, shaper, limiter
  });

  it('falls back to a dry pass-through if a Tone constructor is missing', async () => {
    vi.resetModules();
    vi.doMock('tone', () => ({})); // no EQ3/Compressor/etc.
    const { MasterChain: MC } = await import('../audio/MasterChain');
    const ctx = fakeCtx();
    const input = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
    (ctx.createGain as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(input);
    const mc = new MC(ctx);
    // pass-through wires input straight to ctx.destination, no throw
    expect(input.connect).toHaveBeenCalledWith(ctx.destination);
    expect(() => mc.dispose()).not.toThrow();
    vi.doUnmock('tone');
  });
});
