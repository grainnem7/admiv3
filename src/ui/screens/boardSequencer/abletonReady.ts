/**
 * The Ready check's line about Ableton. MIDI only goes one way, so ADMI can see that the
 * port is there but not that Ableton is listening: the label says "port connected" and
 * points to the test note, which is how to hear it.
 */
import type { SoundFrom } from '../../../midi/boardMidi';
import type { ReadyItem } from './play/ReadyCheck';

export function abletonReadyItem(p: {
  soundFrom: SoundFrom;
  deviceId: string;
  connected: boolean;
  portName: string | null;
  holdOnAdmi: boolean;
}): ReadyItem | null {
  const name = p.portName ?? 'ADMI';
  if (p.soundFrom === 'admi') {
    return p.deviceId === ''
      ? null
      : { label: 'A MIDI port is chosen but Sound from is ADMI', state: 'warn', fix: 'If Ableton should play, choose Ableton or Both under Sound from on the Connections tab.', place: 'connections' };
  }
  const who = p.soundFrom === 'both' ? 'Ableton and ADMI' : 'Ableton';
  if (p.deviceId === '' || !p.connected) {
    return {
      label: `Sound from is ${who}, but the MIDI port is missing`,
      state: 'problem',
      fix: 'Open loopMIDI, check the ADMI port is there, then choose it on the Connections tab. Until then ADMI plays its own sound.',
      place: 'connections',
    };
  }
  if (p.holdOnAdmi) {
    return { label: 'ADMI is still playing its own sound', state: 'warn', fix: 'The port is back: press "Switch to Ableton" in the banner, or on the Connections tab.', place: 'connections' };
  }
  return { label: `MIDI port ${name} connected (play the test note on the Connections tab to hear Ableton)`, state: 'ok' };
}

/** What every Ableton Set needs for the band and the AI: said whenever Ableton plays. */
export const ABLETON_TRACKS_NOTE = 'Extra notes play on channel 13 and the band on 11 and 12. Check Ableton has a track on each (MIDI From = the ADMI port, that channel, Monitor In).';

/**
 * ADMI can't see Ableton's tracks (MIDI only goes one way), so this is always "check":
 * the test note plays on every channel in turn, and a silent one is a missing track.
 */
export function abletonTracksItem(soundFrom: SoundFrom): ReadyItem | null {
  if (soundFrom === 'admi') return null;
  return {
    label: 'Ableton has tracks for the band (11, 12) and Extra notes (13)?',
    state: 'warn',
    fix: `${ABLETON_TRACKS_NOTE} Play test note on the Connections tab plays each channel in turn: a gap is a missing track.`,
    place: 'connections',
  };
}
