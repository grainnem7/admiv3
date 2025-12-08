/**
 * Arpeggiator - Generates rhythmic patterns from held notes
 *
 * Takes a set of held MIDI notes and outputs them sequentially
 * in various patterns and at different rates.
 *
 * Features:
 * - Multiple patterns: up, down, upDown, downUp, random, played
 * - Tempo-synced rates (whole, half, quarter, 8th, 16th, triplets)
 * - Octave range extension
 * - Gate length control
 */

/** Arpeggiator pattern type */
export type ArpPattern =
  | 'up'        // Low to high
  | 'down'      // High to low
  | 'upDown'    // Low to high to low
  | 'downUp'    // High to low to high
  | 'random'    // Random order
  | 'played';   // Order notes were added

/** Note rate relative to tempo */
export type ArpRate =
  | '1n'   // Whole note
  | '2n'   // Half note
  | '4n'   // Quarter note
  | '8n'   // Eighth note
  | '16n'  // Sixteenth note
  | '8t'   // Eighth triplet
  | '16t'; // Sixteenth triplet

export interface ArpeggiatorConfig {
  /** Pattern type */
  pattern: ArpPattern;
  /** Note rate */
  rate: ArpRate;
  /** Octave range (1-4) */
  octaveRange: number;
  /** Gate length (0.1-1.0, percentage of note duration) */
  gateLength: number;
  /** Velocity variation (0-1) */
  velocityVariation: number;
  /** Base velocity (0-1) */
  baseVelocity: number;
  /** Whether arpeggiator is running */
  enabled: boolean;
  /** BPM */
  bpm: number;
}

export interface ArpNote {
  midi: number;
  velocity: number;
  addedAt: number;
}

export type ArpNoteCallback = (
  midi: number,
  velocity: number,
  duration: number,
  isNoteOn: boolean
) => void;

const DEFAULT_CONFIG: ArpeggiatorConfig = {
  pattern: 'up',
  rate: '8n',
  octaveRange: 1,
  gateLength: 0.8,
  velocityVariation: 0.1,
  baseVelocity: 0.7,
  enabled: false,
  bpm: 120,
};

export class Arpeggiator {
  private config: ArpeggiatorConfig;
  private heldNotes: ArpNote[] = [];
  private currentIndex: number = 0;
  private direction: 1 | -1 = 1;
  private sequence: number[] = [];
  private isPlaying: boolean = false;
  private noteCallback: ArpNoteCallback | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ArpeggiatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for note events
   */
  onNote(callback: ArpNoteCallback): void {
    this.noteCallback = callback;
  }

  /**
   * Add a note to the held notes
   */
  noteOn(midi: number, velocity: number = 0.7): void {
    // Check if note already exists
    const existing = this.heldNotes.find(n => n.midi === midi);
    if (existing) {
      existing.velocity = velocity;
      return;
    }

    this.heldNotes.push({
      midi,
      velocity,
      addedAt: Date.now(),
    });

    this.rebuildSequence();

    // Start arpeggiator if this is the first note and enabled
    if (this.config.enabled && this.heldNotes.length === 1) {
      this.start();
    }
  }

  /**
   * Remove a note from held notes
   */
  noteOff(midi: number): void {
    // Remove all octaves of this note
    const baseNote = midi % 12;
    this.heldNotes = this.heldNotes.filter(n => n.midi % 12 !== baseNote);

    this.rebuildSequence();

    // Stop if no notes held
    if (this.heldNotes.length === 0) {
      this.stop();
    }
  }

  /**
   * Clear all held notes
   */
  clear(): void {
    this.heldNotes = [];
    this.sequence = [];
    this.currentIndex = 0;
    this.stop();
  }

  /**
   * Start the arpeggiator
   */
  start(): void {
    if (this.isPlaying || this.heldNotes.length === 0) return;

    this.isPlaying = true;
    this.currentIndex = 0;
    this.direction = 1;

    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Start interval-based playback
    const intervalMs = this.getRateMs();
    this.intervalId = setInterval(() => {
      this.playCurrentNote();
      this.advanceIndex();
    }, intervalMs);

    // Play first note immediately
    this.playCurrentNote();
    this.advanceIndex();
  }

  /**
   * Stop the arpeggiator
   */
  stop(): void {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Enable/disable the arpeggiator
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && this.heldNotes.length > 0) {
      this.start();
    } else if (!enabled) {
      this.stop();
    }
  }

  /**
   * Set pattern
   */
  setPattern(pattern: ArpPattern): void {
    this.config.pattern = pattern;
    this.rebuildSequence();
    this.currentIndex = 0;
    this.direction = 1;
  }

  /**
   * Set rate
   */
  setRate(rate: ArpRate): void {
    this.config.rate = rate;
    // Restart with new rate if playing
    if (this.isPlaying) {
      this.stop();
      this.isPlaying = false; // Reset so start() works
      if (this.heldNotes.length > 0) {
        this.start();
      }
    }
  }

  /**
   * Set BPM
   */
  setBpm(bpm: number): void {
    this.config.bpm = Math.max(30, Math.min(300, bpm));
    // Restart with new BPM if playing
    if (this.isPlaying) {
      this.stop();
      this.isPlaying = false;
      if (this.heldNotes.length > 0) {
        this.start();
      }
    }
  }

  /**
   * Set octave range
   */
  setOctaveRange(range: number): void {
    this.config.octaveRange = Math.max(1, Math.min(4, range));
    this.rebuildSequence();
  }

  /**
   * Set gate length
   */
  setGateLength(length: number): void {
    this.config.gateLength = Math.max(0.1, Math.min(1.0, length));
  }

  /**
   * Get current configuration
   */
  getConfig(): ArpeggiatorConfig {
    return { ...this.config };
  }

  /**
   * Get held notes
   */
  getHeldNotes(): number[] {
    return this.heldNotes.map(n => n.midi);
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.isPlaying;
  }

  /**
   * Get rate in milliseconds
   */
  private getRateMs(): number {
    const beatMs = 60000 / this.config.bpm;
    switch (this.config.rate) {
      case '1n': return beatMs * 4;
      case '2n': return beatMs * 2;
      case '4n': return beatMs;
      case '8n': return beatMs / 2;
      case '16n': return beatMs / 4;
      case '8t': return beatMs / 3;
      case '16t': return beatMs / 6;
      default: return beatMs / 2;
    }
  }

  /**
   * Play the current note in the sequence
   */
  private playCurrentNote(): void {
    if (this.sequence.length === 0 || !this.noteCallback) return;

    const midi = this.sequence[this.currentIndex];
    const originalNote = this.heldNotes.find(n =>
      n.midi % 12 === midi % 12
    );

    // Calculate velocity with variation
    let velocity = originalNote?.velocity ?? this.config.baseVelocity;
    if (this.config.velocityVariation > 0) {
      const variation = (Math.random() - 0.5) * 2 * this.config.velocityVariation;
      velocity = Math.max(0.1, Math.min(1, velocity + variation));
    }

    // Calculate duration based on gate length
    const noteDuration = this.getRateMs() * this.config.gateLength;

    // Emit note on
    this.noteCallback(midi, velocity, noteDuration, true);

    // Schedule note off
    setTimeout(() => {
      if (this.noteCallback) {
        this.noteCallback(midi, 0, 0, false);
      }
    }, noteDuration);
  }

  /**
   * Advance to the next index based on pattern
   */
  private advanceIndex(): void {
    if (this.sequence.length === 0) return;

    switch (this.config.pattern) {
      case 'up':
        this.currentIndex = (this.currentIndex + 1) % this.sequence.length;
        break;

      case 'down':
        this.currentIndex = this.currentIndex - 1;
        if (this.currentIndex < 0) {
          this.currentIndex = this.sequence.length - 1;
        }
        break;

      case 'upDown':
        this.currentIndex += this.direction;
        if (this.currentIndex >= this.sequence.length - 1) {
          this.direction = -1;
          this.currentIndex = this.sequence.length - 1;
        } else if (this.currentIndex <= 0) {
          this.direction = 1;
          this.currentIndex = 0;
        }
        break;

      case 'downUp':
        this.currentIndex += this.direction;
        if (this.currentIndex <= 0) {
          this.direction = 1;
          this.currentIndex = 0;
        } else if (this.currentIndex >= this.sequence.length - 1) {
          this.direction = -1;
          this.currentIndex = this.sequence.length - 1;
        }
        break;

      case 'random':
        this.currentIndex = Math.floor(Math.random() * this.sequence.length);
        break;

      case 'played':
        this.currentIndex = (this.currentIndex + 1) % this.sequence.length;
        break;
    }
  }

  /**
   * Rebuild the sequence based on held notes, pattern, and octave range
   */
  private rebuildSequence(): void {
    if (this.heldNotes.length === 0) {
      this.sequence = [];
      return;
    }

    // Start with base notes sorted by pitch
    const baseNotes = [...this.heldNotes].sort((a, b) => a.midi - b.midi);

    // Expand across octave range
    const expanded: number[] = [];
    for (let octave = 0; octave < this.config.octaveRange; octave++) {
      for (const note of baseNotes) {
        expanded.push(note.midi + octave * 12);
      }
    }

    // Apply pattern-specific sorting
    switch (this.config.pattern) {
      case 'up':
        this.sequence = expanded.sort((a, b) => a - b);
        break;

      case 'down':
        this.sequence = expanded.sort((a, b) => b - a);
        break;

      case 'upDown':
      case 'downUp':
        this.sequence = expanded.sort((a, b) => a - b);
        break;

      case 'random':
        this.sequence = expanded;
        break;

      case 'played':
        // Maintain order notes were added
        this.sequence = [];
        for (let octave = 0; octave < this.config.octaveRange; octave++) {
          for (const note of this.heldNotes) {
            this.sequence.push(note.midi + octave * 12);
          }
        }
        break;
    }

    // Reset index if out of bounds
    if (this.currentIndex >= this.sequence.length) {
      this.currentIndex = 0;
    }
  }
}

// Singleton instance
let arpeggiatorInstance: Arpeggiator | null = null;

export function getArpeggiator(): Arpeggiator {
  if (!arpeggiatorInstance) {
    arpeggiatorInstance = new Arpeggiator();
  }
  return arpeggiatorInstance;
}
