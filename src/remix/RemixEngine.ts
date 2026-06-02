/**
 * RemixEngine — stem playback for the Remix screen.
 *
 * Per stem: Tone.Player → stemGain → stemFilter → masterGain.
 * Sources always run (looped); silence is gain 0, never stop, so all
 * stems stay sample-aligned for the whole session. Build-from-silence:
 * every stem starts inaudible. A RemixBaton writes filterNorm; the
 * engine renders state → audio each frame, smoothing so imprecise Y
 * never zippers and a re-focused stem glides instead of snapping.
 */

import * as Tone from 'tone';
import { MasterChain } from '../audio/MasterChain';
import { SpaceReverb } from '../audio/SpaceReverb';
import type { SongConfig } from '../songs/songLibrary';
import { loadStemBuffers } from './loadStemBuffers';
import { loadSongAnalysis } from '../songs/analysisLoader';
import { remixTaper } from './remixTaper';
import type { StemId, RemixBatonOutput } from './RemixBaton';
import { STEM_CYCLE_ORDER } from './RemixBaton';
import { computeLoopRegion, nudgeOrigin } from './loopRegion';
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';
import type { FaceLandmarks } from '../state/types';
import type { RemixLayer } from './layers/RemixLayer';
import { isSyncedLayer } from './layers/RemixLayer';
import { PercussionLayer } from './layers/PercussionLayer';
import { LoopLayer } from './layers/LoopLayer';
import { loadLoopManifest } from './layers/loadLoopManifest';
import type { RemixLoopBatonOutput } from './RemixLoopBaton';
import { RemixRecorder } from './recording/RemixRecorder';
import { RemixArranger } from './recording/RemixArranger';
import type { CaptureInput, RemixArrangement } from './recording/remixRecording';

export interface RemixStemState {
  filterNorm: number;
  targetFilterNorm: number;
  gain: number;
}

interface StemNodes {
  buffer: AudioBuffer;
  player: Tone.Player | null;
  gain: GainNode;
  filter: BiquadFilterNode;
}

const SMOOTH_TC = 0.05;          // filter/gain setTargetAtTime time-constant
const GLIDE_LERP = 0.12;         // per-frame glide toward target (~250ms)
const MASTER_GAIN = 0.9;         // master bus output level
const GLIDE_EXIT_EPSILON = 0.01; // distance below which glide is considered complete

/** Map a head-nod amplitude to a musical velocity (0.4 floor … 1). */
function clampVel(amp: number): number {
  return Math.max(0.4, Math.min(1, 0.4 + amp * 6));
}

export class RemixEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterChain: MasterChain | null = null;
  private spaceReverb: SpaceReverb | null = null;
  private nodes = new Map<StemId, StemNodes>();
  private states = new Map<StemId, RemixStemState>();
  private gliding = new Set<StemId>();
  private downbeats: number[] = [];
  private beats: number[] = [];
  private layersBus: GainNode | null = null;
  private layers = new Map<string, RemixLayer>();
  private playing = false;
  private recorder = new RemixRecorder();
  private arranger = new RemixArranger('');
  private songId = '';
  private recSectionOriginBar = 0;
  private recSectionLengthBars: 0 | 4 | 8 | 16 = 8;
  private lastTickSec = 0;
  private playingArrangement = false;
  private loopRegion: { startSec: number; endSec: number } | null = null;
  private loopLengthBars: 0 | 4 | 8 | 16 = 8;
  private loopOriginBar = 0;
  private duration = 0;
  private loadToken = 0;
  private focusedStem: StemId = STEM_CYCLE_ORDER[0];
  private headNodEnabled = false;
  private headNodDetector = new HeadBopDetector(0.025, 200);
  private readonly headNodLandmarkIndex = 1; // nose tip

  async loadSong(song: SongConfig): Promise<void> {
    this.dispose();
    const myToken = ++this.loadToken;
    await Tone.start();
    if (myToken !== this.loadToken) return;
    this.ctx = Tone.getContext().rawContext as AudioContext;

    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    // Shared studio chain: master → EQ/comp/sat/limiter → destination.
    this.masterChain = new MasterChain(this.ctx);
    this.master.connect(this.masterChain.input);
    // Parallel space reverb: tap the full mix, return wet into the master chain.
    this.spaceReverb = new SpaceReverb(this.ctx, this.masterChain.input);
    this.master.connect(this.spaceReverb.send);

    const buffers = await loadStemBuffers(this.ctx, song.stems);
    if (myToken !== this.loadToken) return;
    this.duration = Math.max(0, ...[...buffers.values()].map((b) => b.duration), 0);

    for (const stem of STEM_CYCLE_ORDER) {
      const buffer = buffers.get(stem);
      if (!buffer) continue;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 80;
      filter.Q.value = 0.7;
      gain.connect(filter);
      filter.connect(this.master);
      const player = new Tone.Player(buffer);
      player.loop = true;          // stems run continuously; silence is gain 0, never stop
      player.connect(gain);
      this.nodes.set(stem, {
        buffer,
        player,
        gain,
        filter,
      });
      this.states.set(stem, {
        filterNorm: 0,
        targetFilterNorm: 0,
        gain: 0,
      });
    }

    if (song.analysisUrl) {
      try {
        const a = await loadSongAnalysis(song.analysisUrl);
        if (myToken !== this.loadToken) return;
        this.downbeats = a.downbeats;
        this.beats = a.beats ?? [];
      } catch {
        this.downbeats = song.downbeats ?? [];
        this.beats = song.beats ?? [];
      }
    } else {
      this.downbeats = song.downbeats ?? [];
      this.beats = song.beats ?? [];
    }

    this.layersBus = this.ctx.createGain();
    this.layersBus.gain.value = 1;
    this.layersBus.connect(this.master);

    const percussion = new PercussionLayer(this.ctx, 'studio-kit');
    percussion.connect(this.layersBus);
    percussion.setBeatGrid(this.beats, this.downbeats);
    percussion.setEnabled(false); // opt-in
    this.layers.set(percussion.id, percussion);

    const loopDefs = await loadLoopManifest();
    if (myToken !== this.loadToken) return;
    if (loopDefs.length > 0) {
      const loop = new LoopLayer(this.ctx, loopDefs, song.bpm);
      loop.connect(this.layersBus);
      loop.setEnabled(false); // opt-in, brought in by the loop baton
      this.layers.set(loop.id, loop);
    }

    this.loopOriginBar = 0;
    this.loopLengthBars = this.downbeats.length >= 2 ? 8 : 0;
    this.applyLoop();

    Tone.getTransport().bpm.value = song.bpm;
    this.songId = song.id;
    this.arranger = new RemixArranger(song.id);
    this.recorder.disarm();
    this.playingArrangement = false; // a song change cancels any in-progress remix playback
  }

  play(): void {
    if (this.playing) return;
    const t = Tone.getTransport();
    const resuming = t.state === 'paused';
    if (!resuming) {
      // Fresh start: (re-)align each player to transport time 0.
      // unsync() first so a prior sync's scheduled events are cleared
      // (idempotent — avoids duplicate start events across play cycles).
      for (const n of this.nodes.values()) {
        n.player?.unsync().sync().start(0);
      }
      // Synced layers (e.g. loops) align the same way as stems, and only
      // on a fresh start — pause/resume resumes the transport without
      // re-syncing, so the loops stay phase-locked and keep running.
      for (const l of this.layers.values()) {
        if (isSyncedLayer(l)) l.syncStart();
      }
    }
    t.start();
    this.playing = true;
  }

  stop(): void {
    for (const n of this.nodes) {
      try { n[1].player?.unsync().stop(); } catch { /* not started */ }
    }
    for (const l of this.layers.values()) {
      if (isSyncedLayer(l)) l.syncStop();
    }
    const t = Tone.getTransport();
    t.stop();
    t.seconds = this.loopRegion ? this.loopRegion.startSec : 0;
    this.playing = false;
  }

  togglePlay(): void {
    if (Tone.getTransport().state === 'started') {
      Tone.getTransport().pause();
      this.playing = false;
    } else {
      this.play();
    }
  }

  /** Apply one baton's output for this frame. */
  applyBaton(out: RemixBatonOutput): void {
    const state = this.states.get(out.stem);
    if (!state) return;
    if (out.filterNorm === null) return; // absent → latch (no write)

    state.targetFilterNorm = out.filterNorm;
    this.captureNow({ kind: 'stemFilter', stem: out.stem, value: out.filterNorm });
    if (out.cycled) this.gliding.add(out.stem);
    // out.shake is intentionally ignored here; the screen routes shake
    // to the percussion layer (wired in a later task).
  }

  /** Render all stem state → audio nodes. `playbackNowSec` from transport. */
  renderFrame(nowSec: number): void {
    if (!this.ctx) return;
    if (this.recorder.isArmed() && nowSec + 1e-3 < this.lastTickSec) {
      if (this.recorder.hasBuffered()) {
        this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
      }
    }
    if (this.playingArrangement) this.tickArrangement(nowSec);
    const now = this.ctx.currentTime;

    for (const [stem, state] of this.states) {
      const n = this.nodes.get(stem)!;

      // When gliding (stem just cycled), lerp gently toward the new target
      // so the re-focused stem sweeps in rather than snapping. In normal
      // active control the state tracks the baton directly (Web Audio
      // setTargetAtTime handles the audio-level smoothing). Latch means
      // targetFilterNorm was not updated so filterNorm stays put.
      if (this.gliding.has(stem)) {
        state.filterNorm += (state.targetFilterNorm - state.filterNorm) * GLIDE_LERP;
        if (Math.abs(state.targetFilterNorm - state.filterNorm) < GLIDE_EXIT_EPSILON) {
          this.gliding.delete(stem);
        }
      } else {
        state.filterNorm = state.targetFilterNorm;
      }

      const { cutoffHz, gain } = remixTaper(state.filterNorm);
      state.gain = gain;
      n.filter.frequency.setTargetAtTime(cutoffHz, now, SMOOTH_TC);
      n.gain.gain.setTargetAtTime(gain, now, SMOOTH_TC);
    }
    this.lastTickSec = nowSec;
  }

  getStemStates(): Record<StemId, RemixStemState> {
    const out = {} as Record<StemId, RemixStemState>;
    for (const [stem, s] of this.states) out[stem] = { ...s };
    return out;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setLoopLengthBars(n: 0 | 4 | 8 | 16): void {
    this.loopLengthBars = this.downbeats.length >= 2 ? n : 0;
    const barCount = Math.max(0, this.downbeats.length - 1);
    this.loopOriginBar = Math.max(
      0,
      Math.min(this.loopOriginBar, Math.max(0, barCount - this.loopLengthBars)),
    );
    this.applyLoop();
  }

  nudgeLoop(dir: 1 | -1): void {
    if (this.loopLengthBars <= 0) return;
    const barCount = Math.max(0, this.downbeats.length - 1);
    this.loopOriginBar = nudgeOrigin(this.loopOriginBar, dir, this.loopLengthBars, barCount);
    this.applyLoop();
  }

  getLoopRegion(): { startSec: number; endSec: number; lengthBars: number; originBar: number } | null {
    if (!this.loopRegion) return null;
    return {
      startSec: this.loopRegion.startSec,
      endSec: this.loopRegion.endSec,
      lengthBars: this.loopLengthBars,
      originBar: this.loopOriginBar,
    };
  }

  dispose(): void {
    this.stop();
    this.recorder.disarm();
    this.playingArrangement = false;
    for (const n of this.nodes.values()) {
      try { n.player?.unsync(); } catch { /* noop */ }
      n.player?.dispose();
      n.gain.disconnect();
      n.filter.disconnect();
    }
    this.nodes.clear();
    this.states.clear();
    this.gliding.clear();
    for (const l of this.layers.values()) l.dispose();
    this.layers.clear();
    this.layersBus?.disconnect();
    this.layersBus = null;
    this.master?.disconnect();
    this.spaceReverb?.dispose();
    this.spaceReverb = null;
    this.masterChain?.dispose();
    this.masterChain = null;
    this.master = null;
    this.ctx = null;
  }

  setStemFilterNorm(stem: StemId, value: number): void {
    const state = this.states.get(stem);
    if (!state) return;
    state.targetFilterNorm = Math.max(0, Math.min(1, value));
    this.gliding.delete(stem); // direct control, no glide
    this.captureNow({ kind: 'stemFilter', stem, value: Math.max(0, Math.min(1, value)) });
  }

  getStemFilterNorm(stem: StemId): number {
    return this.states.get(stem)?.targetFilterNorm ?? 0;
  }

  setFocusedStem(stem: StemId): void {
    this.focusedStem = stem;
  }

  getFocusedStem(): StemId {
    return this.focusedStem;
  }

  setHeadNodEnabled(enabled: boolean): void {
    this.headNodEnabled = enabled;
    if (!enabled) this.headNodDetector.reset();
  }

  setHeadNodSensitivity(minDownExcursion: number, cooldownMs: number): void {
    this.headNodDetector.setConfig(minDownExcursion, cooldownMs);
  }

  addLayer(layer: RemixLayer): void { this.layers.set(layer.id, layer); }
  getLayer(id: string): RemixLayer | undefined { return this.layers.get(id); }
  removeLayer(id: string): void {
    const l = this.layers.get(id);
    if (l) { l.dispose(); this.layers.delete(id); }
  }
  setLayerEnabled(id: string, on: boolean): void { this.layers.get(id)?.setEnabled(on); }
  setLayerVolume(id: string, v: number): void { this.layers.get(id)?.setVolume(v); }

  /** Make loop `i` the single audible loop. No-op if there's no loop layer. */
  selectLoop(i: number): void {
    const l = this.layers.get('loop');
    if (l instanceof LoopLayer) l.selectLoop(i);
    this.captureNow({ kind: 'loopSelect', index: i });
  }

  /** Loop-layer summary for the UI. count 0 when there's no loop layer. */
  getLoopInfo(): { count: number; activeIndex: number; names: string[] } {
    const l = this.layers.get('loop');
    if (!(l instanceof LoopLayer)) return { count: 0, activeIndex: 0, names: [] };
    const names: string[] = [];
    for (let i = 0; i < l.getLoopCount(); i++) names.push(l.getLoopName(i));
    return { count: l.getLoopCount(), activeIndex: l.getActiveLoopIndex(), names };
  }

  /** Route the loop baton's per-frame output to the loop layer. */
  applyLoopBaton(out: RemixLoopBatonOutput): void {
    this.setLayerEnabled('loop', out.present);
    this.captureNow({ kind: 'loopEnable', on: out.present });
    if (out.present) {
      this.selectLoop(out.loopIndex);
      this.setLayerVolume('loop', out.volume);
      this.captureNow({ kind: 'loopVolume', value: out.volume });
    }
  }
  /** Fire the percussion layer (head-nod / shake / keyboard-S route here). */
  triggerPercussion(timeSec: number, velocity: number): void {
    this.captureNow({ kind: 'percussion', velocity });
    const layer = this.layers.get('percussion');
    if (layer instanceof PercussionLayer && layer.isEnabled()) layer.hit(timeSec, velocity);
  }

  /** Feed face landmarks; a detected nod triggers the percussion layer. */
  processFaceLandmarks(landmarks: FaceLandmarks | null, timestampMs: number): void {
    if (!this.headNodEnabled || !landmarks) return;
    const lm = landmarks.landmarks[this.headNodLandmarkIndex];
    if (!lm) return;
    if (this.headNodDetector.step(lm.y, timestampMs)) {
      const velocity = clampVel(this.headNodDetector.getLastBopAmplitude());
      this.triggerPercussion(Tone.getTransport().seconds, velocity);
    }
  }

  getSongId(): string {
    return this.songId;
  }

  private captureNow(input: CaptureInput): void {
    if (this.recorder.isArmed()) this.recorder.capture(input, Tone.getTransport().seconds);
  }

  private currentSectionTimes(): { startSec: number; lengthSec: number } {
    const region = this.getLoopRegion();
    if (region) return { startSec: region.startSec, lengthSec: Math.max(0, region.endSec - region.startSec) };
    return { startSec: 0, lengthSec: this.duration };
  }

  armRecording(): void {
    this.playingArrangement = false; // recording and remix playback are mutually exclusive
    const { startSec, lengthSec } = this.currentSectionTimes();
    this.recSectionOriginBar = this.loopOriginBar;
    this.recSectionLengthBars = this.loopLengthBars;
    this.recorder.arm(startSec, lengthSec);
    this.lastTickSec = Tone.getTransport().seconds;
  }

  disarmRecording(): void {
    if (this.recorder.hasBuffered()) {
      this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
    }
    this.recorder.disarm();
  }

  isRecording(): boolean {
    return this.recorder.isArmed();
  }

  advanceSection(): void {
    if (this.recorder.hasBuffered()) {
      this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
    }
    this.nudgeLoop(1);
    const { startSec, lengthSec } = this.currentSectionTimes();
    this.recSectionOriginBar = this.loopOriginBar;
    this.recSectionLengthBars = this.loopLengthBars;
    if (this.recorder.isArmed()) this.recorder.arm(startSec, lengthSec);
    this.lastTickSec = Tone.getTransport().seconds;
  }

  getArrangement(): RemixArrangement {
    return this.arranger.getArrangement();
  }

  playArrangement(): void {
    // Disarm any recording so playback never feeds composited automation back
    // into a live take (the capture hooks would otherwise re-record it).
    this.recorder.disarm();
    this.playingArrangement = true;
    this.lastTickSec = Tone.getTransport().seconds;
  }

  stopArrangement(): void {
    this.playingArrangement = false;
  }

  isPlayingArrangement(): boolean {
    return this.playingArrangement;
  }

  loadArrangement(a: RemixArrangement): void {
    this.arranger.load(a);
  }

  muteTake(sectionIdx: number, takeId: string, muted: boolean): void {
    this.arranger.muteTake(sectionIdx, takeId, muted);
  }

  deleteTake(sectionIdx: number, takeId: string): void {
    this.arranger.deleteTake(sectionIdx, takeId);
  }

  /** Absolute bounds of a section, or null when its loop region can't be resolved
   *  (e.g. an arrangement loaded against a different song's bar grid). */
  private sectionBounds(originBar: number, lengthBars: number): { start: number; end: number } | null {
    const region = computeLoopRegion(this.downbeats, originBar, lengthBars);
    return region ? { start: region.startSec, end: region.endSec } : null;
  }

  private tickArrangement(nowSec: number): void {
    const arr = this.arranger.getArrangement();
    for (const section of arr.sections) {
      const bounds = this.sectionBounds(section.originBar, section.lengthBars);
      if (!bounds) continue; // unresolved region → don't flood the whole timeline
      const { start, end } = bounds;
      if (nowSec < start || nowSec >= end) continue;
      const t = nowSec - start;
      const comp = RemixArranger.composite(section, t);
      for (const stem of STEM_CYCLE_ORDER) {
        const v = comp.filters[stem];
        if (v !== undefined) this.setStemFilterNorm(stem, v);
      }
      if (comp.loopEnable !== undefined) this.setLayerEnabled('loop', comp.loopEnable);
      if (comp.loopSelect !== undefined) this.selectLoop(comp.loopSelect);
      if (comp.loopVolume !== undefined) this.setLayerVolume('loop', comp.loopVolume);
      // Percussion window since the last tick. On a transport loop-wrap nowSec
      // jumps backward (nowSec < lastTickSec); widen the window to the section
      // start so hits near the seam fire on the new cycle instead of being
      // dropped because fromT would exceed t.
      const wrapped = nowSec < this.lastTickSec;
      const fromT = wrapped ? -Infinity : this.lastTickSec - start;
      const hits = RemixArranger.discreteEventsInWindow(section, fromT, t);
      for (const hit of hits) {
        if (hit.kind === 'percussion') this.triggerPercussion(nowSec, hit.velocity);
      }
    }
  }

  // ---- internal ----

  private applyLoop(): void {
    const t = Tone.getTransport();
    const region = this.loopLengthBars > 0
      ? computeLoopRegion(this.downbeats, this.loopOriginBar, this.loopLengthBars)
      : { startSec: 0, endSec: this.duration };
    this.loopRegion = region;
    if (!region) { t.loop = false; return; }
    t.loop = true;
    t.loopStart = region.startSec;
    t.loopEnd = region.endSec;
  }
}
