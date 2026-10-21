/**
 * The Board Sequencer's MIDI port, watched for the whole screen (not only while the
 * Connections tab is open): asks the browser for MIDI once MIDI is wanted, selects the
 * chosen output whenever it is present, and says whether it is connected right now, so
 * the fallback to ADMI's own sound can happen mid-piece.
 *
 * Uses only MIDIManager's existing state-change callbacks and its connected-only
 * methods; nothing it does changes MIDI anywhere else in ADMI.
 */
import { useEffect, useState } from 'react';
import { MIDIManager } from '../../../midi/MIDIManager';
import type { MIDIDeviceInfo } from '../../../midi/types';

export type MidiSupport = 'off' | 'unknown' | 'unsupported' | 'denied' | 'ready';

export interface BoardMidiPort {
  support: MidiSupport;
  /** The MIDI outputs on this laptop. */
  devices: MIDIDeviceInfo[];
  /** The chosen output is there and connected now. */
  connected: boolean;
  /** The chosen output's name, when it is listed. */
  chosenName: string | null;
}

export function useBoardMidiPort(wanted: boolean, deviceId: string): BoardMidiPort {
  const [support, setSupport] = useState<MidiSupport>('off');
  const [devices, setDevices] = useState<MIDIDeviceInfo[]>([]);

  // Ask for MIDI access only once it is wanted: the browser prompts for it.
  useEffect(() => {
    if (!wanted) { setSupport('off'); return; }
    if (!MIDIManager.isSupported()) { setSupport('unsupported'); return; }
    let live = true;
    setSupport((s) => (s === 'ready' ? s : 'unknown'));
    MIDIManager.initialize().then((ok) => {
      if (!live) return;
      setSupport(ok ? 'ready' : 'denied');
      if (ok) setDevices(MIDIManager.getOutputDevices());
    }).catch(() => { if (live) setSupport('denied'); });
    const off = MIDIManager.onStateChange(() => {
      if (live) setDevices(MIDIManager.getOutputDevices());
    });
    return () => { live = false; off(); };
  }, [wanted]);

  // Worked out from the same render's device list, never a step behind it: a stale "not
  // connected" while MIDI is being switched back on would hold ADMI's sound for nothing.
  const present = wanted && support === 'ready' && deviceId !== ''
    && devices.some((d) => d.id === deviceId && d.state === 'connected');

  // The chosen port is selected whenever it is present, so a port plugged in later takes over.
  useEffect(() => {
    if (support !== 'ready') return;
    if (present) MIDIManager.selectOutput(deviceId);
    else if (deviceId === '') MIDIManager.selectOutput(null);
  }, [support, deviceId, present]);

  const chosen = devices.find((d) => d.id === deviceId) ?? null;
  return { support, devices, connected: present, chosenName: chosen ? chosen.name : null };
}
