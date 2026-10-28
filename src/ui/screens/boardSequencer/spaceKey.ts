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

/**
 * ▶ Play takes the place of ■ Stop: a press this soon after a stop is the same press
 * bouncing, not a wish to play again (T4-16: "press twice" restarted the board). The same
 * for Space and for ▶ Start the piece (ledger M7).
 */
export const PLAY_AFTER_STOP_MS = 400;

export function spaceTogglesPlay(view: BoardScreenView, target: EventTarget | null): boolean {
  if (view === 'setup') return false;
  if (target instanceof Element && target.closest(CONTROL_SELECTOR) !== null) return false;
  return true;
}

export type SpaceAction = 'startPiece' | 'play' | 'stop' | 'none';

/**
 * What one Space press does (R2-T4-01). In Show, stopped, it is ▶ Start the piece — the
 * piece, with its clock and its opening scene, never plain play (Show is for the piece,
 * and Space is the owner's play key). In Play it is ▶ Play: plain play. Playing, it is
 * ■ Stop (two presses while the piece's clock runs, as the button). A press straight after
 * a Stop starts nothing, as with the buttons; and while the offer to carry on after a
 * reload is on screen, nothing — plain Play under it would hide the offer and start the
 * board with no piece.
 */
export function spaceAction(
  view: BoardScreenView, target: EventTarget | null,
  s: { running: boolean; offerShowing: boolean; msSinceStop: number },
): SpaceAction {
  if (!spaceTogglesPlay(view, target)) return 'none';
  if (s.offerShowing) return 'none';
  if (s.running) return 'stop';
  if (s.msSinceStop < PLAY_AFTER_STOP_MS) return 'none';
  return view === 'bigBoard' ? 'startPiece' : 'play';
}
