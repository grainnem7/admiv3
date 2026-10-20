import { vi } from 'vitest';

/**
 * A complete stand-in for one of the engine's per-colour voice slots, for tests that
 * build the engine's insides by hand. Everything Evolve and the mix touch is here, so a
 * test that only cares about notes does not fill the log with errors from the parts it
 * left out (which also hid real failures there).
 */
export function fakeVoiceEntry(play: ReturnType<typeof vi.fn> = vi.fn()) {
  const gain = () => ({ gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
  return {
    voice: { play, setBrightness: vi.fn(), connect: vi.fn(), dispose: vi.fn(), isReady: () => true },
    gain: gain(), rev: gain(), del: gain(), revBase: 0.2, delBase: 0, toneBase: 1,
  };
}
