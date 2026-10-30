/**
 * A check, as numbers, that the audience screen does not flash (WCAG 2.3.1: no more than 3
 * flashes a second over a large area). The screen is split in thirds, three columns and
 * three rows; each third's light is worked out from the squares blooming in it, and a flash
 * is a rise and a fall of at least FLASH_SWING of full brightness. Pure: the unit test runs
 * every board shape through it, and the drawing uses nothing from here.
 */

/** WCAG's "general flash": a change of at least 10 % of the brightest white. */
export const FLASH_SWING = 0.1;
/**
 * How much of full white a fully glowing square adds over its own area. A coloured counter
 * and its halo on the dark screen: well under white, and a deliberate over-estimate.
 */
export const BLOOM_LUMA_GAIN = 0.4;

/**
 * The light in each of the six thirds (three columns, then three rows): the sum of the
 * glowing squares in it, each adding `glow` * BLOOM_LUMA_GAIN over its own area (a square of
 * `cell` pixels), as a share of the third's area.
 */
export function regionLuma(
  lit: readonly { cx: number; cy: number; glow: number }[],
  cell: number,
  w: number,
  h: number,
): number[] {
  const out = [0, 0, 0, 0, 0, 0];
  const area = cell * cell;
  for (const s of lit) {
    const col = Math.min(2, Math.max(0, Math.floor((s.cx / w) * 3)));
    const row = Math.min(2, Math.max(0, Math.floor((s.cy / h) * 3)));
    const g = s.glow * BLOOM_LUMA_GAIN * area;
    out[col] += g / ((w / 3) * h);
    out[3 + row] += g / (w * (h / 3));
  }
  return out;
}

/**
 * The most flashes in any one second of a light level sampled `hz` times a second. A flash is
 * a rise of at least `swing` followed by a fall of at least `swing` (or the other way round),
 * found by following the level from turning point to turning point.
 */
export function maxFlashesPerSecond(series: readonly number[], hz: number, swing: number): number {
  // Turning points: the frames where the level changes direction by at least `swing`.
  const turns: number[] = [];
  if (series.length === 0) return 0;
  let extreme = series[0];
  let at = 0;
  let dir = 0; // 1 rising, -1 falling
  for (let i = 1; i < series.length; i++) {
    const v = series[i];
    if (dir >= 0 && v > extreme) { extreme = v; at = i; if (dir === 0 && v - series[0] >= swing) dir = 1; continue; }
    if (dir <= 0 && v < extreme) { extreme = v; at = i; if (dir === 0 && series[0] - v >= swing) dir = -1; continue; }
    if (dir === 1 && extreme - v >= swing) { turns.push(at); dir = -1; extreme = v; at = i; }
    else if (dir === -1 && v - extreme >= swing) { turns.push(at); dir = 1; extreme = v; at = i; }
  }
  // Each pair of opposing changes is one flash: count the turning points inside a sliding second
  // (a peak, a trough and the next peak are one flash).
  const win = hz;
  let best = 0;
  for (let i = 0; i < turns.length; i++) {
    let n = 0;
    for (let j = i; j < turns.length && turns[j] - turns[i] < win; j++) n++;
    best = Math.max(best, n);
  }
  return Math.floor(best / 2);
}
