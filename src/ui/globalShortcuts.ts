import type { Screen } from '../state/types';

/**
 * The Board Sequencer has its own engine and Mute; the global Space-to-mute (which only
 * drives the legacy AudioEngine) must not fire there, even when focus is on <body>.
 */
export function globalSpaceTogglesMute(screen: Screen): boolean {
  return screen !== 'boardSequencer';
}

/** The always-visible MuteButton shows the legacy mute, which doesn't silence the board. */
export function showGlobalMuteButton(screen: Screen): boolean {
  return screen !== 'boardSequencer';
}
