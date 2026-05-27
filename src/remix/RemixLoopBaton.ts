/**
 * RemixLoopBaton — maps the loop baton's calibrated centroid to a loop
 * selection + volume. X picks among N equally-wide zones (one per loop)
 * with boundary hysteresis so a drifting hand doesn't flicker between
 * loops; Y is the loop volume; presence brings the layer in/out.
 */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Pick a loop index from a 0–1 X value across `n` equal zones.
 * @param current the previously-selected index, or -1 to snap directly.
 * @param hysteresis margin past a zone boundary required to switch.
 */
export function selectLoopZone(x: number, n: number, current: number, hysteresis: number): number {
  if (n <= 1) return 0;
  const cx = clamp01(x);
  const direct = Math.min(n - 1, Math.max(0, Math.floor(cx * n)));
  if (current < 0 || current > n - 1) return direct;
  const lower = current / n;
  const upper = (current + 1) / n;
  if (cx > upper + hysteresis) return direct;
  if (cx < lower - hysteresis) return direct;
  return current;
}
