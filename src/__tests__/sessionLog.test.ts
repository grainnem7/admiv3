import { describe, it, expect } from 'vitest';
import { loggedSettings, MAX_LOGGED_NOTES, SessionLog, sessionFileName } from '../songs/sessionLog';
import type { FiredNote } from '../songs/BoardSequencerEngine';

const note = (over: Partial<FiredNote> = {}): FiredNote => ({
  row: 2, col: 3, colour: 'c1', role: 'melody', audioTime: 10.5, durSec: 0.5, source: 'live', origin: 'placed', midi: 69, velocity: 0.7, ...over,
});

function log(): { l: SessionLog; tick(ms: number): void } {
  let now = 1000;
  const l = new SessionLog(() => now);
  return { l, tick: (ms) => { now += ms; } };
}

describe('the session log', () => {
  it('keeps what the player made apart from what the instrument added', () => {
    const { l } = log();
    l.start('Tim', { bpm: 90, band: 'gentle' }, 10);
    l.addNotes([note(), note({ origin: 'phrase' }), note({ origin: 'fill' }), note({ origin: 'band', row: -1, col: -1 })]);
    expect(l.counts()).toEqual({ notes: 4, placed: 2, added: 2, events: 1 });
    const json = l.toJSON();
    expect(json.notes[0]).toMatchObject({ t: 0.5, origin: 'placed', midi: 69, velocity: 0.7 });
    expect(json.notes[3].origin).toBe('band');
    expect(json.events[0]).toMatchObject({ kind: 'start', player: 'Tim', settings: { bpm: 90, band: 'gentle' } });
  });

  it('writes the board down only when it changes, and says who changed a setting', () => {
    const { l, tick } = log();
    l.start('Tim', {}, 0);
    l.board([{ row: 1, col: 1, colour: 'c1' }]);
    l.board([{ row: 1, col: 1, colour: 'c1' }]);
    tick(2000);
    l.board([{ row: 1, col: 1, colour: 'c1' }, { row: 2, col: 5, colour: 'c2' }]);
    l.setting('ipad', { fillAmount: 0.6 });
    l.setting('laptop', { boardColours: [] }); // not a setting worth logging
    l.action('counter', 'new idea');
    l.stop();
    const kinds = l.toJSON().events.map((e) => `${e.kind}@${e.t}`);
    expect(kinds).toEqual(['start@0', 'board@0', 'board@2', 'setting@2', 'action@2', 'stop@2']);
    const ev = l.toJSON().events[3];
    expect(ev).toMatchObject({ kind: 'setting', by: 'ipad', change: { fillAmount: 0.6 } });
  });

  it('logs nothing outside a session', () => {
    const { l } = log();
    l.addNotes([note()]);
    l.board([{ row: 0, col: 0, colour: 'c1' }]);
    expect(l.counts().notes).toBe(0);
    expect(l.toJSON().events).toEqual([]);
  });

  it('never grows past its cap', () => {
    const { l } = log();
    l.start('x', {}, 0);
    l.addNotes(Array.from({ length: MAX_LOGGED_NOTES + 10 }, () => note()));
    expect(l.counts().notes).toBe(MAX_LOGGED_NOTES);
  });

  it('CSV has one line per note with the chord stack spelled out', () => {
    const { l } = log();
    l.start('x', {}, 10);
    l.addNotes([note(), note({ role: 'chord', midi: undefined, midis: [60, 64, 67] }), note({ role: 'drums', midi: undefined, drum: 'kick' })]);
    const lines = l.toCsv().split('\n');
    expect(lines[0]).toBe('t,origin,role,colour,row,col,pitch,drum,velocity,durSec,source');
    expect(lines[1]).toBe('0.5,placed,melody,c1,2,3,69,,0.7,0.5,live');
    expect(lines[2]).toContain('60 64 67');
    expect(lines[3]).toContain(',kick,');
  });

  it('keeps only the settings that change what is heard, and the channels\' jobs', () => {
    const kept = loggedSettings({
      bpm: 90, boardColours: [1, 2], corners: [], channels: [{ id: 'c1', role: 'melody', instrument: 'harp', band: { hue: 1 } }],
    });
    expect(kept).toEqual({ bpm: 90, channels: [{ id: 'c1', role: 'melody', instrument: 'harp' }] });
  });

  it('names the file after the player and the time', () => {
    expect(sessionFileName('Tim O\'Brien', new Date('2026-10-06T14:05:00Z'), 'csv')).toBe('admi-board-Tim-O-Brien-2026-10-06_14-05.csv');
    expect(sessionFileName('', new Date('2026-10-06T14:05:00Z'), 'json')).toMatch(/^admi-board-player-/);
  });
});
