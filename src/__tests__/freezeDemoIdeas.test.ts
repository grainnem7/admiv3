import { describe, it, expect } from 'vitest';
import { demoIdeasSource, freezeDemoIdeas } from '../../scripts/freeze-demo-ideas.mjs';
import { demoScenes } from '../songs/demo/demoPiece';
import type { KeptIdea } from '../songs/performance/ideas';

/**
 * Freezing Magenta's ideas into the demo (Rising Light, C6): a rehearsal's backup file in,
 * each demo scene's kept ideas out as data, so every performance replays the ideas chosen by ear.
 */

const idea = (key: string, midi: number): KeptIdea => ({
  key, notes: [{ step: 2, offset: 0, role: 'melody', colour: 'loop:melody:piano', midi, dur: 0.5, accent: 0.6, cell: { row: 1, col: 2 }, rule: 'ai' }],
});

/** A backup as Make a piece's "Back up to a file" writes it: raw stored strings. */
function backup(players: unknown[]): unknown {
  return {
    app: 'admi-board', version: 1, savedAt: 1,
    keys: { 'admi-board-players': JSON.stringify(players), 'admi-board-active-player': 'demo' },
  };
}

describe('freezing the demo’s Magenta ideas', () => {
  it('reads each demo scene’s kept ideas from a backup, by scene id', () => {
    const b = backup([
      { id: 'tim', name: 'Tim', settings: { scenes: [{ id: 'demo-3', aiIdeas: [idea('tims000000000000', 60)] }] }, channelSettings: {} },
      {
        id: 'demo', name: 'Demo piece', channelSettings: {},
        settings: { scenes: [{ id: 'demo-1' }, { id: 'demo-3', aiIdeas: [idea('aaaa000000000000', 73)] }, { id: 'demo-9', aiIdeas: [idea('bbbb000000000000', 76), idea('cccc000000000000', 78)] }] },
      },
    ]);
    expect(freezeDemoIdeas(b)).toEqual({
      'demo-3': [idea('aaaa000000000000', 73)],
      'demo-9': [idea('bbbb000000000000', 76), idea('cccc000000000000', 78)],
    });
  });

  it('a file that is not a backup, or has no demo player, freezes nothing', () => {
    expect(() => freezeDemoIdeas({ hello: 1 })).toThrow(/not an ADMI backup/);
    expect(() => freezeDemoIdeas(backup([{ id: 'tim', settings: {} }]))).toThrow(/no demo piece/);
  });

  it('writes the ideas as a data file that reads back the same (a round trip)', () => {
    const frozen = { 'demo-3': [idea('aaaa000000000000', 73)] };
    const source = demoIdeasSource(frozen);
    expect(source).toContain('export const DEMO_FROZEN_IDEAS');
    const json = source.slice(source.indexOf('= ') + 2, source.lastIndexOf(';'));
    expect(JSON.parse(json)).toEqual(frozen);
  });

  it('the demo’s scenes carry their frozen ideas from the first run; scenes with none carry none', () => {
    const frozen = { 'demo-3': [idea('aaaa000000000000', 73)] };
    const scenes = demoScenes(frozen);
    expect(scenes[2].id).toBe('demo-3');
    expect(scenes[2].aiIdeas).toEqual(frozen['demo-3']);
    expect(scenes[0].aiIdeas).toBeUndefined();
    // A copy: the scene never shares the frozen data.
    expect(scenes[2].aiIdeas).not.toBe(frozen['demo-3']);
  });
});
