/**
 * Dynamics for the counters' and the loops' notes (sound investigation, S2).
 *
 * Every counter used to play at exactly the same loudness, and a loop repeated its notes
 * at exactly the same loudness every pass: in the MIDI sent to Ableton only a handful of
 * velocity values ever appeared, and the ear reads that as a machine. Two small things
 * make it breathe, both pure and both repeatable:
 *  - a metric accent: the first step of the pass is the strongest, the middle of the pass
 *    next, the other on-beats a little softer, the off-beats softer still;
 *  - a slight variation from pass to pass, drawn from the step, the square and the pass,
 *    so a loop is alive but a session replays the same way.
 * Neither moves a note in time: the keeping-time meter and the loop's feel are untouched.
 * The player's note is still the player's: an accent shapes its loudness, nothing else.
 */

/** How much softer each kind of step is than the first of the pass (1 = the downbeat). */
export const ACCENT_DOWNBEAT = 1;
export const ACCENT_HALF = 0.94;
export const ACCENT_ON_BEAT = 0.88;
export const ACCENT_OFF_BEAT = 0.8;
/** The pass to pass variation, as a fraction either way. */
export const HUMAN_SPREAD = 0.05;

/** The accent for a step of a pass with `cols` steps. */
export function metricAccent(col: number, cols: number): number {
  if (cols <= 0) return ACCENT_DOWNBEAT;
  const c = ((Math.floor(col) % cols) + cols) % cols;
  if (c === 0) return ACCENT_DOWNBEAT;
  if (cols % 2 === 0 && c === cols / 2) return ACCENT_HALF;
  if (c % 2 === 0) return ACCENT_ON_BEAT;
  return ACCENT_OFF_BEAT;
}

/** A small, repeatable variation for a note: the same (pass, row, col, name) always gives the same number. */
export function humanFactor(pass: number, row: number, col: number, name = ''): number {
  let h = 2166136261;
  const s = `${Math.floor(pass)}|${row}|${col}|${name}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const unit = (h % 10000) / 9999; // 0 to 1
  return 1 - HUMAN_SPREAD + unit * 2 * HUMAN_SPREAD;
}

/** The loudness of a counter's or a loop's note, shaped by where it falls and which pass it is. */
export function shapedVelocity(base: number, col: number, cols: number, pass: number, row: number, name = ''): number {
  return Math.max(0, Math.min(1, base * metricAccent(col, cols) * humanFactor(pass, row, col, name)));
}
