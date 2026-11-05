/**
 * Density: how much may sound at once (sound investigation, S2, second part).
 *
 * A busy board with loops, the band and extra notes all on put ten notes on one step and
 * twelve to fifteen a second, and nothing breathed. Two rules, both pure, keep the texture
 * open without ever touching the player's own notes:
 *  - a cap on the loops' pitched notes per step, set by Energy: Calm lets two through,
 *    Steady three, Lively four, Driving six. It makes room for the player, so it applies
 *    only while the player has counters on the board; with the board empty the loops play
 *    whole. The player's notes are never counted against it and never dropped; a chord
 *    counts as one, and the loops' chords and bass are admitted before their melodies;
 *  - a loop's note that doubles a pitch the player is already playing on the same step is
 *    not played: the player has it, and two of the same note at once only muddies.
 * And one lane rule: while the player's melody is sounding, a loop's melody plays an octave
 * up, so the two lines sit apart instead of blurring into one busy line.
 */

/** The most pitched loop notes a step may carry at this Energy (0 to 1). */
export function loopNoteCap(energy: number): number {
  const e = Math.max(0, Math.min(1, energy));
  if (e <= 0.3) return 2;
  if (e <= 0.6) return 3;
  if (e <= 0.85) return 4;
  return 6;
}

/** What has sounded on this step so far: the player's pitches and the loops' count. Make one per step. */
export interface StepTally {
  playerPitches: Set<number>;
  loopPitched: number;
  /** Chords that arrive one note at a time: a group admitted once counts once. */
  groups: Set<string>;
}

export const newStepTally = (): StepTally => ({ playerPitches: new Set(), loopPitched: 0, groups: new Set() });

/** The player's note: always admitted, and remembered so a loop never doubles it. */
export function admitPlayerNote(tally: StepTally, midis: readonly number[]): void {
  for (const m of midis) tally.playerPitches.add(m);
}

/**
 * A loop's pitched note (one or several pitches as one event): admitted unless it doubles
 * what the player has on this step (a single note the player already plays; a chord only
 * when the player already plays every note of it, since a chord sharing one tone with the
 * melody is ordinary harmony), or the step already carries the cap. Counted when admitted.
 */
export function admitLoopNote(tally: StepTally, midis: readonly number[], cap: number, group?: string): boolean {
  // The rest of a chord already admitted note by note: in, and not counted again.
  if (group !== undefined && tally.groups.has(group)) return true;
  if (midis.length > 0 && midis.every((m) => tally.playerPitches.has(m))) return false;
  if (tally.loopPitched >= cap) return false;
  tally.loopPitched += 1;
  if (group !== undefined) tally.groups.add(group);
  return true;
}

/** The highest note the lane may lift a loop's melody to. */
export const LANE_TOP = 96;

/** How far a loop's melody note moves to stay out of the player's octave: an octave up when it fits, else nowhere. */
export function loopLaneShift(role: string, playerMelodySounding: boolean, midi: number): number {
  if (role !== 'melody' || !playerMelodySounding) return 0;
  return midi + 12 <= LANE_TOP ? 12 : 0;
}
