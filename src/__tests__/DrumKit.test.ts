import { describe, it, expect, vi, beforeEach } from 'vitest';

const triggerSpy = vi.fn();
const disposeSpy = vi.fn();

vi.mock('tone', () => {
  const Player = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      start: triggerSpy,
      stop: vi.fn(),
      dispose: disposeSpy,
      volume: { value: 0 },
    };
  });
  return { Player };
});

import { DrumKit } from '../remix/layers/DrumKit';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('DrumKit', () => {
  it('loads a player per drum and is ready when all load', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    expect(kit.isReady()).toBe(true); // mock fires onload synchronously
  });

  it('plays the named drum', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.connect(fakeNode() as unknown as AudioNode);
    kit.play('kick', 0.8);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('kickCrash fires two players (kick + crash)', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.play('kickCrash', 0.9);
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });

  it('no-ops play before ready', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    // @ts-expect-error force the private ready flag false for the test
    kit.ready = false;
    kit.play('snare', 0.5);
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('dispose tears down all players', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(4); // kick, snare, hat, crash
  });
});
