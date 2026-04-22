/**
 * MelodicVoice.ts — Green object: pentatonic melody with band-crossing triggers.
 *
 * Notes trigger ONLY when crossing a boundary between the 5 pentatonic bands
 * (D4, E4, F#4, A4, B4). Holding still plays nothing new.
 *
 * Controls:
 *   Horizontal (X): Note selection (5 equal bands)
 *   Vertical (Y):   Octave (low=+1 oct, middle=0, high=-1 oct)
 *   Velocity at crossing: Note loudness and brightness
 */

import type { ChordEntry } from './chordLookup';
import { D_MAJOR_PENTATONIC } from './chordLookup';
import { EighthNoteQuantizer } from './quantizer';
import { ToneVoiceBase, clamp } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { MELODY_PRESETS, MELODY_PRESET_LIST, type MelodyPreset } from './presets/melodyPresets';

export { MELODY_PRESET_LIST };

export class MelodicVoice extends ToneVoiceBase {
  private quantizer: EighthNoteQuantizer;
  private currentPreset: MelodyPreset = MELODY_PRESETS['celesta'];
  private player: Player;

  private currentZoneIndex = -1;
  private currentOctaveShift = 0;
  private pendingNote: number | null = null;
  private nextTriggerTime = 0;
  private lastTriggeredTime = 0;
  private referenceTime = 0;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.quantizer = new EighthNoteQuantizer(bpm);
    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = MELODY_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: MelodyPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  setBpm(bpm: number): void {
    this.quantizer.setBpm(bpm);
  }

  setBeatTimestamps(beats: number[] | null): void {
    this.quantizer.setBeatTimestamps(beats);
  }

  setReferenceTime(time: number): void {
    this.referenceTime = time;
  }

  update(playbackTime: number, _chord: ChordEntry | null, velocity: number): void {
    if (this.isSilent() && !this.active) return;

    const zoneIndex = this.getZoneIndex();
    const octaveShift = Math.round((0.5 - this.posY) * 2) * 12;

    if (zoneIndex !== this.currentZoneIndex || octaveShift !== this.currentOctaveShift) {
      this.currentZoneIndex = zoneIndex;
      this.currentOctaveShift = octaveShift;
      if (zoneIndex >= 0) {
        this.pendingNote = D_MAJOR_PENTATONIC[zoneIndex] + octaveShift;
        this.nextTriggerTime = this.quantizer.nextQuantizedTime(playbackTime, this.referenceTime);
      }
    }

    if (this.pendingNote !== null && playbackTime >= this.nextTriggerTime) {
      if (playbackTime - this.lastTriggeredTime >= this.quantizer.eighthDuration * 0.9) {
        this.triggerNote(this.pendingNote, velocity);
        this.lastTriggeredTime = playbackTime;
      }
      this.pendingNote = null;
    }
  }

  onTransportStart(): void {
    this.currentZoneIndex = -1;
    this.currentOctaveShift = 0;
    this.pendingNote = null;
    this.lastTriggeredTime = 0;
  }

  onTransportStop(): void {
    this.currentZoneIndex = -1;
    this.currentOctaveShift = 0;
    this.pendingNote = null;
    this.lastTriggeredTime = 0;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }

  // ---- Internal ----

  private getZoneIndex(): number {
    return Math.min(Math.floor(this.posX * 5), 4);
  }

  private triggerNote(midi: number, velocity: number): void {
    if (!this.player.isReady()) return;
    const noteVelocity = clamp(0.3 + velocity * 0.7, 0.3, 1.0);

    // Velocity-driven filter brightness boost
    const brightnessBoost = velocity * 3000;
    this.filterNode.frequency.value = clamp(
      this.filterNode.frequency.value + brightnessBoost,
      200,
      12000,
    );

    this.player.triggerAttackRelease(midi, this.currentPreset.duration, undefined, noteVelocity);
    this.onNoteTrigger?.();
  }
}
