#!/usr/bin/env node
/**
 * Freeze Magenta's ideas into the demo piece (Rising Light, task C6).
 *
 * Magenta can't be told to play the same twice. So: rehearse the demo with Magenta on (press
 * New idea in a scene to hear another), and when the ideas are good, Make a piece's
 * "Back up to a file". Then:
 *
 *   node scripts/freeze-demo-ideas.mjs path/to/admi-backup.json
 *
 * writes each demo scene's kept ideas to src/songs/demo/demoIdeas.ts, and from then on every
 * performance of the demo plays the same AI ideas, the ones chosen by ear.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEMO_PLAYER_ID = 'demo';
const PLAYERS_KEY = 'admi-board-players';

/** Each demo scene's kept ideas, by scene id, from a backup (the parsed JSON of the file). */
export function freezeDemoIdeas(backup) {
  if (typeof backup !== 'object' || backup === null || backup.app !== 'admi-board' || typeof backup.keys !== 'object' || backup.keys === null) {
    throw new Error('This file is not an ADMI backup (Make a piece, "Back up to a file").');
  }
  let players = [];
  try { players = JSON.parse(backup.keys[PLAYERS_KEY] ?? '[]'); } catch { players = []; }
  const demo = Array.isArray(players) ? players.find((p) => p && p.id === DEMO_PLAYER_ID) : undefined;
  if (!demo) throw new Error('The backup has no demo piece: open the demo piece, rehearse it, then back up again.');
  const scenes = Array.isArray(demo.settings?.scenes) ? demo.settings.scenes : [];
  const out = {};
  for (const s of scenes) {
    if (!s || typeof s.id !== 'string' || !Array.isArray(s.aiIdeas)) continue;
    const ideas = s.aiIdeas.filter((i) => i && typeof i.key === 'string' && Array.isArray(i.notes) && i.notes.length > 0);
    if (ideas.length > 0) out[s.id] = ideas;
  }
  return out;
}

/** The data file's text: the frozen ideas, as written by this script. */
export function demoIdeasSource(frozen) {
  return `/**
 * Magenta's ideas for the demo piece, frozen: chosen by ear in a rehearsal and kept, so every
 * performance plays the same AI ideas. Written by scripts/freeze-demo-ideas.mjs from a backup
 * file; don't edit by hand, rehearse and freeze again instead.
 */
import type { KeptIdea } from '../performance/ideas';

export const DEMO_FROZEN_IDEAS: Readonly<Record<string, readonly KeptIdea[]>> = ${JSON.stringify(frozen, null, 2)};
`;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Which backup? node scripts/freeze-demo-ideas.mjs path/to/admi-backup.json');
    process.exit(1);
  }
  const frozen = freezeDemoIdeas(JSON.parse(readFileSync(file, 'utf8')));
  const target = resolve(here, '../src/songs/demo/demoIdeas.ts');
  writeFileSync(target, demoIdeasSource(frozen));
  const scenes = Object.keys(frozen);
  const ideas = Object.values(frozen).reduce((n, list) => n + list.length, 0);
  console.log(`Froze ${ideas} ${ideas === 1 ? 'idea' : 'ideas'} for ${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'} (${scenes.join(', ') || 'none'}) into ${target}`);
}
