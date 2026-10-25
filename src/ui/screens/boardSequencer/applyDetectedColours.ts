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
import { colourDistance, hexToRgb } from '../../../tracking/boardReference/boardReference';

/** Straight-line distance between two hex swatches in RGB (kept for reference; matching uses matchDistance). */
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

/**
 * How different two counter colours are, the way the detector judges them: mostly by
 * colour, a little by lightness (see colourDistance). RGB distance was far too loose for
 * this: blue and purple are only ~86 apart in RGB, under the old limit of 90, so adding a
 * purple counter took it for the existing BLUE colour and overwrote it — and from then on
 * the blue counters read as purple too.
 */
export function matchDistance(a: string, b: string): number {
  const ra = hexToRgb(a); const rb = hexToRgb(b);
  return ra && rb ? colourDistance(ra, rb) : Infinity;
}

/**
 * Near enough to be the same counter the player already had (the same counter seen again
 * in slightly different light), rather than a new one. Blue and purple are ~2.8× this.
 */
export const MATCH_DISTANCE = 1.0;

/** Two of the player's colours closer than this may be confused while playing: say so. */
export const ALIKE_DISTANCE = 1.6;

export function applyDetectedColours(
  existing: readonly ColourChannel[],
  found: readonly DetectedColour[],
  referenced: Iterable<ColourId> = [],
): ColourChannel[] {
  const channels = existing.map((c) => ({ ...c }));
  // Only the channels present before this ran may be matched against, and each at most
  // once. Anything appended below is a NEW colour and is never a target.
  //
  // Closest pairs first, over everything at once: a found colour updates the existing one
  // it is clearly nearest, and can't take another's place just because it was looked at
  // first.
  const pairs: { f: number; e: number; d: number }[] = [];
  found.forEach((c, f) => {
    existing.forEach((ch, e) => {
      const d = matchDistance(ch.swatch, c.swatch);
      if (d < MATCH_DISTANCE && (ch.kind === c.kind)) pairs.push({ f, e, d });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const matchOf = new Map<number, number>();
  const taken = new Set<number>();
  for (const p of pairs) {
    if (matchOf.has(p.f) || taken.has(p.e)) continue;
    matchOf.set(p.f, p.e);
    taken.add(p.e);
  }

  for (const [fi, c] of found.entries()) {
    const best = matchOf.get(fi) ?? -1;
    const band = { band: c.band.band, blackBand: c.band.blackBand, whiteBand: c.band.whiteBand };
    if (best >= 0) {
      channels[best] = {
        ...channels[best], kind: c.kind, swatch: c.swatch, ...band,
        // An unsafe colour is switched off, but a job the player chose is not thrown away
        // for one that was already doing something.
        role: c.unsafe ? 'off' : channels[best].role,
      };
      continue;
    }
    // A colour that cannot be told apart from the board is NOT made into a new channel.
    // It is still listed in the proposal, marked "looks like the board", so the player
    // can see it was found and rejected — but creating it fills their list with the wood.
    // Worse, the wood looks slightly different each time the board is searched, so every
    // run added another one: three "Orange" channels, one of them matching 56 squares.
    // A player who really does want such a colour can add it by tapping the counter,
    // which warns and then does as it is told.
    if (c.unsafe) continue;
    channels.push({
      id: freshChannelId(channels.map((ch) => ch.id), referenced),
      kind: c.kind,
      role: suggestRole(channels, { kind: c.kind }),
      swatch: c.swatch,
      ...band,
    });
  }
  return channels;
}

/**
 * Pairs of colours that look alike under this light, as hex pairs: they may be mixed up
 * while playing, and the player should know before it happens, not after.
 */
export function alikePairs(swatches: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < swatches.length; i++) {
    for (let j = i + 1; j < swatches.length; j++) {
      if (matchDistance(swatches[i], swatches[j]) < ALIKE_DISTANCE) out.push([i, j]);
    }
  }
  return out;
}
