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
import type { StemId, RemixBatonOutput } from './RemixBaton';
import { STEM_CYCLE_ORDER } from './RemixBaton';
import { computeLoopRegion, nudgeOrigin } from './loopRegion';
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';
import type { FaceLandmarks } from '../state/types';

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

export class RemixEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes = new Map<StemId, StemNodes>();
  private states = new Map<StemId, RemixStemState>();
  private gliding = new Set<StemId>();
  private downbeats: number[] = [];
  private playing = false;
  private loopRegion: { startSec: number; endSec: number } | null = null;
  private loopLengthBars: 0 | 4 | 8 | 16 = 8;
  private loopOriginBar = 0;
  private duration = 0;
  private focusedStem: StemId = STEM_CYCLE_ORDER[0];
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
        this.downbeats = a.downbeats;
      } catch {
        this.downbeats = song.downbeats ?? [];
      }
    } else {
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
    for (const n of this.nodes) {
      try { n[1].player?.unsync().stop(); } catch { /* not started */ }
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
    // out.shake is intentionally ignored here; the screen routes shake
    // to the percussion layer (wired in a later task).
  }

  /** Render all stem state → audio nodes. `playbackNowSec` from transport. */
  renderFrame(_playbackNowSec: number): void {
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
      n.gain.gain.setTargetAtTime(gain, now, SMOOTH_TC);
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

  setHeadNodEnabled(enabled: boolean): void {
    this.headNodEnabled = enabled;
    if (!enabled) this.headNodDetector.reset();
  }

  setHeadNodSensitivity(minDownExcursion: number, cooldownMs: number): void {
    this.headNodDetector.setConfig(minDownExcursion, cooldownMs);
  }

  /** Feed face landmarks; a detected nod will trigger percussion (wired in a later task). */
  processFaceLandmarks(landmarks: FaceLandmarks | null, timestampMs: number): void {
    if (!this.headNodEnabled || !landmarks) return;
    const lm = landmarks.landmarks[this.headNodLandmarkIndex];
    if (!lm) return;
    // HeadBopDetector step result is available for future percussion wiring.
    this.headNodDetector.step(lm.y, timestampMs);
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
