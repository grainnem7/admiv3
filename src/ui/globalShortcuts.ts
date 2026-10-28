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

/**
 * The facilitator's Debug Panel is a programmer's tool. It is never part of the build the
 * show runs (production), and in development it opens only when the address asks for it
 * (?debug). Before, a "d" typed anywhere opened it over the board, saying "Muted: Yes" (T4-11).
 */
export function debugPanelAllowed(o: { dev: boolean; search: string }): boolean {
  return o.dev && new URLSearchParams(o.search).has('debug');
}

/** Focus is somewhere a letter is typed or picks from a list: text boxes, selects, editable text. */
function takesTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true
    || el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null;
}

/** A plain "d", not typed into a text box, a list or editable text: the Debug Panel's key. */
export function isDebugKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>, focused: Element | null,
): boolean {
  if (e.key !== 'd' && e.key !== 'D') return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return !takesTyping(focused);
}
