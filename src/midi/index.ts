/**
 * MIDI Module - Web MIDI API integration
 *
 * Provides MIDI output capability to send notes, control changes,
 * and other MIDI messages to external apps and hardware.
 */

import { MIDIManager } from './MIDIManager';

export { MIDIManager } from './MIDIManager';
export { MIDIOutput } from './MIDIOutput';
export {
  type MIDIDeviceInfo,
  type MIDIChannelAssignment,
  type MIDIOutputConfig,
  type MIDIMessage,
  type MIDIMessageType,
  type VoiceType,
  DEFAULT_CHANNEL_ASSIGNMENT,
  DEFAULT_MIDI_CONFIG,
  MIDI_CC,
  getChannelForVoice,
} from './types';

/**
 * Get the singleton MIDI manager instance
 */
export function getMIDIManager() {
  return MIDIManager;
}
