/**
 * Liveliness: one press for how alive the instrument is (sound investigation, S2).
 *
 * A new player starts with everything generative off, so they hear only their own
 * counters, and that is right for a first session. But it also means a kept loop plays
 * exactly the same thing every pass for ever, and five separate settings (Loops vary,
 * Extra notes, Sounds change, the Band, and the loops' breathing that rides on Loops vary)
 * have to be found and turned up before the instrument sounds like more than a sequencer.
 * This is those five as three words. Pure: a level is a patch of the config, and a config
 * maps back to the level it matches exactly, or to none when the owner has mixed their own.
 */

import type { BandLevel } from './band/band';

export type Liveliness = 'asSaved' | 'alive' | 'wild';

export interface LivelinessPatch {
  loopVary: number;
  fillAmount: number;
  evolveAmount: number;
  band: BandLevel;
}

export const LIVELINESS_LEVELS: { id: Liveliness; label: string; words: string; patch: LivelinessPatch }[] = [
  { id: 'asSaved', label: 'As saved', words: 'Only your counters and loops, exactly as kept, every pass.', patch: { loopVary: 0, fillAmount: 0, evolveAmount: 0, band: 'gentle' } },
  { id: 'alive', label: 'Alive', words: 'Loops breathe and vary a little, a few extra notes, the sounds change slowly, the band in full.', patch: { loopVary: 0.35, fillAmount: 0.25, evolveAmount: 0.35, band: 'full' } },
  { id: 'wild', label: 'Wild', words: 'Loops vary a lot, plenty of extra notes, the sounds keep changing, the band in full.', patch: { loopVary: 0.7, fillAmount: 0.5, evolveAmount: 0.7, band: 'full' } },
];

/** The config changes a level makes. */
export function livelinessPatch(level: Liveliness): LivelinessPatch {
  return { ...(LIVELINESS_LEVELS.find((l) => l.id === level) ?? LIVELINESS_LEVELS[0]).patch };
}

const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.02;

/** The level a config sits at exactly, or null when it is the owner's own mix. */
export function livelinessOf(c: LivelinessPatch): Liveliness | null {
  const hit = LIVELINESS_LEVELS.find((l) => close(l.patch.loopVary, c.loopVary) && close(l.patch.fillAmount, c.fillAmount)
    && close(l.patch.evolveAmount, c.evolveAmount) && l.patch.band === c.band);
  return hit ? hit.id : null;
}
