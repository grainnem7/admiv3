/**
 * Undo and redo for the edits (producer flow, item 5): counters put down or lifted on the
 * laptop board, loops kept, cleared or renamed, scenes made or changed, the piece's length
 * and ending, when colours come in. Settings that the sound follows live (speed, world,
 * the helpers) are not here: the engine would not follow an undo of them, and they have
 * their own Previous where it matters. Pure, so the rules are tested on their own.
 */
import type { BoardSequencerStored } from '../../../profiles/BoardSequencerConfig';

export const EDIT_KEYS = ['laptopBoard', 'loopSlots', 'loopNames', 'scenes', 'performance', 'colourComesInAt'] as const;
/** Keys a recorded patch may carry besides the edit keys: they travel with the scenes. */
const WITH_KEYS = new Set<string>([...EDIT_KEYS, 'currentScene']);

export interface EditEntry {
  keys: string[];
  before: Partial<BoardSequencerStored>;
  after: Partial<BoardSequencerStored>;
  at: number;
}
export interface EditHistory { undo: EditEntry[]; redo: EditEntry[] }

export const EMPTY_HISTORY: EditHistory = { undo: [], redo: [] };
export const UNDO_LIMIT = 50;
/** Quick patches of the same keys (typing a name, a slider) are one undo step. */
export const COALESCE_MS = 600;
/** Only typing and sliders merge: every counter put down, loop kept or scene changed is a step of its own. */
const COALESCE_KEYS = new Set<string>(['loopNames', 'performance', 'colourComesInAt']);

/** A patch is an edit when it touches an edit key and nothing outside the edit keys. */
export function isEdit(patchKeys: readonly string[]): boolean {
  return patchKeys.some((k) => (EDIT_KEYS as readonly string[]).includes(k)) && patchKeys.every((k) => WITH_KEYS.has(k));
}

const pick = (c: BoardSequencerStored, keys: readonly string[]): Partial<BoardSequencerStored> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (c as unknown as Record<string, unknown>)[k];
  return out as Partial<BoardSequencerStored>;
};

/** The history after a patch of `patchKeys` took the config from `prev` to `next`. */
export function recordEdit(
  h: EditHistory, prev: BoardSequencerStored, next: BoardSequencerStored, patchKeys: readonly string[], now: number,
): EditHistory {
  if (!isEdit(patchKeys)) return h;
  const keys = patchKeys.filter((k) => (prev as unknown as Record<string, unknown>)[k] !== (next as unknown as Record<string, unknown>)[k]);
  if (keys.length === 0) return h;
  const last = h.undo[h.undo.length - 1];
  const same = last && last.keys.length === keys.length && keys.every((k) => last.keys.includes(k));
  if (same && now - last.at < COALESCE_MS && keys.every((k) => COALESCE_KEYS.has(k))) {
    const merged: EditEntry = { ...last, after: pick(next, keys), at: now };
    return { undo: [...h.undo.slice(0, -1), merged], redo: [] };
  }
  const entry: EditEntry = { keys, before: pick(prev, keys), after: pick(next, keys), at: now };
  return { undo: [...h.undo, entry].slice(-UNDO_LIMIT), redo: [] };
}

export function undoEdit(h: EditHistory): { history: EditHistory; patch: Partial<BoardSequencerStored>; keys: string[] } | null {
  const last = h.undo[h.undo.length - 1];
  if (!last) return null;
  return { history: { undo: h.undo.slice(0, -1), redo: [...h.redo, last] }, patch: last.before, keys: last.keys };
}

export function redoEdit(h: EditHistory): { history: EditHistory; patch: Partial<BoardSequencerStored>; keys: string[] } | null {
  const last = h.redo[h.redo.length - 1];
  if (!last) return null;
  return { history: { undo: [...h.undo, last], redo: h.redo.slice(0, -1) }, patch: last.after, keys: last.keys };
}

/** What an undo put back, in words. */
export function describeEdit(keys: readonly string[]): string {
  if (keys.includes('laptopBoard')) return 'the board';
  if (keys.includes('scenes')) return 'the scenes';
  if (keys.includes('loopSlots') || keys.includes('loopNames')) return 'the loops';
  if (keys.includes('performance')) return 'the piece';
  if (keys.includes('colourComesInAt')) return 'when the colours come in';
  return 'the change';
}

/** Where a key press is typing, where the browser's own undo belongs. */
const TYPING_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable="true"]';

/** Ctrl+Z (Cmd+Z on a Mac) undoes; Ctrl+Shift+Z or Ctrl+Y redoes. Never while typing, never held down. */
export function undoKey(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean },
  target: EventTarget | null,
): 'undo' | 'redo' | null {
  if (e.repeat || e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  if (target instanceof Element && target.closest(TYPING_SELECTOR) !== null) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}
