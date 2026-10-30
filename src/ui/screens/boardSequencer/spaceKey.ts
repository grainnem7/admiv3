/**
 * Space starts and stops the board — but only where that is what it means.
 *
 * In Set up, Space belongs to whatever is focused (and starting the sequencer mid-setup
 * would be a nasty surprise). Anywhere, if a control has focus, Space is that control's:
 * pressing Space on a button must press the button, not also toggle playback.
 */
export type BoardScreenView = 'setup' | 'play' | 'bigBoard';

const CONTROL_SELECTOR = [
  // A <summary> opens and closes its list ("Earlier takes"): Space is its own (R2-T4-05).
  'button', 'select', 'input', 'textarea', 'a[href]', 'summary',
  '[role="switch"]', '[role="tab"]', '[role="radio"]', '[role="slider"]',
  '[contenteditable="true"]',
].join(', ');

/**
 * ▶ Play takes the place of ■ Stop: a press this soon after a stop is the same press
 * bouncing, not a wish to play again (T4-16: "press twice" restarted the board). The same
 * for Space and for ▶ Start the piece (ledger M7).
 */
export const PLAY_AFTER_STOP_MS = 400;

/**
 * After the piece ends by itself (its ending has rung out, or the end time came), nothing
 * starts for a while: ■ Stop pressed once during the ending waits 4 s for its second press,
 * and the piece can end inside that wait. The second press found ▶ Start the piece there and
 * began the whole piece again, straight after its last chord.
 */
export const START_AFTER_PIECE_MS = 5000;

/** A start now would be the same press bouncing, or the second press of a Stop the piece's end overtook. */
export function startTooSoon(msSinceStop: number, msSincePieceEnded: number): boolean {
  return msSinceStop < PLAY_AFTER_STOP_MS || msSincePieceEnded < START_AFTER_PIECE_MS;
}

export function spaceTogglesPlay(view: BoardScreenView, target: EventTarget | null, spaceOn = true): boolean {
  // Switched off in Advanced (A7): a switch box often sends Space, and Shift+S still works.
  if (!spaceOn || view === 'setup') return false;
  if (target instanceof Element && target.closest(CONTROL_SELECTOR) !== null) return false;
  return true;
}

export type SpaceAction = 'startPiece' | 'play' | 'stop' | 'none';

/**
 * What one Space press does (R2-T4-01). In Show it is ▶ Start the piece — the piece, with
 * its clock and its opening scene, never plain play (Show is for the piece, and Space is the
 * owner's play key) — stopped, and also while Tim warms up on a playing board, where it
 * starts the piece with no gap (R3-TA-01: Space stopped him first); once the piece plays
 * (`pieceOn`: its clock, its ending, or its start loading) it is ■ Stop, two presses as the
 * button. In Play it is ▶ Play: plain play, and ■ Stop while playing. A press straight after
 * a Stop starts nothing, as with the buttons; and while the offer to carry on after a
 * reload is on screen, nothing — plain Play under it would hide the offer and start the
 * board with no piece.
 */
export function spaceAction(
  view: BoardScreenView, target: EventTarget | null,
  s: { running: boolean; offerShowing: boolean; msSinceStop: number; msSincePieceEnded: number; pieceOn: boolean; spaceOn?: boolean },
): SpaceAction {
  if (!spaceTogglesPlay(view, target, s.spaceOn)) return 'none';
  if (s.offerShowing) return 'none';
  if (s.running) return view === 'bigBoard' && !s.pieceOn ? 'startPiece' : 'stop';
  if (startTooSoon(s.msSinceStop, s.msSincePieceEnded)) return 'none';
  return view === 'bigBoard' ? 'startPiece' : 'play';
}

/** Where a key press is typing, not a command. */
const TYPING_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable="true"]';

/**
 * Shift+S: the owner's Simplify (and Back to full), in Play and Show while the board plays.
 * Two keys together so it is never hit by accident; never while typing, never held down,
 * and never with Ctrl, Alt or Cmd (those are the browser's).
 */
export function simplifyKey(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean },
  view: BoardScreenView, target: EventTarget | null, running: boolean,
): boolean {
  if (!running || view === 'setup' || e.repeat) return false;
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.key !== 'S') return false;
  return !(target instanceof Element && target.closest(TYPING_SELECTOR) !== null);
}
