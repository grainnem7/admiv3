/**
 * A strum: a guitar's chord is never every string at once. Played that way, all at once,
 * a sampled guitar sounds like a machine (sound design, 2026-11-06). On the beat the hand
 * strums down, low string first; between beats it comes back up, high string first,
 * quicker and a little softer. A harp's chord is rolled, slower. Other instruments play
 * their chords together, as before. Pure.
 */

/** The gap between strings, in seconds: down on the beat, up between, and a harp's roll. */
export const STRUM_DOWN_SEC = 0.016;
export const STRUM_UP_SEC = 0.011;
export const HARP_ROLL_SEC = 0.035;
/** An up strum is a little softer. */
export const STRUM_UP_GAIN = 0.85;

const GUITARS = new Set(['guitarAcoustic', 'guitarNylon', 'guitarElectric']);

/**
 * The strum for a chord on this instrument at this step of the pass: seconds between
 * strings, positive low to high (down), negative high to low (up); 0 = together.
 */
export function strumFor(instrument: string | undefined, col: number): number {
  if (instrument === 'harp') return HARP_ROLL_SEC;
  if (!instrument || !GUITARS.has(instrument)) return 0;
  return col % 2 === 0 ? STRUM_DOWN_SEC : -STRUM_UP_SEC;
}

/** When each note of a chord starts after the beat, in seconds, in the order given. */
export function strumOffsets(midis: readonly number[], strum: number): number[] {
  if (strum === 0) return midis.map(() => 0);
  const order = [...midis].map((m, i) => ({ m, i })).sort((a, b) => (strum > 0 ? a.m - b.m : b.m - a.m));
  const out = midis.map(() => 0);
  order.forEach(({ i }, k) => { out[i] = k * Math.abs(strum); });
  return out;
}
