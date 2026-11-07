import { describe, it, expect } from 'vitest';
import {
  A_MAJOR, B_MAJOR, DEMO_BPM, DEMO_END_PASS, DEMO_LOOPS, DEMO_PASS_SEC, DEMO_PERFORMANCE, DEMO_PIECE_ID, DEMO_PLAYER_TRACK, DEMO_SCENES,
  F_SHARP_MAJOR, F_SHARP_MINOR, demoColourVoices, demoDueAt, demoMusic, demoScenes,
} from '../songs/demo/demoPiece';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, type StoredLoopCell } from '../profiles/BoardSequencerConfig';
import { clashes, sequenceAt } from '../songs/harmony/currentChord';
import { degreeMidi } from '../songs/boardSequencerScale';
import { endingDurationSec } from '../songs/performance/clock';
import { openingScene, sceneAt } from '../songs/performance/piece';
import { LAUNCH_SLOTS, type SceneKey } from '../songs/performance/launcher';

/**
 * The demo piece, "Rising Light" version 3 (docs/superpowers/specs/2026-11-06-demo-composition-v3-design.md,
 * built on versions 1 and 2): grooves, intrigue and a goal. Dreamy at the start and in the
 * breakdown; upbeat, dramatic and exciting with drums in between; the same every time.
 */

/**
 * A note rubs against a chord when it is a semitone from one of its notes (the clash nudge's
 * rule), except the colours of this music high above the chord: its major seventh and its
 * ninth. Low down, in the bass, they still rub.
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
const by = (n: string) => demoScenes().find((s) => s.name === n)!;
/** Where a hit is, in beats from the start of the pass. */
const at = (c: StoredLoopCell): number => c.col + (c.timingBeats ?? 0);
const hits = (loop: string, piece: string, pass = 0): number[] =>
  onPass(loopNamed(loop)!.cells, pass).filter((c) => c.sound === piece).map(at).sort((a, b) => a - b);
/** The drums' feel of a scene: its main percussion loop. */
const FEELS = ['Tribal', 'Groove', 'Half time', 'Double time', 'Rebuild'];
const feelOf = (s: { loops: number[] }): string | undefined => loopNames(s).find((n) => FEELS.includes(n));
const DREAMY = ['Drums', 'Brass', 'Guitar', 'Breakdown'];

describe('Rising Light v3: the piece', () => {
  it('is the same every time it is made', () => {
    expect(demoMusic()).toEqual(demoMusic());
  });

  it('survives being saved: the loops, the scenes, their keys, band jobs (the drive too) and lead ins', () => {
    const saved = sanitizeBoardSequencerConfig(JSON.parse(JSON.stringify({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...demoMusic() })));
    const music = demoMusic();
    expect(saved?.loopSlots).toEqual(music.loopSlots);
    expect(saved?.scenes).toEqual(music.scenes);
    expect(saved?.pieces.find((p) => p.id === DEMO_PIECE_ID)?.scenes).toEqual(music.scenes);
    expect(saved?.performance).toEqual(DEMO_PERFORMANCE);
    expect(saved?.playerTrack).toBe(DEMO_PLAYER_TRACK);
    expect(saved?.aiEvolves).toBe(true);
    expect(saved?.scenes.some((s) => s.settings.bandJobs.drive)).toBe(true);
    expect(saved?.scenes.filter((s) => s.leadIn === 'stop')).toHaveLength(3);
  });

  it('four keys: A major, F sharp minor, F sharp major (the fifth of B) for the Tension, B major; all pentatonic, at 87 BPM', () => {
    expect(F_SHARP_MAJOR).toEqual({ rootMidi: 66, scaleName: 'Major pentatonic', semitones: [0, 2, 4, 7, 9] });
    expect(demoMusic().bpm).toBe(87);
    expect(demoScenes().map((s) => `${s.name}:${s.key?.rootMidi}:${s.key?.scaleName.startsWith('Major') ? 'M' : 'm'}`)).toEqual([
      'Drums:69:M', 'Brass:69:M', 'Guitar:69:M', 'Groove:69:M', 'Winds hook:69:M', 'Intrigue:66:m', 'Drop:66:m',
      'Breakdown:66:m', 'Rebuild:66:m', 'Groove II:69:M', 'Tension:66:M', 'Summit:71:M', 'Final ascent:71:M',
    ]);
    for (const s of demoScenes()) expect(s.key?.semitones.length, s.name).toBe(5);
  });

  it('the form: thirteen scenes on multiples of four passes, then the Big finish at pass 72', () => {
    expect(DEMO_SCENES.map((s) => [s.name, s.pass])).toEqual([
      ['Drums', 0], ['Brass', 4], ['Guitar', 8], ['Groove', 12], ['Winds hook', 20], ['Intrigue', 24], ['Drop', 32],
      ['Breakdown', 36], ['Rebuild', 40], ['Groove II', 44], ['Tension', 52], ['Summit', 56], ['Final ascent', 64],
    ]);
    for (const s of DEMO_SCENES) expect(s.pass % 4).toBe(0);
    expect(DEMO_END_PASS).toBe(72);
    expect(DEMO_PERFORMANCE.style).toBe('big');
    const asked = DEMO_PERFORMANCE.lengthSec - endingDurationSec(DEMO_PERFORMANCE, DEMO_PASS_SEC);
    expect(asked).toBeGreaterThan((DEMO_END_PASS - 1) * DEMO_PASS_SEC);
    expect(asked).toBeLessThanOrEqual(DEMO_END_PASS * DEMO_PASS_SEC);
  });

  it('the chords and Energy as composed', () => {
    expect(demoScenes().map((s) => `${s.settings.chords.sequence}/${s.settings.chords.bars}`)).toEqual([
      'glow/4', 'glow/4', 'glow/4', 'lift/2', 'lift/2', 'tide/4', 'rise/2', 'tide/4', 'rise/4', 'glow/2', 'still/4', 'lift/2', 'glow/2',
    ]);
    expect(demoScenes().map((s) => s.settings.sceneEnergy)).toEqual([2, 2, 3, 4, 4, 3, 5, 1, 3, 4, 4, 5, 5]);
  });

  it('Stop into the Intrigue, Groove II and the Summit; a drum fill into the first groove, notes rising as the drums return', () => {
    expect(demoScenes().filter((s) => s.leadIn).map((s) => [s.name, s.leadIn])).toEqual([
      ['Groove', 'drumFill'], ['Intrigue', 'stop'], ['Rebuild', 'rising'], ['Groove II', 'stop'], ['Summit', 'stop'],
    ]);
  });

  it('the band: none in the opening scene; pads after; a pedal in the opening, the Intrigue and the Tension; the drive in the grooves, the drop and the summit', () => {
    const scenes = demoScenes();
    expect(scenes[0].settings.band).toBe('off');
    for (const s of scenes.slice(1)) expect(s.settings.bandJobs.pads, s.name).toBe(true);
    expect(scenes.filter((s) => s.settings.bandJobs.pedal).map((s) => s.name)).toEqual(['Brass', 'Guitar', 'Intrigue', 'Tension']);
    expect(scenes.filter((s) => s.settings.bandJobs.drive).map((s) => s.name)).toEqual(['Groove', 'Winds hook', 'Drop', 'Groove II', 'Summit', 'Final ascent']);
    expect(by('Breakdown').settings.bandJobs).toEqual({ asBefore: false, pads: true, bass: false, drums: false, counter: false });
  });

  it('every change lands on its pass, due a second before; the scene on is the plan’s at every moment', () => {
    const scenes = demoScenes();
    for (const [i, s] of scenes.entries()) expect(s.at).toBe(demoDueAt(DEMO_SCENES[i].pass));
    expect(openingScene(scenes, 0)).toBe(0);
    for (const [i, s] of DEMO_SCENES.entries()) expect(sceneAt(scenes, s.pass * DEMO_PASS_SEC + 0.5)).toBe(i);
  });

  it('Magenta: a new idea every four passes, every scene its own; none at first, busiest in the drop and the final ascent', () => {
    expect(demoMusic().aiEvolves).toBe(true);
    const ideas = demoScenes().map((s) => s.ideas);
    expect(new Set(ideas).size).toBe(ideas.length);
    const fill = demoScenes().map((s) => s.settings.fillAmount);
    expect(fill.slice(0, 4).every((f) => f === 0)).toBe(true);
    expect(by('Winds hook').settings.fillAmount).toBeGreaterThan(0);
    expect(by('Drop').settings.fillAmount).toBe(Math.max(...fill));
    expect(by('Final ascent').settings.fillAmount).toBe(Math.max(...fill));
  });

  it('no more loops than a piece holds', () => {
    expect(DEMO_LOOPS.length).toBeLessThanOrEqual(LAUNCH_SLOTS);
  });
});

describe('Rising Light v3: direction and drums', () => {
  it('the drums alone first, then the brass, then the guitar, then the grooves', () => {
    const scenes = demoScenes();
    expect(loopNames(scenes[0])).toEqual(['Tribal']);
    const firstIn = (sound: string) => scenes.findIndex((s) => s.loops.some((l) => DEMO_LOOPS[l].cells.some((c) => c.sound === sound)));
    expect(firstIn('trombone')).toBe(1);
    expect(firstIn('guitarAcoustic')).toBe(2);
    expect(scenes.findIndex((s) => feelOf(s) === 'Groove')).toBe(3);
  });

  it('the drums’ feel changes at least five times: tribal, groove, half time, double time, none at all in the breakdown, the rebuild', () => {
    const feels = demoScenes().map(feelOf);
    expect(feels).toEqual(['Tribal', 'Tribal', 'Tribal', 'Groove', 'Groove', 'Half time', 'Double time', undefined, 'Rebuild', 'Groove', 'Half time', 'Double time', 'Double time']);
    let changes = 0;
    for (let i = 1; i < feels.length; i++) if (feels[i] !== feels[i - 1]) changes++;
    expect(changes).toBeGreaterThanOrEqual(5);
    for (const f of ['Tribal', 'Groove', 'Half time', 'Double time', 'Rebuild']) expect(feels).toContain(f);
    // The breakdown (version 4): no drums at all after the drop, the harp alone over the pads.
    expect(by('Breakdown').loops.some((l) => DEMO_LOOPS[l].cells.some((c) => c.job === 'drums'))).toBe(false);
  });

  it('version 4: the later two thirds never repeat an earlier scene’s loops; new tunes for the breakdown and the summit', () => {
    const scenes = demoScenes();
    const sig = (sc: { loops: number[] }) => [...sc.loops].sort((a, b) => a - b).join(',');
    for (let i = 5; i < scenes.length; i++) {
      for (let j = 0; j < i; j++) expect(sig(scenes[i]), `${scenes[i].name} repeats ${scenes[j].name}`).not.toBe(sig(scenes[j]));
    }
    expect(loopNames(by('Breakdown'))).toEqual(['Harp song']);
    for (const s of ['Rebuild', 'Groove II']) expect(loopNames(by(s)), s).toContain('Harp song');
    for (const s of ['Summit', 'Final ascent']) expect(loopNames(by(s)), s).toContain('Brass call');
    // The theme comes back high only at the very end, over the brass call.
    expect(loopNames(by('Summit'))).not.toContain('Winds high');
    expect(loopNames(by('Final ascent'))).toEqual(expect.arrayContaining(['Winds high', 'Brass call', 'Snare roll fast']));
  });

  it('every scene differs from the one before in its loops, its chords or its key', () => {
    const scenes = demoScenes();
    for (let i = 1; i < scenes.length; i++) {
      const sig = (k: number) => JSON.stringify([scenes[k].loops, scenes[k].settings.chords, scenes[k].key]);
      expect(sig(i), scenes[i].name).not.toBe(sig(i - 1));
    }
  });

  it('tribal: kick on 1 of each bar, toms answering, a rim, the shaker from the 2nd pass', () => {
    expect(hits('Tribal', 'kick')).toEqual([0, 4]);
    expect(hits('Tribal', 'tom')).toEqual([1.5, 2.75, 3.5, 5.5, 6.75, 7.5]);
    expect(hits('Tribal', 'rim')).toEqual([3, 7]);
    expect(hits('Tribal', 'hat', 0)).toEqual([]);
    expect(hits('Tribal', 'hat', 1)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]);
  });

  it('groove: the kick’s pattern, the backbeat, hats on the eighths, ghosts on the 2nd and 4th passes, the clap from the 3rd, a crash to open', () => {
    expect(hits('Groove', 'kick')).toEqual([0, 1.5, 2.75, 4, 5.5, 6.5]);
    expect(hits('Groove', 'snare')).toEqual([1, 3, 5, 7]);
    expect(hits('Groove', 'hat', 0).filter((p) => p % 0.5 === 0)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]);
    expect(hits('Groove', 'hat', 0).length).toBe(16);
    expect(hits('Groove', 'hat', 1).length).toBeGreaterThan(16);
    expect(hits('Groove', 'clap', 1)).toEqual([]);
    expect(hits('Groove', 'clap', 2).length).toBeGreaterThan(0);
    expect(hits('Groove', 'crash', 0)).toEqual([0]);
    expect(hits('Groove', 'crash', 1)).toEqual([]);
  });

  it('half time: kick on 1 and the and of 4, snare on 3, toms in threes against the fours (3 + 3 + 2), hats on the beats', () => {
    expect(hits('Half time', 'kick')).toEqual([0, 3.5]);
    expect(hits('Half time', 'snare')).toEqual([2, 6]);
    expect(hits('Half time', 'tom')).toEqual([0, 1.5, 3, 4, 5.5, 7]);
    expect(hits('Half time', 'hat')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('double time: the busy kick, the snare on every beat with ghosts, hats on every sixteenth, a crash on the 1st and 3rd passes', () => {
    expect(hits('Double time', 'kick')).toEqual([0, 0.75, 2, 2.5, 4, 4.75, 6, 6.5]);
    expect(hits('Double time', 'snare')).toEqual([1, 2.75, 3, 5, 6.75, 7]);
    expect(hits('Double time', 'hat')).toHaveLength(32);
    expect(hits('Double time', 'crash', 0)).toEqual([0]);
    expect(hits('Double time', 'crash', 1)).toEqual([]);
    expect(hits('Double time', 'crash', 2)).toEqual([0]);
  });

  it('the tom run down over the last two beats of every 4th pass; the rebuild returns piece by piece', () => {
    expect(hits('Tom run', 'tom', 0)).toEqual([]);
    expect(hits('Tom run', 'tom', 3)).toEqual([6, 6.25, 6.5, 6.75, 7, 7.25, 7.5, 7.75]);
    expect(hits('Rebuild', 'kick', 0).length).toBeGreaterThan(0);
    expect(hits('Rebuild', 'hat', 0)).toEqual([]);
    expect(hits('Rebuild', 'hat', 1).length).toBeGreaterThan(0);
    expect(hits('Rebuild', 'snare', 1)).toEqual([]);
    expect(hits('Rebuild', 'snare', 2).length).toBeGreaterThan(0);
  });

  it('the snare roll: silent for two passes, then eighths into sixteenths, then sixteenths all through, louder', () => {
    const passLoud = (pass: number) => Math.max(...onPass(loopNamed('Snare roll fast')!.cells, pass).filter((c) => c.sound === 'snare').map((c) => c.velocity ?? 0));
    expect(hits('Snare roll fast', 'snare', 0)).toEqual([]);
    expect(hits('Snare roll fast', 'snare', 1)).toEqual([]);
    expect(hits('Snare roll fast', 'snare', 2)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5, 5.75, 6, 6.25, 6.5, 6.75, 7, 7.25, 7.5, 7.75]);
    expect(hits('Snare roll fast', 'snare', 3)).toHaveLength(32);
    expect([passLoud(2), passLoud(3)]).toEqual([0.5, 0.65]);
    expect(loopNamed('Snare roll')).toBeUndefined();
  });

  it('the percussion is one kit piece per counter, each a note, its squares distinct', () => {
    for (const l of DEMO_LOOPS.filter((x) => x.cells[0].job === 'drums')) {
      const squares = new Set<string>();
      for (const c of l.cells) {
        expect(c.plays, l.name).toBe('note');
        expect(['kick', 'rim', 'snare', 'hat', 'tom', 'crash', 'clap']).toContain(c.sound);
        expect(c.colour).toBe(`loop:drums:${c.sound}`);
        squares.add(`${c.col}:${c.row}`);
      }
      expect(squares.size, l.name).toBe(l.cells.length);
    }
  });
});

describe('Rising Light v3: the pitched parts', () => {
  it('the brass: held fifths in the opening (the pedal F# in the Intrigue and the Tension), a swell on each bar in the grooves', () => {
    const fifths = loopNamed('Brass fifths')!.cells;
    expect(fifths.map((c) => name(pitchOf(c, A_MAJOR)))).toEqual(['A', 'E']);
    expect(fifths.map((c) => name(pitchOf(c, F_SHARP_MINOR)))).toEqual(['F#', 'C#']);
    expect(fifths.map((c) => name(pitchOf(c, F_SHARP_MAJOR)))).toEqual(['F#', 'C#']);
    for (const c of fifths) expect(c).toMatchObject({ job: 'bass', sound: 'trombone', overBass: true, holdBeats: 8, col: 0 });
    const swells = loopNamed('Brass swells')!.cells;
    expect(swells.map((c) => [c.col, c.holdBeats])).toEqual([[0, 4], [0, 4], [4, 4], [4, 4]]);
    for (const s of ['Intrigue', 'Tension']) expect(loopNames(by(s)), s).toContain('Brass fifths');
  });

  it('the guitar: rolled on every eighth in the grooves (two counters a step, up then down), the slow roll elsewhere', () => {
    const eighths = loopNamed('Guitar eighths')!.cells;
    expect(eighths.map(at)).toEqual(Array.from({ length: 16 }, (_, i) => i / 2));
    for (const c of eighths) {
      expect(c).toMatchObject({ job: 'chord', sound: 'guitarAcoustic', follows: true });
      expect(c.roll).toBe(c.timingBeats ? -0.07 : 0.09);
    }
    for (const s of ['Groove', 'Winds hook', 'Drop', 'Groove II', 'Summit', 'Final ascent']) expect(loopNames(by(s)), s).toContain('Guitar eighths');
    for (const s of ['Guitar', 'Rebuild', 'Tension']) expect(loopNames(by(s)), s).toContain('Guitar roll');
  });

  it('the winds: the theme as in version 2, growing over four passes; an octave up in the drop and the final ascent', () => {
    const winds = loopNamed('Winds theme')!.cells;
    expect(onPass(winds, 0).map((c) => name(pitchOf(c, A_MAJOR)))).toEqual(['C#', 'B', 'A', 'E']);
    expect(onPass(winds, 3).length).toBe(8);
    for (const s of ['Drop', 'Final ascent']) expect(loopNames(by(s)), s).toContain('Winds high');
    for (const s of ['Winds hook']) expect(loopNames(by(s)), s).toContain('Winds theme');
  });

  it('the harp song (version 4): rising A, C#, E to F#, growing over four passes; the brass call: A, E, the A above', () => {
    const harp = loopNamed('Harp song')!.cells;
    for (const c of harp) expect(c).toMatchObject({ job: 'melody', sound: 'harp' });
    expect(onPass(harp, 0).map((c) => name(pitchOf(c, A_MAJOR)))).toEqual(['A', 'C#', 'E', 'F#']);
    expect(onPass(harp, 0).map((c) => name(pitchOf(c, F_SHARP_MINOR)))).toEqual(['F#', 'B', 'C#', 'E']);
    expect(onPass(harp, 3).length).toBeGreaterThan(onPass(harp, 0).length);
    const call = loopNamed('Brass call')!.cells;
    for (const c of call) expect(c).toMatchObject({ job: 'bass', sound: 'trombone', overBass: true, octave: 1 });
    expect(onPass(call, 0).map((c) => name(pitchOf(c, B_MAJOR)))).toEqual(['B', 'F#', 'B']);
    expect(onPass(call, 3).length).toBeGreaterThan(onPass(call, 0).length);
  });

  it('the bells in threes in the Intrigue: C#, B, A on every third eighth, against the fours', () => {
    const bells = loopNamed('Bells in threes')!.cells;
    expect(bells.map(at)).toEqual([0, 1.5, 3, 4.5, 6, 7.5]);
    expect(bells.map((c) => name(pitchOf(c, F_SHARP_MINOR)))).toEqual(['C#', 'B', 'A', 'C#', 'B', 'A']);
    for (const s of ['Intrigue', 'Tension', 'Summit']) expect(loopNames(by(s)), s).toContain('Bells in threes');
  });

  it('no written note on a strong beat rubs against the chord the pads hold, in any scene, on any pass of four, in all four keys', () => {
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

  it('each scene has one melody instrument, one Bass track sound and one Chords track sound', () => {
    for (const s of demoScenes()) {
      for (const job of ['melody', 'bass', 'chord'] as const) {
        const sounds = new Set(s.loops.flatMap((l) => DEMO_LOOPS[l].cells).filter((c) => c.job === job).map((c) => c.sound));
        expect(sounds.size, `${s.name}: ${job}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Rising Light v3: ambient where it is dreamy, exciting where it drives', () => {
  it('in the dreamy scenes nothing above 0.6; elsewhere percussion up to 0.7, crashes 0.6; the tunes never above 0.6', () => {
    for (const s of demoScenes()) {
      const cells = s.loops.flatMap((l) => DEMO_LOOPS[l].cells);
      const limit = DREAMY.includes(s.name) ? 0.6 : 0.7;
      for (const c of cells) {
        const max = c.job === 'drums' ? (c.sound === 'crash' ? 0.6 : limit) : 0.6;
        expect(c.velocity ?? 1, `${s.name}: ${c.sound}`).toBeLessThanOrEqual(max);
      }
    }
    for (const c of loopNamed('Tribal')!.cells.filter((x) => x.sound !== 'hat')) {
      expect(c.velocity ?? 0).toBeGreaterThanOrEqual(0.3);
      expect(c.velocity ?? 1).toBeLessThanOrEqual(0.45);
    }
  });

  it('the pads lead in a large shared room; Tim’s counters on his own track, as one soft pad', () => {
    const music = demoMusic();
    expect(music.widePads).toBe(true);
    expect(music.bandWithLoops).toBe(true);
    expect(music.space ?? 0).toBeGreaterThan(0.6);
    expect(music.playerTrack).toBe(14);
    expect(music.midiChannelMode).toBe('part');
    expect(music.clashNudge).toBe(false);
    expect(demoColourVoices({ a: { role: 'drums' }, b: { role: 'chord' } })).toEqual({
      a: { role: 'melody', instrument: 'synth:pad', plays: 'note', reverbSend: 0.5 },
      b: { role: 'chord', instrument: 'synth:pad', plays: 'note', reverbSend: 0.5 },
    });
  });

  it('a counter placed anywhere on the board, in any scene, is a note of that scene’s scale', () => {
    for (const sc of demoScenes()) {
      const key = sc.key ?? A_MAJOR;
      const scale = new Set(key.semitones.map((st) => (key.rootMidi + st) % 12));
      for (let row = 0; row < 8; row++) expect(scale.has(degreeMidi(7 - row, key.rootMidi, key.semitones) % 12), `${sc.name}, row ${row}`).toBe(true);
    }
  });

  it('the melodic parts sit a touch behind the beat, never by more than 30 ms', () => {
    const msPerBeat = 60000 / DEMO_BPM;
    for (const c of DEMO_LOOPS.flatMap((l) => l.cells).filter((x) => x.job === 'melody' && x.timingBeats !== undefined && x.timingBeats < 0.25)) {
      expect((c.timingBeats ?? 0) * msPerBeat).toBeLessThanOrEqual(30);
    }
  });

  it('B major is the summit’s key', () => {
    expect(by('Summit').key).toEqual(B_MAJOR);
  });
});
