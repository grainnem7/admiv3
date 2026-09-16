/**
 * Space starts and stops the board — but only where that is what it means.
 *
 * In Set up, Space belongs to whatever is focused (and starting the sequencer mid-setup
 * would be a nasty surprise). Anywhere, if a control has focus, Space is that control's:
 * pressing Space on a button must press the button, not also toggle playback.
 */
export type BoardScreenView = 'setup' | 'play' | 'bigBoard';

const CONTROL_SELECTOR = [
  'button', 'select', 'input', 'textarea', 'a[href]',
  '[role="switch"]', '[role="tab"]', '[role="radio"]', '[role="slider"]',
  '[contenteditable="true"]',
].join(', ');

export function spaceTogglesPlay(view: BoardScreenView, target: EventTarget | null): boolean {
  if (view === 'setup') return false;
  if (target instanceof Element && target.closest(CONTROL_SELECTOR) !== null) return false;
  return true;
}
