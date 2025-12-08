/**
 * Sequencer - Step sequencer for programming patterns
 *
 * Features:
 * - 8/16/32 step grid
 * - Multiple tracks
 * - Pattern storage
 */

/** A single step in the sequencer */
export interface SequencerStep {
  midi: number;
  velocity: number;
  gate: number; // 0-1, percentage of step duration
  enabled: boolean;
}

/** A track/layer in the sequencer */
export interface SequencerTrack {
  id: string;
  name: string;
  steps: (SequencerStep | null)[];
  muted: boolean;
  solo: boolean;
  volume: number;
}

/** Sequencer configuration */
export interface SequencerConfig {
  /** Number of steps (8, 16, 32) */
  stepCount: 8 | 16 | 32;
  /** Whether sequencer is playing */
  playing: boolean;
  /** Whether recording is enabled */
  recording: boolean;
  /** Current playback position (0 to stepCount-1) */
  currentStep: number;
  /** BPM */
  bpm: number;
}

export type SequencerNoteCallback = (
  midi: number,
  velocity: number,
  duration: number,
  trackId: string,
  isNoteOn: boolean
) => void;

export type SequencerStepCallback = (step: number, totalSteps: number) => void;

const DEFAULT_CONFIG: SequencerConfig = {
  stepCount: 16,
  playing: false,
  recording: false,
  currentStep: 0,
  bpm: 120,
};

export class Sequencer {
  private config: SequencerConfig;
  private tracks: Map<string, SequencerTrack> = new Map();
  private noteCallback: SequencerNoteCallback | null = null;
  private stepCallback: SequencerStepCallback | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<SequencerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for note events
   */
  onNote(callback: SequencerNoteCallback): void {
    this.noteCallback = callback;
  }

  /**
   * Set callback for step changes (for UI visualization)
   */
  onStep(callback: SequencerStepCallback): void {
    this.stepCallback = callback;
  }

  /**
   * Add a new track
   */
  addTrack(id: string, name: string): SequencerTrack {
    const track: SequencerTrack = {
      id,
      name,
      steps: new Array(this.config.stepCount).fill(null),
      muted: false,
      solo: false,
      volume: 1.0,
    };
    this.tracks.set(id, track);
    return track;
  }

  /**
   * Remove a track
   */
  removeTrack(id: string): void {
    this.tracks.delete(id);
  }

  /**
   * Get a track by ID
   */
  getTrack(id: string): SequencerTrack | undefined {
    return this.tracks.get(id);
  }

  /**
   * Get all tracks
   */
  getAllTracks(): SequencerTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Set a step in a track
   */
  setStep(
    trackId: string,
    stepIndex: number,
    step: SequencerStep | null
  ): void {
    const track = this.tracks.get(trackId);
    if (!track || stepIndex < 0 || stepIndex >= this.config.stepCount) return;

    track.steps[stepIndex] = step;
  }

  /**
   * Toggle a step on/off
   */
  toggleStep(trackId: string, stepIndex: number, midi: number = 60): void {
    const track = this.tracks.get(trackId);
    if (!track || stepIndex < 0 || stepIndex >= this.config.stepCount) return;

    if (track.steps[stepIndex]) {
      track.steps[stepIndex] = null;
    } else {
      track.steps[stepIndex] = {
        midi,
        velocity: 0.8,
        gate: 0.8,
        enabled: true,
      };
    }
  }

  /**
   * Clear a track
   */
  clearTrack(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    track.steps = new Array(this.config.stepCount).fill(null);
  }

  /**
   * Clear all tracks
   */
  clearAll(): void {
    for (const track of this.tracks.values()) {
      track.steps = new Array(this.config.stepCount).fill(null);
    }
  }

  /**
   * Start playback
   */
  play(): void {
    if (this.config.playing) return;

    this.config.playing = true;
    this.config.currentStep = 0;

    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Calculate step duration (16th notes)
    const stepDuration = this.getStepDurationMs();

    // Start interval
    this.intervalId = setInterval(() => {
      this.playCurrentStep();
      this.advanceStep();
    }, stepDuration);

    // Play first step immediately
    this.playCurrentStep();
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.config.playing = false;
    this.config.recording = false;
    this.config.currentStep = 0;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Notify step change
    if (this.stepCallback) {
      this.stepCallback(0, this.config.stepCount);
    }
  }

  /**
   * Start recording
   */
  startRecording(): void {
    this.config.recording = true;
    if (!this.config.playing) {
      this.play();
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.config.recording = false;
  }

  /**
   * Record a note at current step
   */
  recordNote(midi: number, velocity: number, trackId: string = 'default'): void {
    if (!this.config.recording) return;

    const track = this.tracks.get(trackId);
    if (!track) return;

    track.steps[this.config.currentStep] = {
      midi,
      velocity,
      gate: 0.8,
      enabled: true,
    };
  }

  /**
   * Set step count
   */
  setStepCount(count: 8 | 16 | 32): void {
    this.config.stepCount = count;

    // Resize all tracks
    for (const track of this.tracks.values()) {
      const oldSteps = track.steps;
      track.steps = new Array(count).fill(null);
      // Copy existing steps
      for (let i = 0; i < Math.min(oldSteps.length, count); i++) {
        track.steps[i] = oldSteps[i];
      }
    }

    // Restart if playing
    if (this.config.playing) {
      this.stop();
      this.play();
    }
  }

  /**
   * Set BPM
   */
  setBpm(bpm: number): void {
    this.config.bpm = Math.max(30, Math.min(300, bpm));

    // Restart with new BPM if playing
    if (this.config.playing) {
      const wasPlaying = true;
      this.stop();
      if (wasPlaying) {
        this.play();
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SequencerConfig {
    return { ...this.config };
  }

  /**
   * Get current step
   */
  getCurrentStep(): number {
    return this.config.currentStep;
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.config.playing;
  }

  /**
   * Check if recording
   */
  isRecording(): boolean {
    return this.config.recording;
  }

  /**
   * Get step duration in ms (16th note)
   */
  private getStepDurationMs(): number {
    return 60000 / this.config.bpm / 4; // 16th note
  }

  /**
   * Play current step
   */
  private playCurrentStep(): void {
    const step = this.config.currentStep;

    // Notify step change
    if (this.stepCallback) {
      this.stepCallback(step, this.config.stepCount);
    }

    // Check for solo tracks
    const hasSolo = Array.from(this.tracks.values()).some(t => t.solo);

    // Play each track's step
    for (const track of this.tracks.values()) {
      // Skip muted tracks (or non-solo tracks if any track is solo)
      if (track.muted) continue;
      if (hasSolo && !track.solo) continue;

      const stepData = track.steps[step];
      if (!stepData || !stepData.enabled) continue;

      // Calculate duration based on gate
      const stepDuration = this.getStepDurationMs();
      const noteDuration = stepDuration * stepData.gate;

      // Apply track volume to velocity
      const velocity = stepData.velocity * track.volume;

      // Emit note
      if (this.noteCallback) {
        this.noteCallback(stepData.midi, velocity, noteDuration, track.id, true);

        // Schedule note off
        setTimeout(() => {
          if (this.noteCallback) {
            this.noteCallback(stepData.midi, 0, 0, track.id, false);
          }
        }, noteDuration);
      }
    }
  }

  /**
   * Advance to next step
   */
  private advanceStep(): void {
    this.config.currentStep = (this.config.currentStep + 1) % this.config.stepCount;
  }
}

// Singleton instance
let sequencerInstance: Sequencer | null = null;

export function getSequencer(): Sequencer {
  if (!sequencerInstance) {
    sequencerInstance = new Sequencer();
    // Add default track
    sequencerInstance.addTrack('default', 'Track 1');
  }
  return sequencerInstance;
}
