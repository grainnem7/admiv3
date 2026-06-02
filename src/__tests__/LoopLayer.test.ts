import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track every constructed player (GrainPlayer or plain Player), in order,
// tagged with its __type so tests can assert which kind was built per loop.
const instances: Array<Record<string, unknown>> = [];
function makeInst(type: 'grain' | 'player') {
  const inst = {
    __type: type,
    playbackRate: 1,
    loop: false,
    connect: vi.fn(),
    sync: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(),
    unsync: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
  };
  instances.push(inst);
  return inst;
}
vi.mock('tone', () => ({
  GrainPlayer: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return makeInst('grain');
  }),
  Player: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return makeInst('player');
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

// loop A matches song tempo (rate 1.0 → plain Player); loop B needs stretch (GrainPlayer).
const LOOPS: LoopDef[] = [
  { file: 'a_120bpm.wav', name: 'A', bpm: 120 },
  { file: 'b_140bpm.wav', name: 'B', bpm: 140 },
];

beforeEach(() => {
  instances.length = 0;
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
    expect(instances[0].playbackRate).toBeCloseTo(1.0, 5);   // 120/120
    expect(instances[1].playbackRate).toBeCloseTo(120 / 140, 5);
  });

  it('uses a plain Player when the loop tempo matches the song (no stretch)', () => {
    new LoopLayer(fakeCtx(), [{ file: 'a_120bpm.wav', name: 'A', bpm: 120 }], 120);
    expect(instances).toHaveLength(1);
    expect(instances[0].__type).toBe('player');
  });

  it('uses a GrainPlayer when the loop must be time-stretched', () => {
    new LoopLayer(fakeCtx(), [{ file: 'b_90bpm.wav', name: 'B', bpm: 90 }], 120);
    expect(instances).toHaveLength(1);
    expect(instances[0].__type).toBe('grain');
  });

  it('isReady() true once all players loaded', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.isReady()).toBe(true);
  });

  it('getLoopCount / getLoopName / getActiveLoopIndex', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.getLoopCount()).toBe(2);
    expect(l.getLoopName(1)).toBe('B');
    expect(l.getActiveLoopIndex()).toBe(0);
  });

  it('selectLoop crossfades exactly the right sub-gain up and the rest down', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    const layerGain = gains[0];
    const sub0 = gains[1];
    const sub1 = gains[2];
    l.selectLoop(1);
    expect(l.getActiveLoopIndex()).toBe(1);
    expect(sub1.gain.setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
    expect(sub0.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
    expect(layerGain.gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it('disabled layer is silent; setVolume ramps gain when enabled', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(gains[0].gain.value).toBeCloseTo(0, 5);
    l.setVolume(0.7);
    expect(gains[0].gain.value).toBeCloseTo(0, 5);
    l.setEnabled(true);
    expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.any(Number), expect.any(Number));
    expect(gains[0].gain.value).toBeCloseTo(0.7, 5);
    l.setEnabled(false);
    expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
    expect(gains[0].gain.value).toBeCloseTo(0, 5);
  });

  it('syncStart starts every player at 0; syncStop stops them', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    l.syncStart();
    for (const g of instances) {
      expect(g.start).toHaveBeenCalledWith(0);
      expect(g.loop).toBe(true);
    }
    l.syncStop();
    for (const g of instances) expect(g.stop).toHaveBeenCalled();
  });
});
