import { describe, it, expect, vi, beforeEach } from 'vitest';

const port = vi.hoisted(() => ({ send: vi.fn(), clear: vi.fn() }));
vi.mock('../midi/MIDIManager', () => ({
  MIDIManager: { getSelectedOutput: () => port, getConnectedSelectedOutput: () => port, isSelectedConnected: () => true },
}));

import { BoardMidiSender, CLOSE_REPEAT_MS } from '../midi/boardMidi';

/**
 * Closing the browser mid-piece (the owner, 2026-11-06): the sound kept playing in Ableton,
 * frozen, with nothing to stop it. The notes whose offs were still waiting never got them.
 */
describe('the page closing', () => {
  beforeEach(() => { port.send.mockClear(); port.clear.mockClear(); });

  it('a held note gets its off at once, and every channel is told all notes off now and twice more shortly after', () => {
    const t0 = performance.now();
    const sender = new BoardMidiSender({ currentTime: 0, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: t0 }) });
    sender.send({ role: 'bass', origin: 'placed', audioTime: 0.05, durSec: 8, velocity: 0.5, midi: 45, colour: 't' }, false, { enabled: true, sends: 'player' });
    port.send.mockClear();
    sender.closeNow();
    expect(port.clear).toHaveBeenCalled();
    const calls = port.send.mock.calls.map((c) => ({ data: c[0] as number[], at: c[1] as number }));
    const off = calls.find((c) => (c.data[0] & 0xf0) === 0x80 && c.data[1] === 45);
    expect(off).toBeDefined();
    const allOff = calls.filter((c) => (c.data[0] & 0xf0) === 0xb0 && c.data[1] === 123);
    // All 16 channels, three times: now and at each repeat.
    expect(allOff).toHaveLength(16 * (1 + CLOSE_REPEAT_MS.length));
    const times = [...new Set(allOff.map((c) => Math.round(c.at - t0)))].sort((a, b) => a - b);
    expect(times.length).toBe(1 + CLOSE_REPEAT_MS.length);
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(CLOSE_REPEAT_MS[CLOSE_REPEAT_MS.length - 1] - 5);
  });
});
