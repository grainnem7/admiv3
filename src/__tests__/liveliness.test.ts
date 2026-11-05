import { describe, expect, it } from 'vitest';
import { LIVELINESS_LEVELS, livelinessOf, livelinessPatch } from '../songs/liveliness';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, NEW_PLAYER_SOUND } from '../profiles/BoardSequencerConfig';

describe('liveliness: one press for how alive the instrument is (S2)', () => {
  it('a new player is As saved, which is exactly what the project gives them', () => {
    const fresh = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...NEW_PLAYER_SOUND };
    expect(livelinessOf(fresh)).toBe('asSaved');
  });
  it('each level maps back to itself, and rises in every setting from As saved to Wild', () => {
    for (const l of LIVELINESS_LEVELS) expect(livelinessOf(livelinessPatch(l.id))).toBe(l.id);
    const [a, b, c] = LIVELINESS_LEVELS.map((l) => l.patch);
    expect(b.loopVary).toBeGreaterThan(a.loopVary); expect(c.loopVary).toBeGreaterThan(b.loopVary);
    expect(b.fillAmount).toBeGreaterThan(a.fillAmount); expect(c.fillAmount).toBeGreaterThan(b.fillAmount);
    expect(b.evolveAmount).toBeGreaterThan(a.evolveAmount); expect(c.evolveAmount).toBeGreaterThan(b.evolveAmount);
    expect(b.band).toBe('full');
  });
  it("the owner's own mix is no level", () => {
    expect(livelinessOf({ loopVary: 0.35, fillAmount: 0.8, evolveAmount: 0, band: 'off' })).toBe(null);
  });
});
