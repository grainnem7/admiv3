import { describe, it, expect } from 'vitest';
import {
  A_MAJOR, B_MAJOR, DEMO_BPM, DEMO_END_PASS, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_SCENES, demoDueAt, demoMusic, demoScenes,
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

  it('lasts seven minutes, the longest a piece can be', () => {
    expect(DEMO_PERFORMANCE.lengthSec).toBe(7 * 60);
  });

  it('is mostly major, with a pentatonic shimmer, a mixolydian stretch and a minor breakdown, and ends a tone up in B major', () => {
    const scenes = demoScenes();
    const sec = (i: number): number => (i + 1 < scenes.length ? scenes[i + 1].at ?? 0 : DEMO_PERFORMANCE.lengthSec) - (scenes[i].at ?? 0);
    const by = (name: string): number => scenes.reduce((s, x, i) => s + (x.key?.scaleName === name ? sec(i) : 0), 0);
    expect(by('Major')).toBeGreaterThan(by('Mixolydian') + by('Minor'));
    expect(by('Mixolydian')).toBeGreaterThan(0);
    expect(by('Minor')).toBeGreaterThan(0);
    expect(by('Major pentatonic')).toBeGreaterThan(0);
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
          const midi = degreeMidi(7 - c.row, key.rootMidi, key.semitones) + 12 * (c.octave ?? 0);
          expect(chord, `${s.name}, beat ${col + 1}: ${c.sound}`).toContain(pc(midi));
        }
      }
    }
  });

  it('the guitar’s V chord keeps its root (E, G sharp, B in A major), not the diminished chord a seventh left without one', () => {
    const v = counterChord(7 - 4, 8, A_MAJOR.rootMidi, A_MAJOR.semitones, 'warm');
    expect(new Set(leftHand(triadPcs(v)).map(pc))).toEqual(new Set([4, 8, 11]));
  });

  it('ends with the Big finish, by itself, finished within its length, starting right after the last scene’s eighth pass', () => {
    expect(DEMO_PERFORMANCE.style).toBe('big');
    expect(DEMO_PERFORMANCE.ending).toBe('auto');
    const lead = endingDurationSec(DEMO_PERFORMANCE, DEMO_PASS_SEC);
    const asked = DEMO_PERFORMANCE.lengthSec - lead;
    // Asked for during the pass before, so it begins on that pass: a multiple of four, after a fill.
    expect(DEMO_END_PASS % 4).toBe(0);
    expect(DEMO_END_PASS - DEMO_SCENES[DEMO_SCENES.length - 1].pass).toBe(8);
    expect(asked).toBeGreaterThan((DEMO_END_PASS - 1) * DEMO_PASS_SEC);
    expect(asked).toBeLessThanOrEqual(DEMO_END_PASS * DEMO_PASS_SEC);
  });

  it('keeps changing: no scene runs longer than eight passes, and no two scenes in a row play the same loops in the same key', () => {
    const scenes = demoScenes();
    for (const [i, s] of DEMO_SCENES.entries()) {
      const next = i + 1 < DEMO_SCENES.length ? DEMO_SCENES[i + 1].pass : DEMO_END_PASS;
      expect(next - s.pass, s.name).toBeLessThanOrEqual(8);
      if (i > 0) expect(JSON.stringify([scenes[i].loops, scenes[i].key]), s.name).not.toBe(JSON.stringify([scenes[i - 1].loops, scenes[i - 1].key]));
    }
  });

  it('the tunes are four bars: each pitched loop of more than one note is decorated on every other pass, or plays every beat', () => {
    for (const l of DEMO_LOOPS) {
      if (l.cells[0].job === 'drums' || l.cells.length <= 1) continue;
      const decorated = l.cells.some((c) => c.conditional);
      const everyBeat = new Set(l.cells.map((c) => c.col)).size === 8;
      expect(decorated || everyBeat, l.name).toBe(true);
    }
    expect(demoMusic().variationEnabled).toBe(true);
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

  it('the trombone plays a soft horn line of long notes over the band’s bass, which plays under it in every scene it is in', () => {
    const trombone = DEMO_LOOPS.filter((l) => l.name.startsWith('Trombone')).flatMap((l) => l.cells);
    for (const c of trombone) {
      expect(c.overBass).toBe(true);
      expect(c.velocity ?? 1).toBeLessThanOrEqual(0.6);
    }
    const main = DEMO_LOOPS.find((l) => l.name === 'Trombone')?.cells.filter((c) => !c.conditional) ?? [];
    expect(main.length).toBeLessThanOrEqual(4);
    for (const s of demoScenes()) {
      if (s.loops.some((l) => DEMO_LOOPS[l].name === 'Trombone')) expect(s.settings.bandJobs.bass, s.name).toBe(true);
    }
  });

  it('is full within a minute: pads and bass arrive with the trombone, a new part every four passes until the harp', () => {
    const scenes = demoScenes();
    expect(scenes[1].settings.band).not.toBe('off');
    expect(DEMO_SCENES[1].pass).toBe(4);
    expect(DEMO_SCENES[2].pass).toBe(8);
    expect(DEMO_SCENES[3].pass).toBe(12);
    const music = demoMusic();
    expect(music.widePads).toBe(true);
    expect(music.bandWithLoops).toBe(true);
    expect(music.space ?? 0).toBeGreaterThan(0.6);
  });

  it('every part but the drums sits a touch behind the beat, the same every time, never by more than 30 ms', () => {
    const msPerBeat = 60000 / DEMO_BPM;
    const late = DEMO_LOOPS.flatMap((l) => l.cells).filter((c) => c.timingBeats !== undefined);
    expect(late.length).toBeGreaterThan(10);
    for (const c of late) {
      expect(c.timingBeats ?? 0).toBeGreaterThan(0);
      expect((c.timingBeats ?? 0) * msPerBeat).toBeLessThanOrEqual(30);
    }
  });
});
