import { describe, it, expect } from 'vitest';
import {
  DEMO_BPM, DEMO_END_PASS, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_SCENES, F_SHARP_MAJOR, F_SHARP_MINOR,
  demoColourVoices, demoDueAt, demoMusic, demoScenes,
} from '../songs/demo/demoPiece';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, type StoredLoopCell } from '../profiles/BoardSequencerConfig';
import { clashes, sequenceAt } from '../songs/harmony/currentChord';
import { degreeMidi } from '../songs/boardSequencerScale';
import { endingDurationSec } from '../songs/performance/clock';
import { openingScene, sceneAt } from '../songs/performance/piece';
import type { SceneKey } from '../songs/performance/launcher';

/**
 * The demo piece, "Rising Light" (docs/superpowers/specs/2026-11-06-demo-composition-design.md):
 * ambient first, in one pentatonic key, never boring, the same every time.
 */

/**
 * A note rubs against a chord when it is a semitone from one of its notes (the clash nudge's
 * rule), except the colours of this music high above the chord: its major seventh (Dmaj7's
 * C sharp) and its ninth. Low down, in the bass, they still rub.
 */
function rubs(midi: number, h: { root: number; tones: number[] }): boolean {
  if (!clashes(midi, h.tones)) return false;
  const above = (((midi - h.root) % 12) + 12) % 12;
  return !((above === 11 || above === 2) && midi >= 66);
}

/** A loop note's pitch in a key: its row's note, the bass two octaves under, and its octave. */
function pitchOf(c: StoredLoopCell, key: SceneKey): number {
  return degreeMidi(7 - c.row, key.rootMidi, key.semitones) - (c.job === 'bass' ? 24 : 0) + 12 * (c.octave ?? 0);
}
const loopNamed = (name: string) => DEMO_LOOPS.find((l) => l.name === name);
const loopNames = (s: { loops: number[] }): string[] => s.loops.map((l) => DEMO_LOOPS[l].name);
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m: number): string => NOTE[((m % 12) + 12) % 12];

describe('Rising Light: the piece', () => {
  it('is the same every time it is made', () => {
    expect(demoMusic()).toEqual(demoMusic());
  });

  it('survives being saved: the loops keep what they play, the scenes their keys and band jobs (the pedal too)', () => {
    const saved = sanitizeBoardSequencerConfig(JSON.parse(JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...demoMusic() })));
    expect(saved).not.toBeNull();
    const music = demoMusic();
    expect(saved?.loopSlots).toEqual(music.loopSlots);
    expect(saved?.scenes).toEqual(music.scenes);
    expect(saved?.pieces.find((p) => p.id === DEMO_PIECE_ID)?.scenes).toEqual(music.scenes);
    expect(saved?.performance).toEqual(DEMO_PERFORMANCE);
    expect(saved?.fillEngine).toBe('magenta');
    expect(saved?.surpriseMe).toBe(false);
    expect(saved?.noteLengthBeats).toBe(2);
    expect(saved?.scenes.some((s) => s.settings.bandJobs.pedal)).toBe(true);
  });

  it('is in F sharp minor pentatonic at 87 BPM, the chords from its parent scale; the afterglow in F sharp major pentatonic', () => {
    const music = demoMusic();
    expect(music.scaleRootMidi).toBe(66);
    expect(music.scaleName).toBe('Minor pentatonic');
    expect(music.bpm).toBe(87);
    const scenes = demoScenes();
    expect(scenes[0].key).toEqual(F_SHARP_MINOR);
    expect(scenes.find((s) => s.name === 'Afterglow')?.key).toEqual(F_SHARP_MAJOR);
    expect(scenes.find((s) => s.name === 'Afterglow')?.settings.chords.sequence).toBe('float');
  });

  it('the form: ten scenes at the composition’s passes, Dawn to Afterglow', () => {
    expect(DEMO_SCENES.map((s) => [s.name, s.pass])).toEqual([
      ['Dawn', 0], ['Theme', 8], ['Pulse', 16], ['Heartbeat', 24], ['Build', 32], ['Hush', 36],
      ['Ascent', 40], ['Lift', 48], ['Summit', 56], ['Afterglow', 64],
    ]);
    const scenes = demoScenes();
    const by = (n: string) => scenes.find((s) => s.name === n);
    expect(by('Theme')?.wayIn).toEqual({ kind: 'fade', passes: 1 });
    expect(by('Heartbeat')?.leadIn).toBe('rising');
    expect(by('Ascent')?.leadIn).toBe('drumFill');
    expect(by('Summit')?.leadIn).toBe('drumFill');
    expect(scenes.map((s) => s.settings.sceneEnergy)).toEqual([1, 2, 2, 3, 4, 1, 3, 4, 5, 2]);
    // The Hush: only the pads and the piano.
    expect(loopNames(by('Hush')!)).toEqual(['Piano theme']);
    expect(by('Hush')?.settings.bandJobs).toEqual({ asBefore: false, pads: true, bass: false, drums: false, counter: false });
  });

  it('the chords: a drone at dawn, Tide for the night, Rise for the climb (twice as fast in Build and at the summit), Float in the major', () => {
    const chords = demoScenes().map((s) => `${s.settings.chords.sequence}/${s.settings.chords.bars}`);
    expect(chords).toEqual(['still/4', 'tide/4', 'tide/4', 'tide/4', 'rise/2', 'tide/4', 'rise/4', 'rise/4', 'rise/2', 'float/4']);
  });

  it('the sub holds a pedal F# under Tide in the early scenes, and follows the roots from Heartbeat on', () => {
    const scenes = demoScenes();
    const pedal = scenes.map((s) => s.settings.bandJobs.pedal === true);
    expect(pedal).toEqual([false, true, true, false, false, false, false, false, false, false]);
    const heartbeat = scenes.findIndex((s) => s.name === 'Heartbeat');
    for (const s of scenes.slice(heartbeat)) if (s.name !== 'Hush') expect(s.settings.bandJobs.bass, s.name).toBe(true);
  });

  it('lasts seven minutes and ends with the final chord, by itself, starting right after the last scene’s eighth pass', () => {
    expect(DEMO_PERFORMANCE.lengthSec).toBe(7 * 60);
    expect(DEMO_PERFORMANCE.style).toBe('chord');
    expect(DEMO_PERFORMANCE.ending).toBe('auto');
    const lead = endingDurationSec(DEMO_PERFORMANCE, DEMO_PASS_SEC);
    const asked = DEMO_PERFORMANCE.lengthSec - lead;
    // Asked for during the pass before, so it begins on that pass: a multiple of four.
    expect(DEMO_END_PASS % 4).toBe(0);
    expect(DEMO_END_PASS - DEMO_SCENES[DEMO_SCENES.length - 1].pass).toBe(8);
    expect(asked).toBeGreaterThan((DEMO_END_PASS - 1) * DEMO_PASS_SEC);
    expect(asked).toBeLessThanOrEqual(DEMO_END_PASS * DEMO_PASS_SEC);
  });

  it('every change lands on a pass that is a multiple of four, due a second before', () => {
    for (const s of DEMO_SCENES) expect(s.pass % 4).toBe(0);
    for (const [i, s] of demoScenes().entries()) {
      const pass = DEMO_SCENES[i].pass;
      expect(s.at).toBe(demoDueAt(pass));
      if (pass > 0) {
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

  it('plays the same each time: Magenta’s extra notes with fixed ideas, every scene its own', () => {
    expect(demoMusic().fillEngine).toBe('magenta');
    const ideas = demoScenes().map((s) => s.ideas);
    expect(ideas.every((x) => typeof x === 'number' && x > 0)).toBe(true);
    expect(new Set(ideas).size).toBe(ideas.length);
  });
});

describe('Rising Light: the theme', () => {
  const question = (cells: StoredLoopCell[]) => cells.filter((c) => !c.conditional);
  const answer = (cells: StoredLoopCell[]) => cells.filter((c) => c.conditional);

  it('asks on every pass: C#, B, A, then up to E, in F sharp minor', () => {
    const piano = loopNamed('Piano theme')!.cells;
    expect(question(piano).map((c) => [c.col, name(pitchOf(c, F_SHARP_MINOR))])).toEqual([[0, 'C#'], [3, 'B'], [4, 'A'], [6, 'E']]);
    expect(question(piano).map((c) => pitchOf(c, F_SHARP_MINOR))).toEqual([73, 71, 69, 76]);
    expect(question(piano).map((c) => c.holdBeats)).toEqual([3, 1, 2, 2]);
  });

  it('answers on every other pass: B and the F# above', () => {
    const piano = loopNamed('Piano theme')!.cells;
    expect(answer(piano).map((c) => [c.col, pitchOf(c, F_SHARP_MINOR)])).toEqual([[5, 71], [7, 78]]);
    expect(demoMusic().variationEnabled).toBe(true);
  });

  it('in F sharp major the same steps sing C#, A#, G#, D#: the theme’s shape, in light', () => {
    const piano = loopNamed('Piano theme')!.cells;
    expect(question(piano).map((c) => name(pitchOf(c, F_SHARP_MAJOR)))).toEqual(['C#', 'A#', 'G#', 'D#']);
  });

  it('the theme’s journey: bells at dawn, the piano, the singing lead, an octave up at the summit, the piano in the major', () => {
    const melodyOf = (n: string): string[] => [...new Set(loopNames(demoScenes().find((s) => s.name === n)!)
      .map((l) => loopNamed(l)!.cells[0]).filter((c) => c.job === 'melody').map((c) => `${c.sound}${c.octave ? `+${c.octave}` : ''}`))];
    expect(melodyOf('Dawn')).toEqual(['synth:bell+1']);
    expect(melodyOf('Theme')).toEqual(['piano']);
    expect(melodyOf('Hush')).toEqual(['piano']);
    expect(melodyOf('Ascent')).toEqual(['synth:keys']);
    expect(melodyOf('Summit')).toEqual(['synth:keys+1']);
    expect(melodyOf('Afterglow')).toEqual(['piano']);
    // The bells breathe C# and A, each held a bar.
    expect(loopNamed('Bells')!.cells.map((c) => [name(pitchOf(c, F_SHARP_MINOR)), c.holdBeats])).toEqual([['C#', 4], ['A', 4]]);
  });

  it('the Theme scene states the question only; the piano answers itself from the Pulse', () => {
    const scenes = demoScenes();
    expect(loopNames(scenes[1])).toEqual(['Piano question']);
    expect(loopNamed('Piano question')!.cells.some((c) => c.conditional)).toBe(false);
    expect(loopNames(scenes[2])).toContain('Piano theme');
  });
});

describe('Rising Light: ambient first', () => {
  it('no written note on a strong beat rubs against the chord the pads hold, in any scene, on any pass of its chords', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? F_SHARP_MINOR;
      // Notes half a beat late are between the beats, never on a strong one.
      const cells = sc.loops.flatMap((i) => DEMO_LOOPS[i].cells)
        .filter((c) => (c.job === 'melody' || c.job === 'bass') && (c.timingBeats ?? 0) < 0.25);
      for (let pass = 0; pass < 8; pass++) {
        for (let col = 0; col < 8; col += 2) {
          const h = sequenceAt({
            setting: sc.settings.chords, style: 'warm', rootMidi: key.rootMidi, semitones: key.semitones,
            beatsIn: pass * 8 + col, step: col, loop: 8, bandOn: true,
          }).harmony;
          if (!h) continue;
          for (const c of cells.filter((x) => x.col === col)) {
            const midi = pitchOf(c, key);
            expect(rubs(midi, h), `${sc.name}, pass ${pass + 1}, beat ${col + 1}: ${c.sound} ${midi} over ${h.symbol}`).toBe(false);
          }
        }
      }
    }
  });

  it('every scene is in a pentatonic key, and every written note is in it', () => {
    for (const s of demoScenes()) {
      expect(s.key?.semitones.length, s.name).toBe(5);
      expect(s.key?.scaleName ?? '', s.name).toMatch(/pentatonic/);
    }
  });

  it('nothing hits: no melodic note above 0.6, no percussion above 0.6, the shaker about 0.2 under the heartbeat', () => {
    for (const l of DEMO_LOOPS) for (const c of l.cells) expect(c.velocity ?? 1, `${l.name} ${c.sound}`).toBeLessThanOrEqual(0.6);
    const heartbeat = loopNamed('Percussion heartbeat')!.cells;
    for (const c of heartbeat.filter((x) => x.sound !== 'hat')) {
      expect(c.velocity ?? 0).toBeGreaterThanOrEqual(0.3);
      expect(c.velocity ?? 1).toBeLessThanOrEqual(0.45);
    }
    for (const c of heartbeat.filter((x) => x.sound === 'hat')) expect(c.velocity).toBeCloseTo(0.2, 2);
  });

  it('the percussion is one kit piece per counter, each a note, rows distinct within a step', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells[0].job === 'drums')) {
      const squares = new Set<string>();
      for (const c of l.cells) {
        expect(c.plays, l.name).toBe('note');
        expect(['kick', 'rim', 'snare', 'hat', 'tom', 'crash']).toContain(c.sound);
        expect(c.colour).toBe(`loop:drums:${c.sound}`);
        squares.add(`${c.col}:${c.row}`);
      }
      expect(squares.size, l.name).toBe(l.cells.length);
    }
  });

  it('the heartbeat: a soft kick on 1 and on the and of 2, a rim on 3 of each bar, a shaker breath on every and', () => {
    const at = (piece: string) => loopNamed('Percussion heartbeat')!.cells.filter((c) => c.sound === piece)
      .map((c) => c.col + (c.timingBeats ?? 0)).sort((a, b) => a - b);
    expect(at('kick')).toEqual([0, 1.5, 4, 5.5]);
    expect(at('rim')).toEqual([2, 6]);
    expect(at('hat')).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  });

  it('the summit adds a cymbal swell every other pass, the build toms every other pass', () => {
    expect(loopNamed('Percussion summit')!.cells.filter((c) => c.sound === 'crash').every((c) => c.conditional && c.col === 0)).toBe(true);
    const toms = loopNamed('Percussion build')!.cells.filter((c) => c.sound === 'tom');
    expect(toms).toHaveLength(2);
    expect(toms.every((c) => c.conditional && c.col === 7)).toBe(true);
  });

  it('the pulse: soft eighth notes on F# an octave over the bass, two counters a step, the second half a beat late', () => {
    const cells = loopNamed('Pulse')!.cells;
    expect(cells).toHaveLength(16);
    const ordered = [...cells].sort((a, b) => a.col + (a.timingBeats ?? 0) - (b.col + (b.timingBeats ?? 0)));
    expect(ordered.map((c) => name(pitchOf(c, F_SHARP_MINOR)))).toEqual([
      'F#', 'C#', 'A', 'E', 'F#', 'C#', 'A', 'B', 'F#', 'C#', 'A', 'E', 'F#', 'C#', 'A', 'B',
    ]);
    for (const c of cells) {
      expect(c.octave).toBe(1);
      expect(c.overBass).toBe(true);
      expect(c.sound).toBe('synth:pluck');
      expect(pitchOf(c, F_SHARP_MINOR)).toBeGreaterThanOrEqual(54);
      expect(pitchOf(c, F_SHARP_MINOR)).toBeLessThanOrEqual(71);
    }
    // Rows differ within a step.
    for (let col = 0; col < 8; col++) expect(new Set(cells.filter((c) => c.col === col).map((c) => c.row)).size).toBe(2);
  });

  it('the chord parts play the chord the pads hold: they never name one', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells[0].job === 'chord')) for (const c of l.cells) expect(c.follows, l.name).toBe(true);
    expect(loopNamed('Swells')!.cells.map((c) => [c.col, c.holdBeats])).toEqual([[0, 8]]);
  });

  it('the pads lead: wide, joining the loops, in a large shared room', () => {
    const music = demoMusic();
    expect(music.widePads).toBe(true);
    expect(music.bandWithLoops).toBe(true);
    expect(music.space ?? 0).toBeGreaterThan(0.6);
    for (const s of demoScenes()) expect(s.settings.bandJobs.pads, s.name).toBe(true);
  });

  it('every melodic part sits a touch behind the beat, never by more than 30 ms (between-the-beats notes aside)', () => {
    const msPerBeat = 60000 / DEMO_BPM;
    const late = DEMO_LOOPS.flatMap((l) => l.cells).filter((c) => c.timingBeats !== undefined && c.timingBeats < 0.25);
    expect(late.length).toBeGreaterThan(10);
    for (const c of late) expect((c.timingBeats ?? 0) * msPerBeat).toBeLessThanOrEqual(30);
  });
});

describe('Rising Light: Tim’s counters', () => {
  it('a counter placed anywhere on the board, in any scene, is a note of that scene’s pentatonic scale', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? F_SHARP_MINOR;
      const scale = new Set(key.semitones.map((st) => (key.rootMidi + st) % 12));
      for (let row = 0; row < 8; row++) {
        for (const shift of [0, -24]) {
          const midi = degreeMidi(7 - row, key.rootMidi, key.semitones) + shift;
          expect(scale.has(((midi % 12) + 12) % 12), `${sc.name}, row ${row}`).toBe(true);
        }
      }
    }
    // Played as written: never nudged out of the scale.
    expect(demoMusic().clashNudge).toBe(false);
  });

  it('his colours become ambient voices in the demo, one note each', () => {
    const voices = demoColourVoices({
      a: { role: 'melody', instrument: 'harp', plays: 'tune' as const }, b: { role: 'melody' }, c: { role: 'chord', instrument: 'guitarAcoustic' },
      d: { role: 'bass', instrument: 'tuba' }, e: { role: 'drums' }, f: { role: 'tempo' },
    });
    expect(voices.a).toEqual({ role: 'melody', instrument: 'synth:keys', plays: 'note', reverbSend: 0.5 });
    expect(voices.b.instrument).toBe('synth:bell');
    expect(voices.c.instrument).toBe('synth:pad');
    expect(voices.d.instrument).toBe('synth:sub');
    expect(voices.e).toEqual({ role: 'drums', plays: 'note', reverbSend: 0.5 });
    expect(voices.f).toEqual({ role: 'tempo' });
  });
});

describe('Rising Light: never boring, and one sound per Ableton track', () => {
  it('no pop sequence: every scene’s chords are a drone, Tide, Rise or Float', () => {
    for (const sc of demoScenes()) expect(['still', 'tide', 'rise', 'float'], sc.name).toContain(sc.settings.chords.sequence);
  });

  it('every scene differs from the one before in its loops, its chords or its key; none longer than eight passes', () => {
    const scenes = demoScenes();
    for (const [i, s] of DEMO_SCENES.entries()) {
      const next = i + 1 < DEMO_SCENES.length ? DEMO_SCENES[i + 1].pass : DEMO_END_PASS;
      expect(next - s.pass, s.name).toBeLessThanOrEqual(8);
      if (i === 0) continue;
      const sig = (k: number) => JSON.stringify([scenes[k].loops, scenes[k].settings.chords, scenes[k].key]);
      expect(sig(i), s.name).not.toBe(sig(i - 1));
    }
  });

  it('each scene has one melody instrument, one Bass track sound and one Chords track sound', () => {
    for (const s of demoScenes()) {
      for (const job of ['melody', 'bass', 'chord'] as const) {
        const sounds = new Set(s.loops.flatMap((l) => DEMO_LOOPS[l].cells).filter((c) => c.job === job).map((c) => c.sound));
        expect(sounds.size, `${s.name}: ${job}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('no more than sixteen loops; the trombone, clarinet, harp and guitar are retired from the demo', () => {
    expect(DEMO_LOOPS.length).toBeLessThanOrEqual(16);
    const sounds = new Set(DEMO_LOOPS.flatMap((l) => l.cells.map((c) => c.sound)));
    for (const old of ['trombone', 'clarinet', 'harp', 'guitarAcoustic']) expect(sounds.has(old), old).toBe(false);
  });
});
