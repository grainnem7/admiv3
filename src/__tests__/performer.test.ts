import { describe, it, expect } from 'vitest';
import { forPerformer, isPerformerPage, performerLink } from '../remote/performer';
import { DEFAULT_REMOTE_TOUCH, parseRemoteMessage, SIMPLE_ROWS, type RemoteState } from '../remote/protocol';

/** The second performer's page (owner, 7 Nov 2026): everything, whatever Tim's iPad is set to. */
describe('the second performer', () => {
  const tim: RemoteState = {
    values: { tempo: 0.5, dynamics: 0.5, fill: 0, evolve: 0 },
    labels: { tempo: '90 BPM', dynamics: '50%', fill: 'Off', evolve: 'Off' },
    kept: false, muted: false, playing: true,
    layout: 'simple',
    shown: { strips: ['tempo'], pads: ['mute'], loopsPage: false },
    locked: ['tempo'],
    reach: { tempo: { low: 0.2, high: 0.6 }, dynamics: { low: 0, high: 1 }, fill: { low: 0, high: 1 }, evolve: { low: 0, high: 1 } },
    learning: true,
    stripMode: 'follow',
    rows: ['counters'],
    touch: { ...DEFAULT_REMOTE_TOUCH, actOn: 'lift', secondTapMinMs: 1200 },
    clock: { text: '4:12', phase: 'running' },
    piece: { now: 'Rising', next: 'Storm', nextIn: '0:20' },
  };

  it('Tim’s layout, shown strips and pads, reach, learning and touch are his alone: the second performer gets everything; a lock stays (the laptop ignores a locked strip from any page)', () => {
    const p = forPerformer(tim);
    expect(p.layout).toBeUndefined();
    expect(p.shown).toBeUndefined();
    expect(p.locked).toEqual(['tempo']);
    expect(p.reach).toBeUndefined();
    expect(p.learning).toBeUndefined();
    expect(p.stripMode).toBeUndefined();
    expect(p.rows).toEqual(SIMPLE_ROWS);
    expect(p.touch).toEqual({ ...DEFAULT_REMOTE_TOUCH, playExtras: ['nextScene', 'endPiece'], playLoops: [], showNext: true });
    // What the laptop says about the piece is kept.
    expect(p.clock).toEqual(tim.clock);
    expect(p.piece).toEqual(tim.piece);
    expect(p.values).toEqual(tim.values);
  });

  it('the page and its link: the iPad’s link with performer=1', () => {
    expect(isPerformerPage('?remote=1234&performer=1')).toBe(true);
    expect(isPerformerPage('?remote=1234')).toBe(false);
    expect(performerLink('https://192.168.1.20:5173/?remote=1234')).toBe('https://192.168.1.20:5173/?remote=1234&performer=1');
  });

  it('▶ Start the piece is a message of its own (not one of the iPad pads)', () => {
    expect(parseRemoteMessage({ type: 'startPiece' })).toEqual({ type: 'startPiece' });
    expect(parseRemoteMessage({ type: 'trigger', name: 'startPiece' })).toBeNull();
  });

  it('the hat held from the second laptop (owner, 7 Nov 2026): a message of its own; the laptop says whether it is held', () => {
    expect(parseRemoteMessage({ type: 'hatHold', on: true })).toEqual({ type: 'hatHold', on: true });
    expect(parseRemoteMessage({ type: 'hatHold', on: 'yes' })).toBeNull();
    const m = parseRemoteMessage({ type: 'state', state: { ...tim, hatHeld: true } });
    expect(m?.type === 'state' && m.state.hatHeld).toBe(true);
    const none = parseRemoteMessage({ type: 'state', state: { ...tim } });
    expect(none?.type === 'state' && 'hatHeld' in none.state).toBe(false);
  });

  it('its heartbeat says who it is; the iPad’s says nothing more', () => {
    expect(parseRemoteMessage({ type: 'hello', build: null, ask: null, who: 'performer' })).toEqual({ type: 'hello', build: null, ask: null, who: 'performer' });
    expect(parseRemoteMessage({ type: 'hello', build: null, ask: null, who: 'someone' })).toEqual({ type: 'hello', build: null, ask: null });
    expect(parseRemoteMessage({ type: 'hello', build: null, ask: null })).toEqual({ type: 'hello', build: null, ask: null });
  });
});
