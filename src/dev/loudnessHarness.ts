/**
 * Loudness, measured offline (tests only: loaded by e2e/harness/loudness.html for
 * e2e/loudness.e2e.ts, never by the app). The board sequencer's
 * own engine plays a fixed test board into an OfflineAudioContext, beat by beat, exactly
 * as it would live, and two points are recorded:
 *  - the mix (what feeds the master chain and the classic limiter), for how loud it is:
 *    K-weighted loudness as in ITU-R BS.1770 (LUFS, ungated), over the passes the band
 *    plays in, and its sample peak;
 *  - the studio limiter's input (after the master chain's EQ, glue compressor and
 *    saturation), for how close the sound comes to the limiter: its sample peak.
 * Rendering offline makes it exact and repeatable, whatever else the machine is doing.
 */

import * as Tone from 'tone';
import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import { getEffectChainManager } from '../effects';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import { DEFAULT_JOBS, type BandJobs } from '../songs/band/bandJobs';
import type { LoudnessRequest, LoudnessResult } from './loudnessTypes';

export type { LoudnessRequest, LoudnessResult };

const SAMPLE_RATE = 48000;
const BPM = 90;
const COLS = 8;
const ROWS = 8;

/** A new player's four laptop colours: melody, bass and chords play tunes (stage 3), drums one note. */
const CHANNELS: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#d93a3a', plays: 'tune' },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#2f6fd6', plays: 'tune' },
  { id: 'c', kind: 'hue', role: 'chord', swatch: '#e8c21e', plays: 'tune' },
  { id: 'd', kind: 'hue', role: 'drums', swatch: '#2f9a52' },
];

/** The fixed test board: every part playing, as in a full scene. Row 0 is the top. */
const BOARD: ActiveCell[] = [
  { row: 3, col: 0, colour: 'm' }, { row: 1, col: 2, colour: 'm' }, { row: 2, col: 4, colour: 'm' }, { row: 4, col: 6, colour: 'm' },
  { row: 7, col: 0, colour: 'b' }, { row: 5, col: 4, colour: 'b' },
  { row: 4, col: 0, colour: 'c' }, { row: 2, col: 4, colour: 'c' },
  { row: 7, col: 0, colour: 'd' }, { row: 6, col: 2, colour: 'd' }, { row: 7, col: 4, colour: 'd' }, { row: 6, col: 6, colour: 'd' },
];

const ALL_JOBS: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: true };

/** The engine's insides the measurement needs. */
interface EngineInsides {
  mixTone: BiquadFilterNode | null;
  masterChain: { toneNodes: { connect(n: AudioNode): void; disconnect(): void }[] } | null;
  voiceByChannel: Map<string, { voice: { player?: { isReady(): boolean } | null } }>;
  bandVoices: Record<string, unknown> | null;
  drumKit: { isReady(): boolean } | null;
  fireStep(beat: number, time: number, secPerBeat: number, chord: null): void;
  drainFiredNotes(): { origin?: string }[];
}

/** Waits until every sampled sound has loaded (a synth layer alone is ready at once). */
async function samplesLoaded(e: EngineInsides): Promise<void> {
  const players = (): ({ isReady(): boolean } | null | undefined)[] => [
    ...[...e.voiceByChannel.values()].map((v) => v.voice.player),
    ...['pad', 'bass', 'lead'].map((k) => (e.bandVoices?.[k] as { player?: { isReady(): boolean } | null } | undefined)?.player),
  ];
  const end = performance.now() + 30_000;
  while (performance.now() < end) {
    if (players().every((p) => !p || p.isReady()) && (e.drumKit?.isReady() ?? true)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const waiting = [
    ...[...e.voiceByChannel.entries()].filter(([, v]) => v.voice.player && !v.voice.player.isReady()).map(([id]) => id),
    ...['pad', 'bass', 'lead'].filter((k) => { const p = (e.bandVoices?.[k] as { player?: { isReady(): boolean } | null } | undefined)?.player; return !!p && !p.isReady(); }),
    ...(e.drumKit && !e.drumKit.isReady() ? ['drums'] : []),
  ];
  throw new Error(`the samples did not load in 30 s: ${waiting.join(', ')}`);
}

/** K-weighting (BS.1770, 48 kHz): a high shelf, then a high-pass. */
function kWeighted(x: Float32Array): Float32Array {
  const stage = (inp: Float32Array, b: number[], a: number[]): Float32Array => {
    const out = new Float32Array(inp.length);
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    for (let i = 0; i < inp.length; i++) {
      const y = b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1; x1 = inp[i]; y2 = y1; y1 = y;
      out[i] = y;
    }
    return out;
  };
  const shelf = stage(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585]);
  return stage(shelf, [1, -2, 1], [-1.99004745483398, 0.99007225036621]);
}

const peakDb = (chs: Float32Array[]): number => {
  let p = 0;
  for (const c of chs) for (const v of c) p = Math.max(p, Math.abs(v));
  return 20 * Math.log10(Math.max(1e-9, p));
};

async function measure(req: LoudnessRequest): Promise<LoudnessResult> {
  // The shared effects bus belongs to one audio context: a fresh one for each render.
  getEffectChainManager().dispose();
  const spb = 60 / BPM;
  const beats = req.passes * COLS;
  const lead = 0.05;
  const seconds = lead + beats * spb + 1.5;
  let notes = 0;
  let bandNotes = 0;
  let extraNotes = 0;
  let mixToneHz = 0;
  const buffer = await Tone.Offline(async (ctx) => {
    const cfg: BoardEngineConfig = {
      bpm: BPM, rows: ROWS, cols: COLS, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
      noteLengthBeats: 0.9, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: CHANNELS,
      faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, studioMix: true,
      soundWorld: req.world, phrases: true, fillEngine: 'rules', band: req.band, chords: { sequence: 'world', bars: 2 },
      clashNudge: true, bandJobs: req.jobs === 'all' ? ALL_JOBS : { ...DEFAULT_JOBS }, keepOnTop: true, keepOnTopDb: 3,
      sceneEnergy: req.energy,
    };
    const engine = new BoardSequencerEngine(cfg);
    await engine.init();
    const e = engine as unknown as EngineInsides;
    await samplesLoaded(e);
    // Two taps, into a four-channel recording: the mix on 1–2, the limiter's input on 3–4.
    const raw = ctx.rawContext as OfflineAudioContext;
    const merger = raw.createChannelMerger(4);
    merger.connect(raw.destination);
    const tap = (node: AudioNode | { connect(n: AudioNode): void }, first: number): void => {
      const split = raw.createChannelSplitter(2);
      if (node instanceof AudioNode) node.connect(split);
      else Tone.connect(node as unknown as Tone.ToneAudioNode, split);
      split.connect(merger, 0, first);
      split.connect(merger, 1, first + 1);
    };
    const chain = e.masterChain?.toneNodes ?? [];
    if (!e.mixTone || chain.length < 4) throw new Error('the engine has no mix or master chain to measure');
    // Nothing goes to the speakers but the two taps.
    chain[3].disconnect();
    tap(e.mixTone, 0);
    tap(chain[2], 2);
    engine.setFill(req.fill, 1, null);
    engine.setEvolve({ amount: req.evolve, sceneLoops: 8, seed: 1, holdLap: null });
    engine.setActiveCells(BOARD);
    for (let b = 0; b < beats; b++) {
      // Sounds change may swap a part's instrument at the start of a pass: live, its samples
      // come from the cache long before its next note; here every beat is queued at once, so
      // wait for them as the live board would have.
      if (b % COLS === 1 && req.evolve > 0) await samplesLoaded(e);
      e.fireStep(b, lead + b * spb, spb, null);
      const fired = e.drainFiredNotes();
      notes += fired.length;
      bandNotes += fired.filter((n) => n.origin === 'band').length;
      extraNotes += fired.filter((n) => n.origin === 'fill').length;
    }
    mixToneHz = e.mixTone.frequency.value;
  }, seconds, 4, SAMPLE_RATE);
  const chs = [0, 1, 2, 3].map((i) => buffer.getChannelData(i));
  // Measured from the second pass (the band joins on the pass after the first counter).
  const from = Math.floor((lead + COLS * spb) * SAMPLE_RATE);
  const to = Math.floor((lead + beats * spb) * SAMPLE_RATE);
  const mix = [chs[0].subarray(from, to), chs[1].subarray(from, to)];
  let power = 0;
  for (const c of mix) {
    const k = kWeighted(c);
    let sum = 0;
    for (const v of k) sum += v * v;
    power += sum / k.length;
  }
  return {
    lufs: -0.691 + 10 * Math.log10(Math.max(1e-12, power)),
    peakDb: peakDb(mix),
    limiterInPeakDb: peakDb([chs[2].subarray(from, to), chs[3].subarray(from, to)]),
    notes,
    mixToneHz,
    bandNotes,
    extraNotes,
  };
}

(window as unknown as { __admiLoudness: { measure: typeof measure; ready: boolean } }).__admiLoudness = { measure, ready: true };
