import { describe, it, expect } from 'vitest';
import {
  A_MAJOR, B_MAJOR, DEMO_BPM, DEMO_END_PASS, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_SCENES, demoDueAt, demoMusic, demoScenes,
} from '../songs/demo/demoPiece';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig } from '../profiles/BoardSequencerConfig';
import { clashes, sequenceAt } from '../songs/harmony/currentChord';
import { degreeMidi } from '../songs/boardSequencerScale';
import { endingDurationSec } from '../songs/performance/clock';
import { openingScene, sceneAt } from '../songs/performance/piece';

/**
 * The demo piece (owner's request 2026-11-06): drums alone, then trombone, guitar, harp and
 * clarinet; mostly major, moving through other modes and into minor; beautiful transitions;
 * a big dramatic ending; the same every time.
 */


/**
 * A note rubs against a chord when it is a semitone from one of its notes (the clash nudge's
 * rule), except the colours of this music high above the chord: its major seventh (Dmaj7's
 * C sharp) and its ninth (Dm9's E). Low down, in the bass, they still rub; the fourth over a
 * major third always does.
 */
function rubs(midi: number, h: { root: number; tones: number[] }): boolean {
  if (!clashes(midi, h.tones)) return false;
  const above = (((midi - h.root) % 12) + 12) % 12;
  return !((above === 11 || above === 2) && midi >= 66);
}

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

  it('moves from A major to A minor and up to B major, all in the pentatonic scale', () => {
    const scenes = demoScenes();
    expect(scenes[0].key).toEqual(A_MAJOR);
    expect(scenes.some((x) => x.key?.scaleName === 'Minor pentatonic')).toBe(true);
    expect(scenes[scenes.length - 1].key).toEqual(B_MAJOR);
    for (const x of scenes) expect(x.key?.semitones.length).toBe(5);
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

  it('no written note on a strong beat rubs against the chord the pads hold, in any scene, on any pass of its chords', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? A_MAJOR;
      const cells = sc.loops.flatMap((i) => DEMO_LOOPS[i].cells).filter((c) => c.job === 'melody' || c.job === 'bass');
      // Every chord of the scene's sequence: one pass after another, enough to go round it.
      for (let pass = 0; pass < 8; pass++) {
        for (let col = 0; col < 8; col += 2) {
          const h = sequenceAt({
            setting: sc.settings.chords, style: 'warm', rootMidi: key.rootMidi, semitones: key.semitones,
            beatsIn: pass * 8 + col, step: col, loop: 8, bandOn: true,
          }).harmony;
          if (!h) continue;
          for (const c of cells.filter((x) => x.col === col)) {
            const midi = degreeMidi(7 - c.row, key.rootMidi, key.semitones) - (c.job === 'bass' ? 24 : 0);
            expect(rubs(midi, h), `${sc.name}, pass ${pass + 1}, beat ${col + 1}: ${c.sound} ${midi} over ${h.symbol}`).toBe(false);
          }
        }
      }
    }
  });

  it('the guitar strums the chord the pads hold: it never names one', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells[0].job === 'chord')) for (const c of l.cells) expect(c.follows, l.name).toBe(true);
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
      // Drums play a groove; a held loop is a swell, not a tune.
      if (l.cells[0].job === 'drums' || l.cells.length <= 1 || l.cells.every((c) => c.holdBeats)) continue;
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

  it('opens with the pads: eight passes of drums and pads before the trombone; the pads are wide and lead', () => {
    const scenes = demoScenes();
    expect(scenes[0].loops.map((l) => DEMO_LOOPS[l].name)).toEqual(['Drums']);
    expect(scenes[0].settings.band).toBe('full');
    expect(scenes[0].settings.bandJobs.pads).toBe(true);
    expect(DEMO_SCENES[1].pass).toBe(8);
    expect(DEMO_SCENES[1].name).toBe('Trombone');
    const music = demoMusic();
    expect(music.widePads).toBe(true);
    expect(music.bandWithLoops).toBe(true);
    expect(music.space ?? 0).toBeGreaterThan(0.6);
  });

  it('the instruments are quiet, inside the pads: no loop note louder than 0.6', () => {
    for (const l of DEMO_LOOPS) {
      if (l.cells[0].job === 'drums') continue;
      for (const c of l.cells) expect(c.velocity ?? 1, l.name).toBeLessThanOrEqual(0.6);
    }
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

  it('never a pop progression: every scene holds a drone or a pair of colour chords, slow', () => {
    for (const sc of demoScenes()) {
      expect(['still', 'lift', 'float', 'shade'], sc.name).toContain(sc.settings.chords.sequence);
      expect(sc.settings.chords.bars, sc.name).toBeGreaterThanOrEqual(2);
    }
  });

  it('the new pairs are colour chords: Lift is A suspended then B minor with a ninth; Float A with a ninth then F# minor with a ninth; Shade F# minor then B minor, both with ninths', () => {
    const names = (sequence: 'lift' | 'float' | 'shade'): string[] => [0, 1].map((i) => sequenceAt({
      setting: { sequence, bars: 1 }, style: 'warm', rootMidi: 69, semitones: A_MAJOR.semitones, beatsIn: i * 4, step: 0, loop: 8, bandOn: true,
    }).harmony?.symbol ?? '');
    expect(names('lift')).toEqual(['Asus2', 'Bmadd9']);
    expect(names('float')).toEqual(['Aadd9', 'F#madd9']);
    expect(names('shade')).toEqual(['F#madd9', 'Bmadd9']);
  });

  it('the trombone enters holding its notes a whole pass at a time, and begins to breathe with the harp', () => {
    const scenes = demoScenes();
    const names = (i: number): string[] => scenes[i].loops.map((l) => DEMO_LOOPS[l].name);
    const held = DEMO_LOOPS.find((l) => l.name === 'Trombone held')?.cells ?? [];
    expect(held.length).toBeGreaterThan(0);
    for (const c of held) expect(c.holdBeats).toBe(8);
    expect(names(1)).toContain('Trombone held');
    expect(names(2)).toContain('Trombone held');
    expect(names(3)).toContain('Trombone');
  });
});
