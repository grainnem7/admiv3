/**
 * Music Modules Index
 *
 * Re-exports all music processing modules.
 */

export {
  Arpeggiator,
  getArpeggiator,
  type ArpPattern,
  type ArpRate,
  type ArpeggiatorConfig,
  type ArpNote,
  type ArpNoteCallback,
} from './Arpeggiator';

export {
  Sequencer,
  getSequencer,
  type SequencerStep,
  type SequencerTrack,
  type SequencerConfig,
  type SequencerNoteCallback,
  type SequencerStepCallback,
} from './Sequencer';
