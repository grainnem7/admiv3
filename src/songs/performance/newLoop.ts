/**
 * New loop: composing a loop from silence. The only sound is the player's counters —
 * no band, no Extra notes, no Sounds change, no other loop — unless the owner asks to
 * hear it with one of those ("Hear it with…") before keeping it.
 *
 * Counters left on the board from before would sound as soon as the loop starts, so
 * nothing sounds until the board has been seen empty once (or the owner says "Start with
 * these"). Pure: the screen holds the state and feeds it to the engine.
 */
import type { BandLevel } from '../band/band';
import { LAUNCH_SLOTS } from './launcher';

export type NewLoopPhase = 'waitEmpty' | 'composing';

export interface NewLoopState {
  phase: NewLoopPhase;
  /** Counters still on the board while waiting for it to be empty. */
  leftover: number;
  /** What the owner asked to hear the loop with, while composing. */
  with: { band: boolean; fill: boolean; loop: number | null };
}

const NOTHING: NewLoopState['with'] = { band: false, fill: false, loop: null };

/** Begin: silent, and waiting while anything is still on the board. */
export function startNewLoop(countersOnBoard: number): NewLoopState {
  return { phase: countersOnBoard > 0 ? 'waitEmpty' : 'composing', leftover: countersOnBoard, with: NOTHING };
}

/** The board has been seen with this many counters: once empty, composing can begin. */
export function boardSeen(s: NewLoopState, countersOnBoard: number): NewLoopState {
  if (s.phase === 'composing') return s;
  if (countersOnBoard === 0) return { ...s, phase: 'composing', leftover: 0 };
  // Unchanged is the same state, so looking again and again redraws nothing.
  return countersOnBoard === s.leftover ? s : { ...s, leftover: countersOnBoard };
}

/** The owner keeps the counters already on the board as the start of the loop. */
export function startWithThese(s: NewLoopState): NewLoopState {
  return { ...s, phase: 'composing', leftover: 0 };
}

/** Hear it with the band, Extra notes, or one other loop (null = none). */
export function hearWith(s: NewLoopState, what: Partial<NewLoopState['with']>): NewLoopState {
  return { ...s, with: { ...s.with, ...what } };
}

/**
 * Stop: whatever the loop was being heard with ends too. Stop means silence, and Play
 * after it must bring back only the counters, not a loop the owner had picked to hear
 * alongside (that loop came back, and its row said "fading in…").
 */
export function stopHearing(s: NewLoopState): NewLoopState {
  const w = s.with;
  return w.band || w.fill || w.loop !== null ? { ...s, with: NOTHING } : s;
}

/**
 * The loop Keep fills: the first one with nothing in it that no scene still uses. A loop
 * cleared while a scene still names it is never refilled: the new loop would play in that
 * scene in its place, unasked, under the old loop's name. Null when every loop is taken.
 */
export function slotForKeep(
  loopSlots: readonly (readonly unknown[] | null | undefined)[], scenes: readonly { loops: readonly number[] }[],
): number | null {
  const used = new Set(scenes.flatMap((s) => s.loops));
  for (let i = 0; i < LAUNCH_SLOTS; i++) {
    if ((loopSlots[i]?.length ?? 0) === 0 && !used.has(i)) return i;
  }
  return null;
}

/** A quick name, numbered when another loop already has it: "Bed", then "Bed 2", "Bed 3". */
export function quickName(base: string, taken: readonly string[]): string {
  const names = new Set(taken.map((n) => n.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * The player's own counters as the engine should hear them: none while waiting for the
 * board to be seen empty (counters left from before must not sound), all of them otherwise.
 */
export function playerCellsFor<C>(s: NewLoopState | null, cells: readonly C[]): C[] {
  return s?.phase === 'waitEmpty' ? [] : [...cells];
}

/**
 * The loops that play: the wanted ones normally; during a new loop only the one asked for
 * with "Hear it with…". The same rule at Play and while playing, so pressing Play during a
 * new loop neither loses the loop being heard nor brings back the ones New loop stopped.
 */
export function loopsToPlay(
  s: NewLoopState | null, wanted: Iterable<number>,
  own: { band: BandLevel; fillAmount: number; evolveAmount: number },
): number[] {
  const slots = s ? engineSettingsFor(s, own).loops : [...wanted];
  return [...new Set(slots)].sort((a, b) => a - b);
}

/** How loud Extra notes are when asked for while composing: enough to hear, never busy. */
const HEAR_FILL = 0.3;

/**
 * What the engine should play: the player's own settings outside a new loop; silence
 * while waiting for an empty board; while composing, only what was asked for. Sounds
 * change is never on while making a loop: a kept loop must play as it was heard.
 */
export function engineSettingsFor(
  s: NewLoopState | null,
  own: { band: BandLevel; fillAmount: number; evolveAmount: number },
): { band: BandLevel; fillAmount: number; evolveAmount: number; loops: number[] } {
  if (s === null) return { ...own, loops: [] };
  if (s.phase === 'waitEmpty') return { band: 'off', fillAmount: 0, evolveAmount: 0, loops: [] };
  return {
    band: s.with.band ? 'gentle' : 'off',
    fillAmount: s.with.fill ? HEAR_FILL : 0,
    evolveAmount: 0,
    loops: s.with.loop === null ? [] : [s.with.loop],
  };
}
