import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone so importing HeadBopKit (transitively from PercussionLayer)
// doesn't crash without a real AudioContext.
vi.mock('tone', () => ({
  MembraneSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
  NoiseSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
  MetalSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
  Player: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), dispose: vi.fn(), volume: { value: 0 } })),
}));

const playSpy = vi.fn();
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({
  RoundRobinDrumKit: vi.fn().mockImplementation(() => ({
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    connect: vi.fn(),
    play: playSpy,
    dispose: vi.fn(),
  })),
}));

import { PercussionLayer } from '../remix/layers/PercussionLayer';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } };
}
function fakeCtx(): AudioContext {
  return { currentTime: 0, createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

const BEATS = [0, 0.5, 1.0, 1.5, 2.0];
const DOWNBEATS = [0, 2.0];

beforeEach(() => vi.clearAllMocks());

describe('PercussionLayer', () => {
  function makeLayer() {
    const layer = new PercussionLayer(fakeCtx(), 'default');
    layer.setBeatGrid(BEATS, DOWNBEATS);
    layer.setEnabled(true);
    return layer;
  }

  it('has id and kind percussion', () => {
    const layer = new PercussionLayer(fakeCtx(), 'default');
    expect(layer.kind).toBe('percussion');
    expect(typeof layer.id).toBe('string');
  });

  it('hit() plays the beat-aware drum for a downbeat', () => {
    const layer = makeLayer();
    layer.hit(0.0, 0.8); // on a downbeat → pickHeadBopDrum returns 'kickCrash'
    expect(playSpy).toHaveBeenCalledTimes(1);
    // The drum name is whatever pickHeadBopDrum returns for t=0 with these
    // beats/downbeats — assert the call happened with velocity 0.8 and a valid drum.
    expect(playSpy.mock.calls[0][1]).toBe(0.8);
  });

  it('hit() picks different drums by beat position', () => {
    const layer = makeLayer();
    layer.hit(0.0, 0.8);   // downbeat → kickCrash
    layer.hit(0.5, 0.8);   // backbeat (beatInBar=1) → snare
    const drumA = playSpy.mock.calls[0][0];
    const drumB = playSpy.mock.calls[1][0];
    expect(drumA).not.toBe(drumB); // beat-aware selection differs
  });

  it('ignores hit() when disabled', () => {
    const layer = makeLayer();
    layer.setEnabled(false);
    layer.hit(0.0, 0.8);
    expect(playSpy).not.toHaveBeenCalled();
  });
});
