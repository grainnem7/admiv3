import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture each GrainPlayer instance so we can assert per-loop state.
const grainInstances: Array<Record<string, unknown>> = [];
vi.mock('tone', () => ({
  GrainPlayer: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    const inst = {
      playbackRate: 1,
      loop: false,
      connect: vi.fn(),
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      unsync: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      dispose: vi.fn(),
    };
    grainInstances.push(inst);
    return inst;
  }),
}));

import { LoopLayer } from '../remix/layers/LoopLayer';
import type { LoopDef } from '../remix/layers/loopManifest';

const gains: Array<{ gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }> = [];
function fakeGain() {
  const g = { value: 0, setTargetAtTime: vi.fn((v: number) => { g.value = v; }) };
  const node = { connect: vi.fn(), disconnect: vi.fn(), gain: g };
  gains.push(node as unknown as { gain: typeof g });
  return node;
}
function fakeCtx(): AudioContext {
  return { currentTime: 0, createGain: vi.fn(() => fakeGain()) } as unknown as AudioContext;
}

const LOOPS: LoopDef[] = [
  { file: 'a_120bpm.wav', name: 'A', bpm: 120 },
  { file: 'b_140bpm.wav', name: 'B', bpm: 140 },
];

beforeEach(() => {
  grainInstances.length = 0;
  gains.length = 0;
  vi.clearAllMocks();
});

describe('LoopLayer', () => {
  it('has id "loop" and kind "loop"', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.id).toBe('loop');
    expect(l.kind).toBe('loop');
  });

  it('sets playbackRate = songBpm / loopBpm per loop', () => {
    new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(grainInstances[0].playbackRate).toBeCloseTo(1.0, 5);   // 120/120
    expect(grainInstances[1].playbackRate).toBeCloseTo(120 / 140, 5);
  });

  it('isReady() true once all players loaded', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.isReady()).toBe(true);
  });

  it('getLoopCount / getLoopName / getActiveLoopIndex', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.getLoopCount()).toBe(2);
    expect(l.getLoopName(1)).toBe('B');
    expect(l.getActiveLoopIndex()).toBe(0); // first loop active by default
  });

  it('selectLoop gates exactly one sub-gain on, others off', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    // gains[0] = layer gain; gains[1..] = per-loop sub-gains in order.
    l.selectLoop(1);
    expect(l.getActiveLoopIndex()).toBe(1);
    expect(gains[1].gain.value).toBeCloseTo(0, 5); // loop 0 sub-gain off
    expect(gains[2].gain.value).toBeCloseTo(1, 5); // loop 1 sub-gain on
  });

  it('disabled layer is silent; setVolume applies when enabled', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(gains[0].gain.value).toBeCloseTo(0, 5); // layer gain starts at 0
    l.setVolume(0.7);
    expect(gains[0].gain.value).toBeCloseTo(0, 5); // still disabled
    l.setEnabled(true);
    expect(gains[0].gain.value).toBeCloseTo(0.7, 5);
    l.setEnabled(false);
    expect(gains[0].gain.value).toBeCloseTo(0, 5);
  });

  it('syncStart starts every player at 0; syncStop stops them', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    l.syncStart();
    for (const g of grainInstances) {
      expect(g.start).toHaveBeenCalledWith(0);
      expect(g.loop).toBe(true);
    }
    l.syncStop();
    for (const g of grainInstances) expect(g.stop).toHaveBeenCalled();
  });
});
