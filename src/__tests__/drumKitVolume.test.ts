import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({ Player: vi.fn() }));

import { RoundRobinDrumKit, velToDb } from '../audio/instruments/RoundRobinDrumKit';

interface FakePlayer {
  loaded: boolean;
  volume: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
  start: ReturnType<typeof vi.fn>;
}

/** A kit with one loaded 'kick' player, bypassing the async sample load. */
function kitWithPlayer(): { kit: RoundRobinDrumKit; player: FakePlayer } {
  const player: FakePlayer = {
    loaded: true,
    volume: { value: 0, setValueAtTime: vi.fn() },
    start: vi.fn(),
  };
  const kit = new RoundRobinDrumKit({} as AudioContext, 'test-kit');
  const priv = kit as unknown as { samples: Map<string, FakePlayer[]>; ready: boolean };
  priv.samples.set('kick', [player]);
  priv.ready = true;
  return { kit, player };
}

/**
 * Two hits scheduled ahead of time must keep their own volumes. Writing `volume.value`
 * applies immediately, so a quiet ghost note scheduled beside an accent made both loud.
 */
describe('drum kit volume scheduling', () => {
  it('schedules each hit volume at its own time', () => {
    const { kit, player } = kitWithPlayer();
    kit.play('kick', 0.2, 10);
    kit.play('kick', 1, 10.5);
    expect(player.volume.setValueAtTime).toHaveBeenNthCalledWith(1, velToDb(0.2), 10);
    expect(player.volume.setValueAtTime).toHaveBeenNthCalledWith(2, velToDb(1), 10.5);
    expect(player.volume.value).toBe(0); // never written immediately
    expect(player.start).toHaveBeenNthCalledWith(1, 10);
  });

  it('falls back to an immediate write when no time is given', () => {
    const { kit, player } = kitWithPlayer();
    kit.play('kick', 0.5);
    expect(player.volume.setValueAtTime).not.toHaveBeenCalled();
    expect(player.volume.value).toBe(velToDb(0.5));
  });
});
