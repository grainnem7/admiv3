import { describe, it, expect } from 'vitest';
import { grooveFor } from '../songs/phrases/phrases';
import { SOUND_WORLD_IDS } from '../audio/worlds/soundWorlds';

// A drum counter low on the board plays the sparsest groove. If that is kicks alone it
// is all but silent on laptop speakers, and the player hears "no drums" (seen in a
// rehearsal: a drum counter over a melody loop in the Electronic world).
describe('the sparsest groove can be heard', () => {
  for (const world of SOUND_WORLD_IDS) {
    it(`${world}: level 0 has something above the kick`, () => {
      expect(grooveFor(world, 0).some((hit) => hit.drum !== 'kick')).toBe(true);
    });
  }
});
