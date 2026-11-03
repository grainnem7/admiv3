/**
 * Tap tempo: the speed from the gaps between the last few presses, as every DAW has it.
 * Pure, so it can be tested: the control keeps the list of tap times and asks.
 */

/** A gap longer than this starts a new run of taps: the earlier ones are forgotten. */
export const TAP_MAX_GAP_MS = 2000;
/** How many gaps are averaged at most. */
export const TAP_WINDOW = 8;
export const TAP_MIN_BPM = 50;
export const TAP_MAX_BPM = 300;

/** The taps that still count, given a new one at `now`. */
export function addTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const kept = last !== undefined && now - last <= TAP_MAX_GAP_MS ? taps : [];
  return [...kept, now].slice(-(TAP_WINDOW + 1));
}

/** The speed the taps say, rounded to a whole BPM; null until there are two taps. */
export function tapTempo(taps: readonly number[]): number | null {
  if (taps.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return null;
  return Math.max(TAP_MIN_BPM, Math.min(TAP_MAX_BPM, Math.round(60000 / mean)));
}

/** The speed after an arrow key on the readout: one BPM, five with Shift, kept in range. */
export function stepBpm(bpm: number, key: string, shift: boolean, min = TAP_MIN_BPM, max = TAP_MAX_BPM): number | null {
  const up = key === 'ArrowUp' || key === 'ArrowRight';
  const down = key === 'ArrowDown' || key === 'ArrowLeft';
  if (!up && !down) return null;
  const by = (shift ? 5 : 1) * (up ? 1 : -1);
  return Math.max(min, Math.min(max, bpm + by));
}
