/**
 * A scene's Energy (harmony spec, stage 3): one setting, 1 to 5, that shapes the piece's
 * line. It moves together:
 *  - how loud the whole sound is (a few dB either side), so the piece has a quiet opening
 *    and a peak: measured, the player's own notes and loops are most of what is heard, and
 *    the band and the brightness alone hardly move it;
 *  - the band's level against the rest (a few dB more);
 *  - how busy the band's drums are, and how many extra notes there are;
 *  - how bright the whole sound is (a low-pass over the mix).
 * Off (0) is "as before": a scene saved before Energy existed changes none of these. The
 * player's notes keep their place: they are never made softer against the rest, and the
 * band still dips under them (keep him on top). Level 5 keeps headroom: it is measured not
 * to reach the limiter (see e2e/loudness.e2e.ts). Pure.
 */

export type SceneEnergy = 0 | 1 | 2 | 3 | 4 | 5;
export const ENERGY_LEVELS: Exclude<SceneEnergy, 0>[] = [1, 2, 3, 4, 5];

export interface EnergyShape {
  /** The whole sound's level, in dB from as set. */
  mixDb: number;
  /** The band's level, in dB from its usual (Quiet or Full), on top of the whole sound's. */
  bandDb: number;
  /** The band's drums: grooves busier (+) or sparser (-) than usual. */
  drumsBusy: number;
  /** Extra notes: the scene's amount is multiplied by this (it never turns them on). */
  extrasScale: number;
  /** The top of the whole sound: a low-pass at this frequency (20000 = open). */
  brightHz: number;
}

/** The mapping (left to the builder): 3 is the band and the extras as set, a softened top. */
export const ENERGY_SHAPES: Record<Exclude<SceneEnergy, 0>, EnergyShape> = {
  1: { mixDb: -5, bandDb: -6, drumsBusy: -2, extrasScale: 0.5, brightHz: 3000 },
  2: { mixDb: -2.5, bandDb: -3, drumsBusy: -1, extrasScale: 0.75, brightHz: 5500 },
  3: { mixDb: 0, bandDb: 0, drumsBusy: 0, extrasScale: 1, brightHz: 9000 },
  4: { mixDb: 1, bandDb: 1.5, drumsBusy: 1, extrasScale: 1.25, brightHz: 14000 },
  5: { mixDb: 2, bandDb: 3, drumsBusy: 1, extrasScale: 1.5, brightHz: 20000 },
};

/** What a level does, or null for Off. */
export function energyShape(e: number): EnergyShape | null {
  return e >= 1 && e <= 5 && Number.isInteger(e) ? ENERGY_SHAPES[e as Exclude<SceneEnergy, 0>] : null;
}

/** The whole sound's level at this Energy, as a gain to multiply by (1 = as set). */
export function energyMixGain(e: number): number {
  const s = energyShape(e);
  return s ? 10 ** (s.mixDb / 20) : 1;
}

/** The band's level at this Energy, as a gain to multiply by (1 = as set). */
export function energyBandGain(e: number): number {
  const s = energyShape(e);
  return s ? 10 ** (s.bandDb / 20) : 1;
}

/** The Extra notes amount that plays at this Energy (0 stays 0; never above 1). */
export function energyExtras(amount: number, e: number): number {
  const s = energyShape(e);
  if (!s || amount <= 0) return amount;
  return Math.max(0, Math.min(1, amount * s.extrasScale));
}

/** The low-pass over the whole sound at this Energy, under the world's own (20000 = open). */
export function energyBrightHz(e: number, worldHz: number): number {
  const s = energyShape(e);
  return s ? Math.min(worldHz, s.brightHz) : worldHz;
}

/** A stored Energy made safe: anything unreadable (or saved before Energy existed) is Off. */
export function sanitizeSceneEnergy(v: unknown): SceneEnergy {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? (v as SceneEnergy) : 0;
}

/** The scene editor's words for each level. */
export const ENERGY_WORDS: Record<SceneEnergy, string> = {
  0: 'Off: the level, the band, the extra notes and the brightness as set, as before.',
  1: 'Very calm: everything softer and darker, the band softest, its drums sparse, few extra notes.',
  2: 'Calm: a little softer, the band lighter, fewer extra notes, a soft top.',
  3: 'Steady: the sound, the band and the extra notes as set, a slightly softened top.',
  4: 'Lively: a little louder and brighter, the band busier, more extra notes.',
  5: 'Peak: the loudest and brightest, the band at its fullest, the most extra notes (kept clear of distortion).',
};

/** The line of Energy across the piece, for the scene list's little graph and its words. */
export function energyLine(scenes: readonly { name: string; at?: number | null; settings: { sceneEnergy: SceneEnergy } }[]): { name: string; at: number; energy: SceneEnergy }[] {
  return scenes
    .filter((s): s is typeof s & { at: number } => typeof s.at === 'number')
    .map((s) => ({ name: s.name, at: s.at, energy: s.settings.sceneEnergy }))
    .sort((a, b) => a.at - b.at);
}
