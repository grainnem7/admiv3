/**
 * Development (sound investigation, S2, fifth part): a kept loop goes somewhere and comes
 * home. Loops vary nudged single notes and the breath shaped loudness, but pass forty was
 * pass one with small differences; nothing developed. This gives a loop a sixteen pass
 * arc, four cycles of four passes, the oldest tricks of motivic writing, all in the scale
 * because rows are scale degrees:
 *  - cycle 1, as kept;
 *  - cycle 2, the lift: in the second half of the pass the melody plays one row higher,
 *    a question with an answer;
 *  - cycle 3, the turn: the melody inverted around its own middle row, the same figure
 *    seen in a mirror;
 *  - cycle 4, the thinning: only the melody's notes on the on-beats, the bass and chords
 *    whole, and on the last pass the whole figure home again.
 * The amount is Loops vary: under a quarter, nothing; up to six tenths, the lift and the
 * thinning only; above, all three. Only the loops: the player's own counters are never
 * touched. Pure, from the pass count the engine already keeps, so a scene plays the same
 * however it is reached.
 */

export interface DevCell { row: number; col: number; colour: string }

export type Development = 'home' | 'lift' | 'turn' | 'thin';

/** Which development a cycle brings, at this amount. */
export function developmentFor(cycle: number, amount: number): Development {
  const c = ((Math.floor(cycle) % 4) + 4) % 4;
  if (amount < 0.25 || c === 0) return 'home';
  if (c === 1) return 'lift';
  if (c === 2) return amount >= 0.6 ? 'turn' : 'home';
  return 'thin';
}

/**
 * The loop's cells as this pass plays them. `lap` counts passes from the start of the ideas;
 * `isMelody` says which colours are melody (the others are left whole).
 */
export function developCells<C extends DevCell>(
  cells: readonly C[], lap: number, amount: number, rows: number, cols: number, isMelody: (colour: string) => boolean,
): C[] {
  const cycle = Math.floor(Math.max(0, lap) / 4);
  const passInCycle = ((Math.floor(lap) % 4) + 4) % 4;
  const dev = developmentFor(cycle, amount);
  if (dev === 'home') return [...cells];
  const melody = cells.filter((c) => isMelody(c.colour));
  if (melody.length === 0) return [...cells];
  const clamp = (r: number): number => Math.max(0, Math.min(rows - 1, r));
  if (dev === 'lift') {
    const half = Math.floor(cols / 2);
    return cells.map((c) => (isMelody(c.colour) && c.col >= half ? { ...c, row: clamp(c.row - 1) } : c));
  }
  if (dev === 'turn') {
    // Rows count from the top, so a mirror around the middle row keeps the figure's range.
    const mean = melody.reduce((s, c) => s + c.row, 0) / melody.length;
    return cells.map((c) => (isMelody(c.colour) ? { ...c, row: clamp(Math.round(2 * mean - c.row)) } : c));
  }
  // thin: the last pass of the cycle is the whole figure, home.
  if (passInCycle === 3) return [...cells];
  return cells.filter((c) => !isMelody(c.colour) || c.col % 2 === 0);
}
