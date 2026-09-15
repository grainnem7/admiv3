import { describe, it, expect } from 'vitest';
import { globalSpaceTogglesMute, showGlobalMuteButton } from '../ui/globalShortcuts';

describe('global shortcuts', () => {
  it('Space never toggles the global mute on the Board Sequencer, but still does elsewhere', () => {
    expect(globalSpaceTogglesMute('boardSequencer')).toBe(false);
    expect(globalSpaceTogglesMute('performance')).toBe(true);
    expect(globalSpaceTogglesMute('remix')).toBe(true);
  });
  it('the floating MuteButton is hidden only on the Board Sequencer', () => {
    expect(showGlobalMuteButton('boardSequencer')).toBe(false);
    expect(showGlobalMuteButton('welcome')).toBe(true);
  });
});
