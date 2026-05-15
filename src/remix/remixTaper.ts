/**
 * remixTaper — maps a 0–1 filterNorm (derived from baton Y) to a
 * combined lowpass cutoff + stem gain.
 *
 *   0.00 – 0.08  silent dead-zone   gain 0          (a bare 80 Hz
 *                                                     lowpass still
 *                                                     leaks bass, so
 *                                                     gain must fall too)
 *   0.08 – 0.20  fade band          cutoff 80→250Hz, gain 0→1 linear
 *   0.20 – 1.00  tone-shaping       cutoff 250Hz→18kHz log, gain 1
 *
 * Pure function — the Y mechanic's single source of truth. Sweeping to
 * the floor is mute; there is no separate mute control.
 */

const DEAD_ZONE_TOP = 0.08;
const FADE_TOP = 0.20;
const CUTOFF_MIN_HZ = 80;
const CUTOFF_FADE_TOP_HZ = 250;
const CUTOFF_MAX_HZ = 18000;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface RemixTaperPoint {
  cutoffHz: number;
  gain: number;
}

export function remixTaper(filterNorm: number): RemixTaperPoint {
  const n = clamp01(filterNorm);

  if (n < DEAD_ZONE_TOP) {
    return { cutoffHz: CUTOFF_MIN_HZ, gain: 0 };
  }

  if (n < FADE_TOP) {
    const t = (n - DEAD_ZONE_TOP) / (FADE_TOP - DEAD_ZONE_TOP); // 0..1
    const cutoffHz =
      CUTOFF_MIN_HZ + t * (CUTOFF_FADE_TOP_HZ - CUTOFF_MIN_HZ);
    return { cutoffHz, gain: t };
  }

  // Logarithmic cutoff sweep 250 Hz → 18 kHz across 0.20 .. 1.0
  const t = (n - FADE_TOP) / (1 - FADE_TOP); // 0..1
  const logMin = Math.log(CUTOFF_FADE_TOP_HZ);
  const logMax = Math.log(CUTOFF_MAX_HZ);
  const cutoffHz = Math.exp(logMin + t * (logMax - logMin));
  return { cutoffHz, gain: 1 };
}
