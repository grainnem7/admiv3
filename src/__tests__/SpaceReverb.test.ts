// src/__tests__/SpaceReverb.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Wrapped in vi.hoisted so the hoisted vi.mock factory below can reference
// these spies at factory-evaluation time without a temporal-dead-zone error.
const { disposeSpy, connectSpy } = vi.hoisted(() => ({
  disposeSpy: vi.fn(),
  connectSpy: vi.fn(),
}));

vi.mock('tone', () => {
  const node = () => ({
    dispose: disposeSpy,
    connect: vi.fn(),
    disconnect: vi.fn(),
    wet: { value: 0 },
  });
  return {
    Reverb: vi.fn(() => node()),
    connect: connectSpy,
  };
});

import { SpaceReverb } from '../audio/SpaceReverb';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()), destination: {} } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('SpaceReverb', () => {
  it('exposes a raw send node and wires send → reverb → output', async () => {
    const Tone = await import('tone');
    const output = fakeNode() as unknown as AudioNode;
    const sr = new SpaceReverb(fakeCtx(), output);
    expect(sr.send).toBeDefined();
    expect(Tone.Reverb).toHaveBeenCalledTimes(1);
    // send bridged into reverb, reverb bridged into output (2 Tone.connect calls)
    expect(connectSpy).toHaveBeenCalledTimes(2);
    sr.dispose();
  });

  it('setSendLevel updates the send gain', () => {
    const sr = new SpaceReverb(fakeCtx(), fakeNode() as unknown as AudioNode);
    sr.setSendLevel(0.5);
    expect(sr.send.gain.value).toBe(0.5);
  });

  it('disposes the reverb', () => {
    const sr = new SpaceReverb(fakeCtx(), fakeNode() as unknown as AudioNode);
    sr.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a no-op send if Reverb is missing', async () => {
    vi.resetModules();
    vi.doMock('tone', () => ({}));
    const { SpaceReverb: SR } = await import('../audio/SpaceReverb');
    const sr = new SR(fakeCtx(), fakeNode() as unknown as AudioNode);
    expect(sr.send).toBeDefined();
    expect(() => sr.dispose()).not.toThrow();
    vi.doUnmock('tone');
  });
});
