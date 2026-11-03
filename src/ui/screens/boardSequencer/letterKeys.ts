import type { BoardScreenView } from './spaceKey';

/**
 * The letter keys (producer flow, item 6): M mutes, N is Next scene, E is End piece, and
 * 1, 2, 3 are Board, Make a piece and Show. One key, no modifier, never while typing, never
 * held down, never in Set up, and off altogether when the owner switches them off (a switch
 * box may send letters). N and E only while the piece plays; M only while the board plays.
 */
export type LetterKeyAction = 'mute' | 'nextScene' | 'endPiece' | 'viewBoard' | 'viewPiece' | 'viewShow';

/** Where a key press is typing, not a command. */
const TYPING_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable="true"]';

export const LETTER_KEYS: Record<string, LetterKeyAction> = {
  m: 'mute', n: 'nextScene', e: 'endPiece', 1: 'viewBoard', 2: 'viewPiece', 3: 'viewShow',
};

export function letterKeyAction(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean },
  view: BoardScreenView, target: EventTarget | null,
  s: { running: boolean; pieceOn: boolean; keysOn: boolean },
): LetterKeyAction | null {
  if (!s.keysOn || view === 'setup' || e.repeat) return null;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (target instanceof Element && target.closest(TYPING_SELECTOR) !== null) return null;
  const act = LETTER_KEYS[e.key.toLowerCase()];
  if (!act) return null;
  if (act === 'mute' && !s.running) return null;
  if ((act === 'nextScene' || act === 'endPiece') && !s.pieceOn) return null;
  return act;
}
