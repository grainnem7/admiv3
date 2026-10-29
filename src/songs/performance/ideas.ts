/**
 * The same AI each rehearsal (harmony spec, stage 3). Every random choice the instrument
 * makes for the player (the band's variations, the rules' extra notes, Sounds change, the
 * loose timing of a "Lazy" groove) comes from a seed, so a rehearsed piece plays back the
 * same. The seed is the piece's and the scene's together:
 *  - the piece has its own ideas number ("New ideas for the whole piece" picks another);
 *  - each scene may have one of its own ("New ideas" on the scene picks another);
 *  - with both at 0 (every piece saved before this existed) the player's own seeds play
 *    exactly as they did.
 * Magenta's ideas can't be seeded (it is a model in a worker), so once made they are kept
 * per scene, a few at a time, and played again on the next run. "Surprise me each time"
 * gives every run fresh ideas instead, as before. Pure.
 */

import { sanitizeFillNotes, type FillNote } from '../generative/rulesFill';

/** How many of Magenta's ideas a scene keeps (the newest): bounded, as it is saved with the piece. */
export const MAX_KEPT_IDEAS = 6;
/** How many notes one kept idea may hold: more than any fill makes, less than a runaway. */
export const MAX_IDEA_NOTES = 128;

/** One of Magenta's ideas, kept for the board it was made for (`key`, see ideaKey). */
export interface KeptIdea {
  key: string;
  notes: FillNote[];
}

/** A well-mixed number from a seed, a pass, a square and a name: the same inputs, the same number. */
export function mixHash(seed: number, lap: number, row: number, col: number, name: string): number {
  let x = (seed ^ Math.imul(lap + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca6b) ^ Math.imul(col + 7, 0xc2b2ae35)) >>> 0;
  for (let i = 0; i < name.length; i++) x = Math.imul(x ^ name.charCodeAt(i), 0x27d4eb2d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12;
  return x >>> 0;
}

/** A number in [0, 1) from the same inputs as mixHash. */
export function hashChance(seed: number, n: number, row: number, col: number, name: string): number {
  return mixHash(seed, n, row, col, name) / 4294967296;
}

/** Two seeds as one. Both 0 is 0 (nothing to mix), so "as before" stays as before. */
export function mixSeeds(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  return (mixHash(a | 0, b | 0, 3, 5, 'ideas') & 0x7fffffff) || 1;
}

/** A seed with the ideas mixed in; ideas 0 leaves it exactly as it was. */
export function withIdeas(base: number, ideas: number): number {
  return ideas === 0 ? base : mixSeeds(base, ideas);
}

/** The ideas a scene plays with: the piece's and its own (none for plain Play: the piece's). */
export function sceneIdeas(pieceIdeas: number, scene: { ideas?: number } | null | undefined): number {
  return mixSeeds(pieceIdeas, scene?.ideas ?? 0);
}

/** A fresh ideas number for New ideas: never 0 (that is "as before"). */
export function freshIdeas(rand: () => number = Math.random): number {
  return 1 + Math.floor(rand() * 0x7ffffffe);
}

/** A short name for a long description of the board (two 32-bit hashes, in hex). */
export function ideaKey(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** The kept ideas with one more: the same board's idea replaced, the oldest let go past the bound. */
export function keepIdea(list: readonly KeptIdea[], idea: KeptIdea): KeptIdea[] {
  const notes = idea.notes.slice(0, MAX_IDEA_NOTES);
  const rest = list.filter((k) => k.key !== idea.key);
  return [...rest, { key: idea.key, notes }].slice(-MAX_KEPT_IDEAS);
}

/** Kept ideas from storage: only well-formed ones survive, within the bounds. */
export function sanitizeKeptIdeas(v: unknown): KeptIdea[] {
  if (!Array.isArray(v)) return [];
  const out: KeptIdea[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== 'string' || o.key.length === 0 || o.key.length > 40) continue;
    const notes = sanitizeFillNotes(o.notes);
    if (!notes) continue;
    out.push({ key: o.key, notes: notes.slice(0, MAX_IDEA_NOTES) });
  }
  return out.slice(-MAX_KEPT_IDEAS);
}

/** A stored ideas number made safe (0 = none of its own). */
export function sanitizeIdeas(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0x7fffffff ? v : 0;
}

/**
 * The ideas the AI plays with now: the scene on now (the piece's ideas and its own; its
 * Magenta ideas kept under its id), or, on plain ▶ Play, the piece's ideas with none kept.
 */
export function ideasFor(c: {
  pieceIdeas: number; currentScene: number | null; scenes: readonly { id: string; ideas?: number }[];
}): { seed: number; owner: string | null } {
  const scene = c.currentScene !== null ? c.scenes[c.currentScene] ?? null : null;
  return { seed: sceneIdeas(c.pieceIdeas, scene), owner: scene ? scene.id : null };
}
