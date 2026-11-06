import { describe, it, expect } from 'vitest';
import {
  A_MAJOR, B_MAJOR, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_SCENES, demoDueAt, demoMusic, demoScenes,
} from '../songs/demo/demoPiece';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig } from '../profiles/BoardSequencerConfig';
import { counterChord } from '../songs/harmony/currentChord';
import { leftHand, triadPcs } from '../songs/harmony/harmony';
import { degreeMidi } from '../songs/boardSequencerScale';
import { endingDurationSec } from '../songs/performance/clock';
import { openingScene, sceneAt } from '../songs/performance/piece';

/**
 * The demo piece (owner's request 2026-11-06): drums alone, then trombone, guitar, harp and
 * clarinet; mostly major, moving through other modes and into minor; beautiful transitions;
 * a big dramatic ending; the same every time.
 */

const pc = (m: number): number => ((m % 12) + 12) % 12;

describe('the demo piece', () => {
  it('is the same every time it is made', () => {
    expect(demoMusic()).toEqual(demoMusic());
  });

  it('survives being saved: the loops keep what they play, the scenes their keys', () => {
    const saved = sanitizeBoardSequencerConfig(JSON.parse(JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...demoMusic() })));
    expect(saved).not.toBeNull();
    const music = demoMusic();
    expect(saved?.loopSlots).toEqual(music.loopSlots);
    expect(saved?.scenes).toEqual(music.scenes);
    expect(saved?.pieces.find((p) => p.id === DEMO_PIECE_ID)?.scenes).toEqual(music.scenes);
    expect(saved?.performance).toEqual(DEMO_PERFORMANCE);
    expect(saved?.fillEngine).toBe('rules');
    expect(saved?.surpriseMe).toBe(false);
    expect(saved?.pieceIdeas).toBeGreaterThan(0);
  });

  it('begins with the drums alone, in A major, then the trombone, the guitar, the harp and the clarinet join in that order', () => {
    const scenes = demoScenes();
    const loopNames = (i: number): string[] => scenes[i].loops.map((s) => DEMO_LOOPS[s].name);
    expect(scenes[0].at).toBe(0);
    expect(loopNames(0)).toEqual(['Drums']);
    expect(scenes[0].key).toEqual(A_MAJOR);
    const firstIn = (word: string): number => scenes.findIndex((_, i) => loopNames(i).some((n) => n.startsWith(word)));
    const order = ['Trombone', 'Guitar', 'Harp', 'Clarinet'].map(firstIn);
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is mostly major, with a mixolydian stretch and a minor breakdown, and ends a tone up in B major', () => {
    const scenes = demoScenes();
    const sec = (i: number): number => (i + 1 < scenes.length ? scenes[i + 1].at ?? 0 : DEMO_PERFORMANCE.lengthSec) - (scenes[i].at ?? 0);
    const by = (name: string): number => scenes.reduce((s, x, i) => s + (x.key?.scaleName === name ? sec(i) : 0), 0);
    expect(by('Major')).toBeGreaterThan(by('Mixolydian') + by('Minor'));
    expect(by('Mixolydian')).toBeGreaterThan(0);
    expect(by('Minor')).toBeGreaterThan(0);
    expect(scenes[scenes.length - 1].key).toEqual(B_MAJOR);
  });

  it('every change lands on a pass after a fill: a multiple of four passes, due a second before', () => {
    for (const s of DEMO_SCENES) expect(s.pass % 4).toBe(0);
    for (const [i, s] of demoScenes().entries()) {
      const pass = DEMO_SCENES[i].pass;
      expect(s.at).toBe(demoDueAt(pass));
      if (pass > 0) {
        // Due within the pass before, so it comes in on its own pass.
        expect(s.at as number).toBeGreaterThan((pass - 1) * DEMO_PASS_SEC);
        expect(s.at as number).toBeLessThan(pass * DEMO_PASS_SEC);
      }
    }
  });

  it('the scene on is the plan’s at every moment, and the piece opens in the first', () => {
    const scenes = demoScenes();
    expect(openingScene(scenes, 0)).toBe(0);
    for (const [i, s] of DEMO_SCENES.entries()) expect(sceneAt(scenes, s.pass * DEMO_PASS_SEC + 0.5)).toBe(i);
  });

  it('the harp and the clarinet never play together (one Melody track in Ableton), and every change between them is a cut', () => {
    const scenes = demoScenes();
    for (const [i, s] of scenes.entries()) {
      const melody = new Set(s.loops.map((l) => DEMO_LOOPS[l].cells[0].sound));
      expect(melody.has('harp') && melody.has('clarinet'), s.name).toBe(false);
      if (i === 0) continue;
      const before = new Set(scenes[i - 1].loops.map((l) => DEMO_LOOPS[l].cells[0].sound));
      const swaps = (before.has('harp') && melody.has('clarinet')) || (before.has('clarinet') && melody.has('harp'));
      if (swaps) expect(s.wayIn, s.name).toEqual({ kind: 'cut' });
    }
  });

  it('every written note on a strong beat is a note of its chord, in every scene and key', () => {
    for (const s of demoScenes()) {
      const key = s.key ?? A_MAJOR;
      const loops = s.loops.map((i) => DEMO_LOOPS[i]);
      let chord: number[] = [];
      for (let col = 0; col < 8; col++) {
        const cells = loops.flatMap((l) => l.cells.filter((c) => c.col === col));
        const guitar = cells.find((c) => c.job === 'chord');
        if (guitar) chord = triadPcs(counterChord(guitar.row, 8, key.rootMidi, key.semitones, 'warm'));
        if (col % 2 !== 0 || chord.length === 0) continue;
        for (const c of cells) {
          if (c.job !== 'melody' && c.job !== 'bass') continue;
          const midi = degreeMidi(7 - c.row, key.rootMidi, key.semitones);
          expect(chord, `${s.name}, beat ${col + 1}: ${c.sound}`).toContain(pc(midi));
        }
      }
    }
  });

  it('the guitar’s V chord keeps its root (E, G sharp, B in A major), not the diminished chord a seventh left without one', () => {
    const v = counterChord(7 - 4, 8, A_MAJOR.rootMidi, A_MAJOR.semitones, 'warm');
    expect(new Set(leftHand(triadPcs(v)).map(pc))).toEqual(new Set([4, 8, 11]));
  });

  it('ends with the Big finish, by itself, finished within its length, starting right after the last section’s eighth pass', () => {
    expect(DEMO_PERFORMANCE.style).toBe('big');
    expect(DEMO_PERFORMANCE.ending).toBe('auto');
    const lead = endingDurationSec(DEMO_PERFORMANCE, DEMO_PASS_SEC);
    const asked = DEMO_PERFORMANCE.lengthSec - lead;
    const last = DEMO_SCENES[DEMO_SCENES.length - 1].pass;
    // Asked for during pass last + 3, so it begins on the pass after: the last section plays four whole passes.
    expect(asked).toBeGreaterThan((last + 3) * DEMO_PASS_SEC);
    expect(asked).toBeLessThanOrEqual((last + 4) * DEMO_PASS_SEC);
  });

  it('plays the same each time: the rules’ extra notes with fixed ideas, every scene its own', () => {
    const music = demoMusic();
    expect(music.fillEngine).toBe('rules');
    const ideas = demoScenes().map((s) => s.ideas);
    expect(ideas.every((x) => typeof x === 'number' && x > 0)).toBe(true);
    expect(new Set(ideas).size).toBe(ideas.length);
  });

  it('the drums play the groove; every other loop one note per counter', () => {
    for (const l of DEMO_LOOPS) {
      for (const c of l.cells) expect(c.plays, l.name).toBe(c.job === 'drums' ? 'tune' : 'note');
    }
  });
});
