import { describe, it, expect } from 'vitest';
import {
  escLeavesShow, showStatusItems, simplifiedLine, stopGuarded, STOP_GUARD_MS, type ShowStatusInput,
} from '../ui/screens/boardSequencer/play/showStatus';

const QUIET: ShowStatusInput = {
  camera: null, hat: null, ipad: null, sound: null, muted: false, simplify: null, keepingTime: null, reload: null,
  keepInFront: false,
};
const texts = (i: ShowStatusInput): string[] => showStatusItems(i).map((x) => x.text);

describe('the Show status row (audit 2026-10-30, B1 and B14)', () => {
  it('a laptop board with nothing else on says nothing', () => {
    expect(showStatusItems(QUIET)).toEqual([]);
  });

  it('items appear only when relevant, each calm with ✓ when fine', () => {
    const items = showStatusItems({
      ...QUIET,
      camera: 'ok',
      hat: { state: 'found', locked: false, values: ['Speed 96 BPM'] },
      ipad: { reaching: true, endPressedOnce: false },
      sound: 'ok',
    });
    expect(items.map((x) => [x.tone, x.text])).toEqual([
      ['ok', 'Camera ✓'], ['ok', 'Hat ✓'], ['ok', 'iPad ✓'], ['ok', 'Ableton ✓'],
    ]);
    expect(items[1].detail).toBe('Speed 96 BPM');
  });

  it('a lost camera, hat, iPad or Ableton port is amber, with "!" and a word, and comes first', () => {
    const items = showStatusItems({
      ...QUIET,
      camera: 'stopped',
      hat: { state: 'holding', locked: false, values: ['Speed 96 BPM'] },
      ipad: { reaching: false, endPressedOnce: false },
      sound: 'lost',
      muted: true,
    });
    const warns = items.filter((x) => x.tone === 'warn').map((x) => x.text);
    expect(warns).toEqual([
      '! Camera stopped', '! Hat not in sight: holding', '! iPad not reaching', "! Ableton's port has gone, so Timbo is playing its own sound.",
    ]);
    expect(items.slice(0, 4).every((x) => x.tone === 'warn')).toBe(true);
    // The camera can be tried again from the row.
    expect(items[0].actions).toEqual(['retryCamera']);
  });

  it('the hat: found, following the face, holding, paused, starting, no camera, the mouse, locked', () => {
    const hat = (h: NonNullable<ShowStatusInput['hat']>) => showStatusItems({ ...QUIET, hat: h })[0];
    expect(hat({ state: 'found', locked: false, values: [] }).text).toBe('Hat ✓');
    expect(hat({ state: 'face', locked: false, values: [] }).text).toBe('Hat ✓ (following the face)');
    expect(hat({ state: 'paused', why: 'paused: hands on the board', locked: false, values: [] })).toMatchObject({ tone: 'note', text: 'Hat paused: hands on the board' });
    expect(hat({ state: 'starting', locked: false, values: [] })).toMatchObject({ tone: 'note', text: 'Hat: starting…' });
    expect(hat({ state: 'noCamera', locked: false, values: [] })).toMatchObject({ tone: 'warn', text: '! Hat: no camera' });
    expect(hat({ state: 'mouse', locked: false, values: [] })).toMatchObject({ tone: 'ok', text: 'Hat ✓ (the mouse)' });
    expect(hat({ state: 'found', locked: true, values: [] }).text).toBe('Hat ✓ · locked');
  });

  it('a red thing followed while the hat is not learnt: a calm note, never a ✓ (B7)', () => {
    const item = showStatusItems({ ...QUIET, hat: { state: 'followed', locked: false, values: ['Speed 90 BPM'] } })[0];
    expect(item).toMatchObject({ tone: 'note', text: 'Hat: not learnt (a red thing is followed)', detail: 'Speed 90 BPM' });
    expect(item.text).not.toContain('✓');
    expect(item.text).not.toContain('!');
  });

  it('Muted, Simplified, the iPad End piece pressed once, and the keeping-time notice live in the row', () => {
    const items = showStatusItems({
      ...QUIET,
      ipad: { reaching: true, endPressedOnce: true },
      muted: true,
      simplify: 'Simplified: Tim and Bed',
      keepingTime: { text: 'The sound is falling behind.', canRestore: true },
    });
    expect(items.find((x) => x.key === 'muted')).toMatchObject({ tone: 'note', text: 'Muted: nothing is sounding' });
    expect(items.find((x) => x.key === 'simplify')).toMatchObject({ tone: 'note', text: 'Simplified: Tim and Bed', label: 'Simplify' });
    expect(items.find((x) => x.key === 'ipadEnd')).toMatchObject({ text: 'iPad: End piece pressed once' });
    expect(items.find((x) => x.key === 'keepingTime')).toMatchObject({
      tone: 'warn', text: '! The sound is falling behind.', label: 'Keeping time', actions: ['restoreExtras'],
    });
  });

  it('Ableton back: said calmly, with Switch to Ableton', () => {
    expect(showStatusItems({ ...QUIET, sound: 'back' })[0]).toMatchObject({
      tone: 'note', text: 'Ableton is back. Timbo is still playing its own sound until you switch.', actions: ['switchToAbleton'],
    });
    expect(showStatusItems({ ...QUIET, sound: 'notFound' })[0]).toMatchObject({ tone: 'warn', text: '! Ableton port not found' });
  });

  it('the reload offer and the ended notice, with their buttons', () => {
    expect(showStatusItems({ ...QUIET, reload: { kind: 'carryOn', at: '2:31' } })[0]).toMatchObject({
      tone: 'warn', text: '! The piece was playing when the page closed or reloaded. The clock would be at 2:31 now.', actions: ['carryOn', 'dismissReload'],
    });
    expect(showStatusItems({ ...QUIET, reload: { kind: 'ended' } })[0]).toMatchObject({
      tone: 'note', text: 'The piece was ending when the page closed or reloaded, so it has ended.', actions: ['dismissReload'],
    });
  });

  it('with the audience screen open: "Keep this window in front"', () => {
    expect(texts({ ...QUIET, keepInFront: true })).toEqual(['Keep this window in front: covering it pauses the camera.']);
  });

  it('every warning starts with "!", and nothing else does', () => {
    const items = showStatusItems({
      camera: 'stopped', hat: { state: 'noCamera', locked: false, values: [] }, ipad: { reaching: false, endPressedOnce: true },
      sound: 'lost', muted: true, simplify: 'Back to full from the next pass', keepingTime: { text: 'x', canRestore: false },
      reload: { kind: 'carryOn', at: '1:00' }, keepInFront: true,
    });
    for (const x of items) expect(x.text.startsWith('!')).toBe(x.tone === 'warn');
  });
});

describe('■ Stop just after the piece starts (B3)', () => {
  it('ignores presses for 2 s after the piece starts, and not after', () => {
    expect(STOP_GUARD_MS).toBe(2000);
    expect(stopGuarded(10_000, 10_000)).toBe(true);
    expect(stopGuarded(10_000, 11_900)).toBe(true);
    expect(stopGuarded(10_000, 12_001)).toBe(false);
    // No piece started: Stop is never held back.
    expect(stopGuarded(null, 10_000)).toBe(false);
  });
});

describe('leaving Show (B5)', () => {
  it('Esc leaves only when the browser was not in full screen: the Esc that ends full screen does not', () => {
    expect(escLeavesShow(false, null, 5000)).toBe(true);
    expect(escLeavesShow(true, null, 5000)).toBe(false);
    // Full screen ended a moment ago: that Esc was the browser's, not a second press.
    expect(escLeavesShow(false, 4900, 5000)).toBe(false);
    expect(escLeavesShow(false, 3000, 5000)).toBe(true);
  });
});

describe('Simplify says what is left, by name (B23)', () => {
  it('"Simplified: Tim and <the loop’s name>", never "the bed"', () => {
    expect(simplifiedLine('Tim', 'Bed')).toBe('Simplified: Tim and Bed');
    expect(simplifiedLine('Tim', 'Loop 1')).toBe('Simplified: Tim and Loop 1');
    expect(simplifiedLine(null, 'Loop 2')).toBe('Simplified: the player and Loop 2');
  });
  it('with no loop playing, the player alone', () => {
    expect(simplifiedLine('Tim', null)).toBe('Simplified: Tim alone');
  });
});

describe('Show: what the iPad’s Simple page set (spec 2026-11-04)', () => {
  it('Calm or Busy: said, with the button back to normal; Normal says nothing', () => {
    expect(showStatusItems({ ...QUIET, feel: 'calm' })).toEqual([
      { key: 'feel', tone: 'note', text: 'Calm (from the iPad): the loops play only their main beats, and no Extra notes', actions: ['feelNormal'] },
    ]);
    expect(showStatusItems({ ...QUIET, feel: 'busy' })[0]?.text).toBe('Busy (from the iPad): Extra notes round everything');
    expect(showStatusItems({ ...QUIET, feel: 'normal' })).toEqual([]);
  });

  it('the drums silenced on the iPad: said, with the button that brings them back', () => {
    expect(showStatusItems({ ...QUIET, drumsSilent: true })).toEqual([
      { key: 'drumsSilent', tone: 'note', text: 'Drums silenced on the iPad', actions: ['drumsBack'] },
    ]);
    expect(showStatusItems({ ...QUIET, drumsSilent: false })).toEqual([]);
  });

  it('the board silenced on the iPad: said, with the button that brings the counters back', () => {
    expect(showStatusItems({ ...QUIET, boardSilent: true })).toEqual([
      { key: 'boardSilent', tone: 'note', text: 'Board counters silenced on the iPad', actions: ['boardBack'] },
    ]);
    expect(showStatusItems({ ...QUIET, boardSilent: false })).toEqual([]);
  });
});

describe('how well the hat is seen, in Show\'s row (owner, 4 Nov 2026: the hat felt unreliable and nobody could tell)', () => {
  const seen = (cap: number) => ({ cap, face: 0, lost: 1, fps: 28, seconds: 10 });
  const hat = (h: NonNullable<ShowStatusInput['hat']>) => showStatusItems({ ...QUIET, hat: h })[0];

  it('found and seen well: the share beside the tick, so it can be glanced at', () => {
    const i = hat({ state: 'found', locked: false, values: [], seen: seen(0.96) });
    expect([i.tone, i.text]).toEqual(['ok', 'Hat ✓ · seen 96%']);
  });

  it('found now but seen under 90% of the last 10 s: a warning in the row', () => {
    const i = hat({ state: 'found', locked: false, values: [], seen: seen(0.62) });
    expect([i.tone, i.text]).toEqual(['warn', '! Hat seen only 62% of the last 10 s']);
  });

  it('no report yet (the camera just started): as before', () => {
    expect(hat({ state: 'found', locked: false, values: [], seen: null }).text).toBe('Hat ✓');
    expect(hat({ state: 'holding', locked: false, values: [], seen: seen(0.5) }).text).toBe('! Hat not in sight: holding');
  });
});

describe('following the head, in Show\'s row', () => {
  const hat = (h: NonNullable<ShowStatusInput['hat']>) => showStatusItems({ ...QUIET, hat: h })[0];
  it('says Head, not Hat, and a bow in words', () => {
    expect(hat({ state: 'head', locked: false, values: [] }).text).toBe('Head ✓');
    expect(hat({ state: 'bow', locked: false, values: [] }).text).toBe('Head ✓ (bowed)');
    const low = hat({ state: 'head', locked: false, values: [], seen: { cap: 0.6, face: 0, lost: 3, fps: 25, seconds: 10 } });
    expect([low.tone, low.text]).toEqual(['warn', '! Face seen only 60% of the last 10 s']);
  });
});

describe('the colours silenced on the iPad (K4)', () => {
  it('names them, with a button to bring them back; none, nothing', () => {
    expect(showStatusItems({ ...QUIET, silentColours: ['Red', 'Green'] })).toEqual([
      { key: 'silentColours', tone: 'note', text: 'Red and Green silenced on the iPad', actions: ['countersBack'] },
    ]);
    expect(showStatusItems({ ...QUIET, silentColours: ['Red', 'Blue', 'Green'] })[0].text).toBe('Red, Blue and Green silenced on the iPad');
    expect(showStatusItems({ ...QUIET, silentColours: [] })).toEqual([]);
  });
});
