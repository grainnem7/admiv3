/**
 * MIDIOutput - Send MIDI messages to external devices
 *
 * Converts MusicalEvents to MIDI bytes and sends to selected output.
 * Handles:
 * - Note on/off messages
 * - Control change messages
 * - Program changes
 * - Pitch bend
 * - All notes off / panic
 */

import { MIDIManager } from './MIDIManager';
import {
  type MIDIOutputConfig,
  type VoiceType,
  type MIDIChannelAssignment,
  DEFAULT_MIDI_CONFIG,
  MIDI_CC,
  getChannelForVoice,
} from './types';
import type {
  MusicalEvent,
  NoteEvent,
  ChordEvent,
  ControlChangeEvent,
} from '../mapping/events/MusicalEvents';

// MIDI status bytes
const MIDI_STATUS = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  AFTERTOUCH: 0xa0,
  CONTROL_CHANGE: 0xb0,
  PROGRAM_CHANGE: 0xc0,
  CHANNEL_PRESSURE: 0xd0,
  PITCH_BEND: 0xe0,
  CLOCK: 0xf8,
  START: 0xfa,
  CONTINUE: 0xfb,
  STOP: 0xfc,
} as const;

class MIDIOutputClass {
  private config: MIDIOutputConfig = { ...DEFAULT_MIDI_CONFIG };
  private activeNotes: Map<string, { channel: number; note: number }> = new Map();

  /**
   * Configure MIDI output
   */
  configure(config: Partial<MIDIOutputConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MIDIOutputConfig {
    return { ...this.config };
  }

  /**
   * Check if MIDI output is enabled and ready
   */
  isReady(): boolean {
    return (
      this.config.enabled &&
      this.config.deviceId !== null &&
      MIDIManager.getSelectedOutput() !== null
    );
  }

  /**
   * Send a raw MIDI message
   */
  private send(data: number[], timestamp?: number): void {
    if (!this.isReady()) return;

    const output = MIDIManager.getSelectedOutput();
    if (!output) return;

    try {
      const ts = timestamp ?? performance.now();
      if (timestamp !== undefined) {
        output.send(data, timestamp);
      } else {
        output.send(data);
      }

      // Notify manager for monitoring (parse status byte to get type and channel)
      const status = data[0];
      const channel = (status & 0x0f) + 1;
      const type = this.statusToType(status & 0xf0);
      MIDIManager.notifyMessage({
        type,
        channel,
        data1: data[1],
        data2: data[2],
        timestamp: ts,
        data: [...data],
      });
    } catch (error) {
      console.error('Failed to send MIDI message:', error);
    }
  }

  /**
   * Convert MIDI status byte to message type
   */
  private statusToType(status: number): import('./types').MIDIMessageType {
    switch (status) {
      case 0x90:
        return 'noteOn';
      case 0x80:
        return 'noteOff';
      case 0xb0:
        return 'controlChange';
      case 0xc0:
        return 'programChange';
      case 0xe0:
        return 'pitchBend';
      case 0xa0:
        return 'aftertouch';
      default:
        return 'noteOn';
    }
  }

  /**
   * Send Note On message
   */
  sendNoteOn(
    note: number,
    velocity: number,
    channel: number = 1,
    timestamp?: number
  ): void {
    // Debug logging
    if (!this.isReady()) {
      console.log('[MIDIOutput] sendNoteOn skipped - not ready. enabled:', this.config.enabled, 'deviceId:', this.config.deviceId, 'hasOutput:', MIDIManager.getSelectedOutput() !== null);
      return;
    }

    const clampedNote = Math.max(0, Math.min(127, Math.round(note)));
    const clampedVelocity = Math.max(0, Math.min(127, Math.round(velocity * this.config.velocityScale)));
    const channelByte = (channel - 1) & 0x0f;

    console.log(`[MIDIOutput] Sending Note ON: note=${clampedNote}, vel=${clampedVelocity}, ch=${channel}`);
    this.send(
      [MIDI_STATUS.NOTE_ON | channelByte, clampedNote, clampedVelocity],
      timestamp
    );
  }

  /**
   * Send Note Off message
   */
  sendNoteOff(
    note: number,
    velocity: number = 0,
    channel: number = 1,
    timestamp?: number
  ): void {
    const clampedNote = Math.max(0, Math.min(127, Math.round(note)));
    const clampedVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
    const channelByte = (channel - 1) & 0x0f;

    this.send(
      [MIDI_STATUS.NOTE_OFF | channelByte, clampedNote, clampedVelocity],
      timestamp
    );
  }

  /**
   * Send Control Change message
   */
  sendControlChange(
    controller: number,
    value: number,
    channel: number = 1,
    timestamp?: number
  ): void {
    const clampedController = Math.max(0, Math.min(127, Math.round(controller)));
    const clampedValue = Math.max(0, Math.min(127, Math.round(value)));
    const channelByte = (channel - 1) & 0x0f;

    this.send(
      [MIDI_STATUS.CONTROL_CHANGE | channelByte, clampedController, clampedValue],
      timestamp
    );
  }

  /**
   * Send Program Change message
   */
  sendProgramChange(program: number, channel: number = 1, timestamp?: number): void {
    const clampedProgram = Math.max(0, Math.min(127, Math.round(program)));
    const channelByte = (channel - 1) & 0x0f;

    this.send([MIDI_STATUS.PROGRAM_CHANGE | channelByte, clampedProgram], timestamp);
  }

  /**
   * Send Pitch Bend message
   * @param value - Pitch bend value (-1 to 1, where 0 is center)
   */
  sendPitchBend(value: number, channel: number = 1, timestamp?: number): void {
    // Convert -1..1 to 0..16383 (14-bit value, center at 8192)
    const bendValue = Math.round((value + 1) * 8191.5);
    const clampedBend = Math.max(0, Math.min(16383, bendValue));
    const lsb = clampedBend & 0x7f;
    const msb = (clampedBend >> 7) & 0x7f;
    const channelByte = (channel - 1) & 0x0f;

    this.send([MIDI_STATUS.PITCH_BEND | channelByte, lsb, msb], timestamp);
  }

  /**
   * Send All Notes Off message to a channel
   */
  sendAllNotesOff(channel: number = 1): void {
    this.sendControlChange(MIDI_CC.ALL_NOTES_OFF, 0, channel);
  }

  /**
   * Send All Sound Off message to a channel
   */
  sendAllSoundOff(channel: number = 1): void {
    this.sendControlChange(MIDI_CC.ALL_SOUND_OFF, 0, channel);
  }

  /**
   * Panic - stop all notes on all channels
   */
  panic(): void {
    for (let channel = 1; channel <= 16; channel++) {
      this.sendAllNotesOff(channel);
      this.sendAllSoundOff(channel);
    }
    this.activeNotes.clear();
  }

  /**
   * Process a MusicalEvent and send appropriate MIDI messages
   */
  processMusicalEvent(event: MusicalEvent, voiceType: VoiceType = 'melody'): void {
    if (!this.isReady()) return;

    const channel = getChannelForVoice(voiceType, this.config.channels);

    switch (event.type) {
      case 'note':
        this.handleNoteEvent(event, channel);
        break;
      case 'chord':
        this.handleChordEvent(event, channel);
        break;
      case 'control':
        this.handleControlEvent(event, channel);
        break;
      case 'safety':
        if (event.action === 'panic' || event.action === 'muteOn') {
          this.panic();
        }
        break;
    }
  }

  /**
   * Handle note events
   */
  private handleNoteEvent(event: NoteEvent, channel: number): void {
    const noteKey = event.voiceId || `note-${event.midiNote}-${channel}`;

    if (event.action === 'noteOn') {
      // Send note off for any existing note with same voiceId
      const existing = this.activeNotes.get(noteKey);
      if (existing) {
        this.sendNoteOff(existing.note, 0, existing.channel);
      }

      this.sendNoteOn(event.midiNote, event.velocity * 127, channel);
      this.activeNotes.set(noteKey, { channel, note: event.midiNote });
    } else {
      // Note off
      const existing = this.activeNotes.get(noteKey);
      if (existing) {
        this.sendNoteOff(existing.note, 0, existing.channel);
        this.activeNotes.delete(noteKey);
      } else {
        // No tracked note, send anyway
        this.sendNoteOff(event.midiNote, 0, channel);
      }
    }
  }

  /**
   * Handle chord events
   */
  private handleChordEvent(event: ChordEvent, channel: number): void {
    const chordKey = event.voiceIds?.[0] || `chord-${event.midiNotes.join('-')}`;

    if (event.action === 'chordOn') {
      // Send all notes
      event.midiNotes.forEach((note, index) => {
        const noteKey = `${chordKey}-${index}`;
        this.sendNoteOn(note, event.velocity * 127, channel);
        this.activeNotes.set(noteKey, { channel, note });
      });
    } else {
      // Send all notes off
      event.midiNotes.forEach((note, index) => {
        const noteKey = `${chordKey}-${index}`;
        this.sendNoteOff(note, 0, channel);
        this.activeNotes.delete(noteKey);
      });
    }
  }

  /**
   * Handle control change events
   */
  private handleControlEvent(event: ControlChangeEvent, channel: number): void {
    // Map our control parameters to MIDI CC numbers
    const ccMap: Record<string, number> = {
      volume: MIDI_CC.VOLUME,
      pan: MIDI_CC.PAN,
      filter_cutoff: MIDI_CC.FILTER_CUTOFF,
      filter_resonance: MIDI_CC.FILTER_RESONANCE,
      attack: MIDI_CC.ATTACK,
      release: MIDI_CC.RELEASE,
      reverb_mix: 91, // Effects 1 depth (reverb)
      delay_mix: 94, // Effects 4 depth (delay)
      vibrato_rate: 76,
      vibrato_depth: 77,
    };

    const cc = ccMap[event.parameter];
    if (cc !== undefined) {
      // Convert 0-1 value to 0-127
      this.sendControlChange(cc, event.value * 127, channel);
    }

    // Handle pitch bend separately
    if (event.parameter === 'pitch') {
      // Assuming value is 0-1 representing pitch position
      // Convert to -1..1 for pitch bend
      this.sendPitchBend((event.value - 0.5) * 2, channel);
    }
  }

  /**
   * Enable MIDI output
   */
  enable(): void {
    this.config.enabled = true;
    MIDIManager.setEnabled(true);
  }

  /**
   * Disable MIDI output
   */
  disable(): void {
    this.panic(); // Stop all notes first
    this.config.enabled = false;
    MIDIManager.setEnabled(false);
  }

  /**
   * Set output device
   */
  setDevice(deviceId: string | null): boolean {
    if (deviceId === null) {
      this.config.deviceId = null;
      return true;
    }

    if (MIDIManager.selectOutput(deviceId)) {
      this.config.deviceId = deviceId;
      return true;
    }

    return false;
  }

  /**
   * Set channel assignments
   */
  setChannels(channels: Partial<MIDIChannelAssignment>): void {
    this.config.channels = { ...this.config.channels, ...channels };
  }

  /**
   * Set velocity scaling
   */
  setVelocityScale(scale: number): void {
    this.config.velocityScale = Math.max(0, Math.min(1, scale));
  }
}

// Singleton instance
export const MIDIOutput = new MIDIOutputClass();

// Also export the class for testing
export { MIDIOutputClass };
