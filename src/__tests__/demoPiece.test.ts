import { describe, it, expect } from 'vitest';
import {
  A_MAJOR, B_MAJOR, DEMO_BPM, DEMO_END_PASS, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_PLAYER_TRACK, DEMO_SCENES,
  F_SHARP_MINOR, demoColourVoices, demoDueAt, demoMusic, demoScenes,
} from '../songs/demo/demoPiece';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, type StoredLoopCell } from '../profiles/BoardSequencerConfig';
import { clashes, sequenceAt } from '../songs/harmony/currentChord';
import { degreeMidi } from '../songs/boardSequencerScale';
import { endingDurationSec } from '../songs/performance/clock';
import { openingScene, sceneAt } from '../songs/performance/piece';
import type { SceneKey } from '../songs/performance/launcher';

/**
 * The demo piece, "Rising Light" version 2 (docs/superpowers/specs/2026-11-06-demo-composition-v2-design.md,
 * built on version 1's): light first, the band gathering in the owner's order, loops and
 * Magenta that develop, Tim's glow, a big ending; ambient, in one set of five notes, the
 * same every time.
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
/** The cells that sound on one pass of every four (0 to 3). */
const onPass = (cells: StoredLoopCell[], pass: number) => cells.filter((c) => !c.passes || c.passes.includes(pass));
const by = (n: string) => demoScenes().find((s) => s.name === n);

describe('Rising Light v2: the piece', () => {
  it('is the same every time it is made', () => {
    expect(demoMusic()).toEqual(demoMusic());
  });

  it('survives being saved: the loops keep what they play (their passes and rolls too), the scenes their keys and band jobs', () => {
    const saved = sanitizeBoardSequencerConfig(JSON.parse(JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...demoMusic() })));
    expect(saved).not.toBeNull();
    const music = demoMusic();
    expect(saved?.loopSlots).toEqual(music.loopSlots);
    expect(saved?.scenes).toEqual(music.scenes);
    expect(saved?.pieces.find((p) => p.id === DEMO_PIECE_ID)?.scenes).toEqual(music.scenes);
    expect(saved?.performance).toEqual(DEMO_PERFORMANCE);
    expect(saved?.fillEngine).toBe('magenta');
    expect(saved?.aiEvolves).toBe(true);
    expect(saved?.playerTrack).toBe(DEMO_PLAYER_TRACK);
    expect(saved?.midiChannelMode).toBe('part');
    expect(saved?.surpriseMe).toBe(false);
    expect(saved?.noteLengthBeats).toBe(2);
    expect(saved?.scenes.some((s) => s.settings.bandJobs.pedal)).toBe(true);
  });

  it('three centres, one set of five notes: A major pentatonic, F sharp minor pentatonic, then B major pentatonic, at 87 BPM', () => {
    expect(A_MAJOR).toEqual({ rootMidi: 69, scaleName: 'Major pentatonic', semitones: [0, 2, 4, 7, 9] });
    expect(F_SHARP_MINOR).toEqual({ rootMidi: 66, scaleName: 'Minor pentatonic', semitones: [0, 3, 5, 7, 10] });
    expect(B_MAJOR).toEqual({ rootMidi: 71, scaleName: 'Major pentatonic', semitones: [0, 2, 4, 7, 9] });
    const music = demoMusic();
    expect(music.scaleRootMidi).toBe(69);
    expect(music.scaleName).toBe('Major pentatonic');
    expect(music.bpm).toBe(87);
    expect(demoScenes().map((s) => s.key?.rootMidi)).toEqual([69, 69, 69, 69, 69, 69, 69, 66, 66, 66, 66, 66, 69, 69, 71, 71]);
  });

  it('the form: sixteen scenes, four passes each, eight for the last two', () => {
    expect(DEMO_SCENES.map((s) => [s.name, s.pass])).toEqual([
      ['Drums', 0], ['Brass', 4], ['Brass bloom', 8], ['Guitar', 12], ['Guitar picking', 16], ['Winds', 20],
      ['Winds answer', 24], ['Shadow', 28], ['Heartbeat', 32], ['Hush', 36], ['Rebuild', 40], ['Climb', 44],
      ['Light breaks', 48], ['Gathering', 52], ['Summit', 56], ['Final ascent', 64],
    ]);
    const lengths = DEMO_SCENES.map((s, i) => (DEMO_SCENES[i + 1]?.pass ?? DEMO_END_PASS) - s.pass);
    expect(lengths).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 8, 8]);
    expect(demoScenes()).toHaveLength(16);
  });

  it('the ways in and the lead ins, as composed', () => {
    const scenes = demoScenes();
    expect(scenes.filter((s) => s.wayIn?.kind === 'fade').map((s) => s.name)).toEqual(['Brass', 'Guitar', 'Winds']);
    expect(scenes.filter((s) => s.leadIn).map((s) => [s.name, s.leadIn])).toEqual([
      ['Heartbeat', 'rising'], ['Rebuild', 'drumFill'], ['Light breaks', 'drumFill'], ['Summit', 'drumFill'],
    ]);
    expect(scenes.map((s) => s.settings.sceneEnergy)).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 4, 1, 3, 4, 4, 5, 5, 5]);
  });

  it('the chords: Glow, Lift and Float in the light, Tide and Rise in the shadow, Lift in B at the summit; moving in the climb', () => {
    const chords = demoScenes().map((s) => `${s.settings.chords.sequence}/${s.settings.chords.bars}`);
    expect(chords).toEqual([
      'glow/4', 'glow/4', 'glow/4', 'glow/4', 'lift/4', 'lift/4', 'float/4', 'tide/4', 'tide/4', 'tide/4',
      'rise/4', 'rise/2', 'glow/2', 'lift/2', 'lift/4', 'lift/2',
    ]);
  });

  it('the band: none in the opening; pads and the sub from the brass on; a held pedal until the Heartbeat; roots after', () => {
    const scenes = demoScenes();
    expect(scenes[0].settings.band).toBe('off');
    for (const s of scenes.slice(1)) expect(s.settings.bandJobs.pads, s.name).toBe(true);
    expect(scenes.map((s) => s.settings.bandJobs.pedal === true)).toEqual([
      false, true, true, true, true, true, true, true, false, false, false, false, false, false, false, false,
    ]);
    for (const s of scenes.slice(8)) if (s.name !== 'Hush') expect(s.settings.bandJobs.bass, s.name).toBe(true);
    expect(by('Hush')?.settings.bandJobs).toEqual({ asBefore: false, pads: true, bass: false, drums: false, counter: false });
  });

  it('lasts seven minutes and ends with the Big finish, by itself, starting right after the last scene’s eighth pass', () => {
    expect(DEMO_PERFORMANCE.lengthSec).toBe(7 * 60);
    expect(DEMO_PERFORMANCE.style).toBe('big');
    expect(DEMO_PERFORMANCE.fadePasses).toBe(2);
    expect(DEMO_PERFORMANCE.ending).toBe('auto');
    const lead = endingDurationSec(DEMO_PERFORMANCE, DEMO_PASS_SEC);
    const asked = DEMO_PERFORMANCE.lengthSec - lead;
    // Asked for during the pass before, so it begins on that pass: a multiple of four.
    expect(DEMO_END_PASS).toBe(72);
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

  it('plays the same each time: Magenta’s extra notes with fixed ideas, every scene its own, a new idea every four passes', () => {
    expect(demoMusic().fillEngine).toBe('magenta');
    expect(demoMusic().aiEvolves).toBe(true);
    const ideas = demoScenes().map((s) => s.ideas);
    expect(ideas.every((x) => typeof x === 'number' && x > 0)).toBe(true);
    expect(new Set(ideas).size).toBe(ideas.length);
  });

  it('Magenta: none in the opening, first answering the winds, more as it builds, the busiest from the Gathering', () => {
    const fill = demoScenes().map((s) => s.settings.fillAmount);
    expect(fill.slice(0, 6).every((f) => f === 0)).toBe(true);
    expect(by('Winds answer')!.settings.fillAmount).toBeGreaterThan(0);
    const busiest = Math.max(...fill);
    expect(by('Gathering')!.settings.fillAmount).toBe(busiest);
    expect(by('Climb')!.settings.fillAmount).toBeGreaterThan(by('Rebuild')!.settings.fillAmount);
  });
});

describe('Rising Light v2: the band in the owner’s order', () => {
  /** The voices each scene's loops bring: drums, then each instrument by its sound. */
  const voices = (s: { loops: number[] }): Set<string> =>
    new Set(s.loops.flatMap((l) => DEMO_LOOPS[l].cells).map((c) => (c.job === 'drums' ? 'drums' : c.sound ?? '')));

  it('drums alone first (no band, no other loop), then brass, then the guitar, then the winds', () => {
    const scenes = demoScenes();
    expect([...voices(scenes[0])]).toEqual(['drums']);
    const firstIn = (v: string) => scenes.findIndex((s) => voices(s).has(v));
    expect(firstIn('trombone')).toBe(1);
    expect(firstIn('guitarAcoustic')).toBe(3);
    expect(firstIn('clarinet')).toBe(5);
    // Each arrives without the next one yet.
    expect(voices(scenes[1]).has('guitarAcoustic') || voices(scenes[1]).has('clarinet')).toBe(false);
    expect(voices(scenes[3]).has('clarinet')).toBe(false);
  });

  it('the brass: open fifths held a whole pass, swelling, its third added on the later passes; on the bass track over the band’s sub', () => {
    const fifths = loopNamed('Brass fifths')!.cells;
    expect(fifths.map((c) => name(pitchOf(c, A_MAJOR)))).toEqual(['A', 'E']);
    const pad = loopNamed('Brass pad')!.cells;
    for (const c of [...fifths, ...pad]) {
      expect(c).toMatchObject({ job: 'bass', sound: 'trombone', overBass: true, holdBeats: 8, col: 0 });
      expect(c.velocity).toBeCloseTo(0.4, 2);
    }
    expect(onPass(pad, 0).map((c) => pitchOf(c, A_MAJOR))).toEqual([57, 64]);
    expect(onPass(pad, 2).map((c) => pitchOf(c, A_MAJOR))).toEqual([57, 64, 73]);
    expect(pad.find((c) => c.passes)?.passes).toEqual([2, 3]);
    // In the shadow, the same steps put the brass on F#.
    expect(name(pitchOf(pad[0], F_SHARP_MINOR))).toBe('F#');
  });

  it('the guitar: every chord rolled slowly, string by string (90 ms), never a strum; fuller from the second pass', () => {
    const roll = loopNamed('Guitar roll')!.cells;
    for (const c of roll) expect(c).toMatchObject({ job: 'chord', sound: 'guitarAcoustic', follows: true, roll: 0.09 });
    expect(onPass(roll, 0).map((c) => c.col)).toEqual([0]);
    for (const pass of [1, 2, 3]) expect(onPass(roll, pass).map((c) => c.col)).toEqual([0, 4]);
  });

  it('the guitar picking: every beat, rolled up on the strong beats and down between, the first loudest, never two alike in a row', () => {
    const pick = loopNamed('Guitar picking')!.cells;
    expect(onPass(pick, 1).map((c) => c.col)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const c of pick) expect(c.roll).toBe(c.col % 2 === 0 ? 0.09 : -0.07);
    const vel = pick.map((c) => c.velocity ?? 0);
    expect(vel[0]).toBe(0.5);
    for (const v of vel.slice(1)) {
      expect(v).toBeGreaterThanOrEqual(0.36);
      expect(v).toBeLessThanOrEqual(0.44);
    }
    for (let i = 1; i < vel.length; i++) expect(vel[i]).not.toBe(vel[i - 1]);
  });
});

describe('Rising Light v2: the theme grows over four passes', () => {
  const winds = () => loopNamed('Winds theme')!.cells;

  it('the 1st pass asks: C#, B, A, then up to E, in A major pentatonic', () => {
    expect(onPass(winds(), 0).map((c) => [c.col, name(pitchOf(c, A_MAJOR))])).toEqual([[0, 'C#'], [3, 'B'], [4, 'A'], [6, 'E']]);
    expect(onPass(winds(), 0).map((c) => pitchOf(c, A_MAJOR))).toEqual([73, 71, 69, 76]);
  });

  it('the 2nd answers (B, then F# above), the 3rd adds an E, the 4th the high A ringing over the turn', () => {
    const at = (pass: number) => onPass(winds(), pass).map((c) => `${c.col}:${name(pitchOf(c, A_MAJOR))}`).sort();
    expect(at(1)).toEqual(['0:C#', '3:B', '4:A', '5:B', '6:E', '7:F#']);
    expect(at(2)).toEqual(['0:C#', '2:E', '3:B', '4:A', '5:B', '6:E', '7:F#']);
    expect(at(3)).toEqual(['0:C#', '1:A', '2:E', '3:B', '4:A', '5:B', '6:E', '7:F#']);
    const high = winds().find((c) => c.passes?.length === 1 && c.passes[0] === 3)!;
    expect(pitchOf(high, A_MAJOR)).toBe(81);
    // It rings to the end of the pass and over into the next.
    expect((high.col + (high.holdBeats ?? 0))).toBeGreaterThanOrEqual(8);
  });

  it('the same steps sing B, A, F#, C# in the shadow (a third lower), and D#, C#, B, F# in B major (a tone higher)', () => {
    expect(onPass(winds(), 0).map((c) => name(pitchOf(c, F_SHARP_MINOR)))).toEqual(['B', 'A', 'F#', 'C#']);
    expect(onPass(winds(), 0).map((c) => name(pitchOf(c, B_MAJOR)))).toEqual(['D#', 'C#', 'B', 'F#']);
  });

  it('the winds high: the same theme an octave up; the bells as in version 1, for the Rebuild', () => {
    const high = loopNamed('Winds high')!.cells;
    expect(high.map((c) => pitchOf(c, A_MAJOR))).toEqual(winds().map((c) => pitchOf(c, A_MAJOR) + 12));
    expect(loopNamed('Bells')!.cells.map((c) => [name(pitchOf(c, F_SHARP_MINOR)), c.holdBeats])).toEqual([['C#', 4], ['A', 4]]);
    expect(loopNames(by('Rebuild')!)).toContain('Bells');
  });

  it('the theme’s journey: the winds from the Winds, alone with the pads in the Hush, the winds high in the climb and at the summit', () => {
    const melodyOf = (n: string): string[] => [...new Set(loopNames(by(n)!)
      .map((l) => loopNamed(l)!.cells[0]).filter((c) => c.job === 'melody').map((c) => `${c.sound}${c.octave ? `+${c.octave}` : ''}`))];
    expect(melodyOf('Winds')).toEqual(['clarinet']);
    expect(melodyOf('Shadow')).toEqual(['clarinet']);
    expect(loopNames(by('Hush')!)).toEqual(['Winds theme']);
    expect(melodyOf('Rebuild')).toEqual(['synth:bell+1']);
    expect(melodyOf('Climb')).toEqual(['clarinet+1']);
    expect(melodyOf('Summit')).toEqual(['clarinet+1']);
  });
});

describe('Rising Light v2: ambient first', () => {
  it('no written note on a strong beat rubs against the chord the pads hold, in any scene, on any pass of four, in all three keys', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? A_MAJOR;
      const cells = sc.loops.flatMap((i) => DEMO_LOOPS[i].cells)
        .filter((c) => (c.job === 'melody' || c.job === 'bass') && (c.timingBeats ?? 0) < 0.25);
      for (let pass = 0; pass < 8; pass++) {
        for (let col = 0; col < 8; col += 2) {
          const h = sequenceAt({
            setting: sc.settings.chords, style: 'warm', rootMidi: key.rootMidi, semitones: key.semitones,
            beatsIn: pass * 8 + col, step: col, loop: 8, bandOn: true,
          }).harmony;
          if (!h) continue;
          for (const c of onPass(cells, pass % 4).filter((x) => x.col === col)) {
            const midi = pitchOf(c, key);
            expect(rubs(midi, h), `${sc.name}, pass ${pass + 1}, beat ${col + 1}: ${c.sound} ${midi} over ${h.symbol}`).toBe(false);
          }
        }
      }
    }
  });

  it('every scene is in a pentatonic key', () => {
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

  it('the opening heartbeat grows: the kicks alone, the shaker from the 2nd pass, the rim from the 3rd', () => {
    const at = (pass: number, piece: string) => onPass(loopNamed('Percussion heartbeat')!.cells, pass).filter((c) => c.sound === piece)
      .map((c) => c.col + (c.timingBeats ?? 0)).sort((a, b) => a - b);
    expect(at(0, 'kick')).toEqual([0, 1.5, 4, 5.5]);
    expect(at(0, 'hat')).toEqual([]);
    expect(at(0, 'rim')).toEqual([]);
    expect(at(1, 'hat')).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    expect(at(1, 'rim')).toEqual([]);
    expect(at(2, 'rim')).toEqual([2, 6]);
  });

  it('the summit swells a cymbal on the first beat every other pass; the build rolls its toms every other pass', () => {
    const crash = loopNamed('Percussion summit')!.cells.filter((c) => c.sound === 'crash');
    expect(crash.every((c) => c.col === 0 && c.passes?.join() === '0,2')).toBe(true);
    const toms = loopNamed('Percussion build')!.cells.filter((c) => c.sound === 'tom');
    expect(toms).toHaveLength(2);
    expect(toms.every((c) => c.col === 7 && c.passes?.join() === '1,3')).toBe(true);
  });

  it('every loop of more than one note grows over its four passes or is held', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells.length > 1)) {
      expect(l.cells.some((c) => c.passes) || l.cells.every((c) => (c.holdBeats ?? 0) >= 4), l.name).toBe(true);
    }
  });

  it('the chord parts play the chord the pads hold: they never name one', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells[0].job === 'chord')) for (const c of l.cells) expect(c.follows, l.name).toBe(true);
  });

  it('the pads lead: wide, joining the loops, in a large shared room', () => {
    const music = demoMusic();
    expect(music.widePads).toBe(true);
    expect(music.bandWithLoops).toBe(true);
    expect(music.space ?? 0).toBeGreaterThan(0.6);
  });

  it('every melodic part sits a touch behind the beat, never by more than 30 ms (between-the-beats notes aside)', () => {
    const msPerBeat = 60000 / DEMO_BPM;
    const late = DEMO_LOOPS.flatMap((l) => l.cells).filter((c) => c.timingBeats !== undefined && c.timingBeats < 0.25);
    expect(late.length).toBeGreaterThan(10);
    for (const c of late) expect((c.timingBeats ?? 0) * msPerBeat).toBeLessThanOrEqual(30);
  });
});

describe('Rising Light v2: Tim’s glow', () => {
  it('a counter placed anywhere on the board, in any scene, is a note of that scene’s pentatonic scale', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? A_MAJOR;
      const scale = new Set(key.semitones.map((st) => (key.rootMidi + st) % 12));
      for (let row = 0; row < 8; row++) {
        const midi = degreeMidi(7 - row, key.rootMidi, key.semitones);
        expect(scale.has(((midi % 12) + 12) % 12), `${sc.name}, row ${row}`).toBe(true);
      }
    }
    // Played as written: never nudged out of the scale.
    expect(demoMusic().clashNudge).toBe(false);
  });

  it('his counters all play on his own track, 14, one per part; long notes', () => {
    expect(DEMO_PLAYER_TRACK).toBe(14);
    expect(demoMusic().playerTrack).toBe(14);
    expect(demoMusic().midiChannelMode).toBe('part');
    expect(demoMusic().noteLengthBeats).toBe(2);
  });

  it('his colours all become the soft pad in the demo, one note each; a bass or drums colour a melody pad, in the glow’s register', () => {
    const voices = demoColourVoices({
      a: { role: 'melody', instrument: 'harp', plays: 'tune' as const }, b: { role: 'melody' }, c: { role: 'chord', instrument: 'guitarAcoustic' },
      d: { role: 'bass', instrument: 'tuba' }, e: { role: 'drums' }, f: { role: 'tempo' },
    });
    const pad = { instrument: 'synth:pad', plays: 'note', reverbSend: 0.5 };
    expect(voices.a).toEqual({ role: 'melody', ...pad });
    expect(voices.b).toEqual({ role: 'melody', ...pad });
    expect(voices.c).toEqual({ role: 'chord', ...pad });
    expect(voices.d).toEqual({ role: 'melody', ...pad });
    expect(voices.e).toEqual({ role: 'melody', ...pad });
    expect(voices.f).toEqual({ role: 'tempo' });
  });
});

describe('Rising Light v2: never boring, and one sound per Ableton track', () => {
  it('no pop sequence: every scene’s chords are Still, Glow, Lift, Float, Tide or Rise', () => {
    for (const sc of demoScenes()) expect(['still', 'glow', 'lift', 'float', 'tide', 'rise'], sc.name).toContain(sc.settings.chords.sequence);
  });

  it('every scene differs from the one before in its loops, its chords or its key', () => {
    const scenes = demoScenes();
    for (let i = 1; i < scenes.length; i++) {
      const sig = (k: number) => JSON.stringify([scenes[k].loops, scenes[k].settings.chords, scenes[k].key]);
      expect(sig(i), scenes[i].name).not.toBe(sig(i - 1));
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

  it('no more than sixteen loops; the piano, the lead, the pulse and the swells are retired from the demo', () => {
    expect(DEMO_LOOPS.length).toBeLessThanOrEqual(16);
    const sounds = new Set(DEMO_LOOPS.flatMap((l) => l.cells.map((c) => c.sound)));
    for (const old of ['piano', 'synth:keys', 'synth:pluck', 'synth:pad', 'synth:supersaw']) expect(sounds.has(old), old).toBe(false);
  });
});
