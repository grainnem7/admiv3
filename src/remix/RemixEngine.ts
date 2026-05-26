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
import type { SongConfig } from '../songs/songLibrary';
import { loadStemBuffers } from './loadStemBuffers';
import { loadSongAnalysis } from '../songs/analysisLoader';
import { remixTaper } from './remixTaper';
import {
  StutterScheduler,
  computeStutterWindow,
  type StutterWindow,
} from './StutterScheduler';
import type { StemId, RemixBatonOutput } from './RemixBaton';
import { STEM_CYCLE_ORDER } from './RemixBaton';
import { computeLoopRegion, nudgeOrigin } from './loopRegion';
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';
import type { FaceLandmarks } from '../state/types';

export interface RemixStemState {
  filterNorm: number;
  targetFilterNorm: number;
  gain: number;
  stuttering: boolean;
}

interface StemNodes {
  buffer: AudioBuffer;
  player: Tone.Player | null;
  gain: GainNode;
  filter: BiquadFilterNode;
  stutterSource: AudioBufferSourceNode | null;
  scheduler: StutterScheduler;
  pendingWindow: StutterWindow | null;
}

const SMOOTH_TC = 0.05;          // filter/gain setTargetAtTime time-constant
const GLIDE_LERP = 0.12;         // per-frame glide toward target (~250ms)
const MASTER_GAIN = 0.9;         // master bus output level
const DUCK_TC = 0.01;            // stutter overlay: time-constant for ducking stem gain to 0
const GLIDE_EXIT_EPSILON = 0.01; // distance below which glide is considered complete
// Hysteresis for wrap detection: a burst ends when the playhead has jumped back
// more than this far before the burst start. 0.25 s is comfortably below a bar
// at typical tempos so it never false-fires on the very first frame before the
// playhead has advanced past startSec.
const WRAP_EPSILON = 0.25;

export class RemixEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes = new Map<StemId, StemNodes>();
  private states = new Map<StemId, RemixStemState>();
  private gliding = new Set<StemId>();
  private beats: number[] = [];
  private downbeats: number[] = [];
  private playing = false;
  private loopRegion: { startSec: number; endSec: number } | null = null;
  private loopLengthBars: 0 | 4 | 8 | 16 = 8;
  private loopOriginBar = 0;
  private duration = 0;
  private focusedStem: StemId = STEM_CYCLE_ORDER[0];
  private shakeStutterEnabled = true;
  private headNodEnabled = false;
  private headNodDetector = new HeadBopDetector(0.025, 200);
  private readonly headNodLandmarkIndex = 1; // nose tip

  async loadSong(song: SongConfig): Promise<void> {
    this.dispose();
    await Tone.start();
    this.ctx = Tone.getContext().rawContext as AudioContext;

    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);

    const buffers = await loadStemBuffers(this.ctx, song.stems);
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
        stutterSource: null,
        scheduler: new StutterScheduler(),
        pendingWindow: null,
      });
      this.states.set(stem, {
        filterNorm: 0,
        targetFilterNorm: 0,
        gain: 0,
        stuttering: false,
      });
    }

    if (song.analysisUrl) {
      try {
        const a = await loadSongAnalysis(song.analysisUrl);
        this.beats = a.beats;
        this.downbeats = a.downbeats;
      } catch {
        this.beats = song.beats ?? [];
        this.downbeats = song.downbeats ?? [];
      }
    } else {
      this.beats = song.beats ?? [];
      this.downbeats = song.downbeats ?? [];
    }

    this.loopOriginBar = 0;
    this.loopLengthBars = this.downbeats.length >= 2 ? 8 : 0;
    this.applyLoop();

    Tone.getTransport().bpm.value = song.bpm;
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
    }
    t.start();
    this.playing = true;
  }

  stop(): void {
    for (const [stem, n] of this.nodes) {
      n.scheduler.forceStop(() => this.stopOverlay(n));
      try { n.player?.unsync().stop(); } catch { /* not started */ }
      // Clear mid-burst state so a subsequent play() does not permanently
      // suppress the stem's gain writes via the !state.stuttering guard.
      n.pendingWindow = null;
      const state = this.states.get(stem);
      if (state) state.stuttering = false;
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
    if (out.cycled) this.gliding.add(out.stem);

    if (out.stutter && this.shakeStutterEnabled) this.triggerStutter(out.stem);
  }

  /** Render all stem state → audio nodes. `playbackNowSec` from transport. */
  renderFrame(playbackNowSec: number): void {
    if (!this.ctx) return;
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
      // Stutter overlay owns the gain while bursting.
      if (!state.stuttering) {
        n.gain.gain.setTargetAtTime(gain, now, SMOOTH_TC);
      }

      // End an in-flight burst once its window elapses.
      if (n.pendingWindow) {
        // Transport looped back past the burst start → end the burst (the
        // seam clamp makes burstEnd == loopEnd, which tick() can't observe
        // because the playhead wraps to loopStart at exactly that instant).
        // A wrap has occurred when the loop is active and the playhead has
        // jumped back to near loopStart while the burst started well after it.
        const loopStart = this.loopRegion?.startSec ?? 0;
        const wrappedBack =
          this.loopRegion !== null &&
          playbackNowSec < loopStart + WRAP_EPSILON &&
          n.pendingWindow.startSec > loopStart + WRAP_EPSILON;
        if (wrappedBack) {
          n.scheduler.forceStop(() => this.stopOverlay(n));
          n.pendingWindow = null;
          state.stuttering = false;
        } else {
          n.scheduler.tick(playbackNowSec, n.pendingWindow, () =>
            this.stopOverlay(n),
          );
          if (!n.scheduler.isActive()) {
            n.pendingWindow = null;
            state.stuttering = false;
          }
        }
      }
    }
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
    for (const n of this.nodes.values()) {
      try { n.player?.unsync(); } catch { /* noop */ }
      n.player?.dispose();
      n.gain.disconnect();
      n.filter.disconnect();
    }
    this.nodes.clear();
    this.states.clear();
    this.gliding.clear();
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
  }

  setStemFilterNorm(stem: StemId, value: number): void {
    const state = this.states.get(stem);
    if (!state) return;
    state.targetFilterNorm = Math.max(0, Math.min(1, value));
    this.gliding.delete(stem); // direct control, no glide
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

  /** Public wrapper over the private stutter trigger (keyboard/head-nod). */
  triggerStutterFor(stem: StemId): void {
    this.triggerStutter(stem);
  }

  setShakeStutterEnabled(enabled: boolean): void {
    this.shakeStutterEnabled = enabled;
  }

  setHeadNodEnabled(enabled: boolean): void {
    this.headNodEnabled = enabled;
    if (!enabled) this.headNodDetector.reset();
  }

  setHeadNodSensitivity(minDownExcursion: number, cooldownMs: number): void {
    this.headNodDetector.setConfig(minDownExcursion, cooldownMs);
  }

  /** Feed face landmarks; a detected nod stutters the focused stem. */
  processFaceLandmarks(landmarks: FaceLandmarks | null, timestampMs: number): void {
    if (!this.headNodEnabled || !landmarks) return;
    const lm = landmarks.landmarks[this.headNodLandmarkIndex];
    if (!lm) return;
    if (this.headNodDetector.step(lm.y, timestampMs)) {
      this.triggerStutterFor(this.focusedStem);
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

  private triggerStutter(stem: StemId): void {
    if (!this.ctx) return;
    const n = this.nodes.get(stem);
    const state = this.states.get(stem);
    if (!n || !state) return;

    const playbackNow = Tone.getTransport().seconds;
    const win = computeStutterWindow(playbackNow, this.beats, this.downbeats);
    if (this.loopRegion) {
      const maxDur = this.loopRegion.endSec - win.startSec;
      if (win.burstDurSec > maxDur) {
        win.burstDurSec = Math.max(0, maxDur);
      }
    }
    const began = n.scheduler.begin(win, (w) => this.startOverlay(n, w));
    if (began) {
      n.pendingWindow = win;
      state.stuttering = true;
    }
  }

  private startOverlay(n: StemNodes, win: StutterWindow): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = n.buffer;
    src.loop = true;
    const offset = win.startSec % n.buffer.duration;
    src.loopStart = offset;
    src.loopEnd = offset + win.sliceDurSec;
    src.connect(n.filter);
    const now = this.ctx.currentTime;
    // Duck the main path so the overlay exclusively owns the burst.
    // The overlay is post-gain (connects to n.filter), so this does
    // not silence the overlay itself.
    n.gain.gain.setTargetAtTime(0, now, DUCK_TC);
    src.start(now, offset);
    n.stutterSource = src;
  }

  private stopOverlay(n: StemNodes): void {
    if (n.stutterSource) {
      try { n.stutterSource.stop(); } catch { /* already stopped */ }
      n.stutterSource.disconnect();
      n.stutterSource = null;
    }
  }
}
