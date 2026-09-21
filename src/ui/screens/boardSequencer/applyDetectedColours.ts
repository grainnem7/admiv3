/**
 * Turn what "Find colours" proposed into the player's colour channels.
 *
 * Two jobs at once, and they pull in opposite directions:
 *  - a colour the player ALREADY has should be updated, keeping the job, instrument and
 *    mix they chose for it, rather than appearing again as a stranger;
 *  - a colour that is genuinely new should be added.
 *
 * Which is why matching only ever looks at the channels that existed BEFORE this ran.
 * Matching against the channels being added as they are added meant the second proposal
 * could match the first one it had just created and overwrite it — so eight colours found
 * on the board arrived as five, and the player had no way to see why. The detection has
 * already decided these are different colours; this step must not quietly re-merge them.
 */
import type { ColourChannel, ColourId } from '../../../tracking/boardColours';
import { freshChannelId } from '../../../tracking/boardColours';
import type { DetectedColour } from '../../../tracking/boardColourDetect/detectColours';
import { suggestRole } from './roles';

/** Straight-line distance between two hex swatches in RGB. */
export function swatchDistance(a: string, b: string): number {
  const rgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  };
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** Near enough to be the same counter the player already had, rather than a new one. */
export const MATCH_SWATCH_DISTANCE = 90;

export function applyDetectedColours(
  existing: readonly ColourChannel[],
  found: readonly DetectedColour[],
  referenced: Iterable<ColourId> = [],
): ColourChannel[] {
  const channels = existing.map((c) => ({ ...c }));
  // Only the channels present before this ran may be matched against, and each at most
  // once. Anything appended below is a NEW colour and is never a target.
  const matchable = existing.length;
  const taken = new Set<number>();

  for (const c of found) {
    let best = -1;
    let bestDistance = MATCH_SWATCH_DISTANCE;
    for (let i = 0; i < matchable; i++) {
      if (taken.has(i)) continue;
      const d = swatchDistance(channels[i].swatch, c.swatch);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    const band = { band: c.band.band, blackBand: c.band.blackBand, whiteBand: c.band.whiteBand };
    if (best >= 0) {
      taken.add(best);
      channels[best] = {
        ...channels[best], kind: c.kind, swatch: c.swatch, ...band,
        // An unsafe colour is switched off, but a job the player chose is not thrown away
        // for one that was already doing something.
        role: c.unsafe ? 'off' : channels[best].role,
      };
      continue;
    }
    channels.push({
      id: freshChannelId(channels.map((ch) => ch.id), referenced),
      kind: c.kind,
      // A colour that matches the board starts switched off rather than filling the
      // pattern with notes nobody played.
      role: c.unsafe ? 'off' : suggestRole(channels, { kind: c.kind }),
      swatch: c.swatch,
      ...band,
    });
  }
  return channels;
}
