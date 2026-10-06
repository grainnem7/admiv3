import { useEffect, useState } from 'react';
import { MIDIManager } from '../../../../midi/MIDIManager';
import type { MIDIDeviceInfo } from '../../../../midi/types';
import { ROLE_CHANNEL, type MidiSends } from '../../../../midi/boardMidi';
import { SegmentedControl } from '../ui/SegmentedControl';

export interface BoardMidiPanelProps {
  enabled: boolean;
  deviceId: string;
  sends: MidiSends;
  keepSound: boolean;
  onChange(patch: { midiEnabled?: boolean; midiDeviceId?: string; midiSends?: MidiSends; midiKeepSound?: boolean }): void;
}

type Support = 'unknown' | 'unsupported' | 'denied' | 'ready';

/**
 * MIDI out, on the Sound tab: pick the output the board's notes go to, choose whether
 * only the player's notes go or everything, and whether the built-in sound stays on.
 * The device belongs to this laptop (a rig setting), not to a player.
 */
export function BoardMidiPanel({ enabled, deviceId, sends, keepSound, onChange }: BoardMidiPanelProps): JSX.Element {
  const [support, setSupport] = useState<Support>('unknown');
  const [devices, setDevices] = useState<MIDIDeviceInfo[]>([]);

  // Ask for MIDI access only once the player turns this on: the browser prompts for it.
  useEffect(() => {
    if (!enabled) return;
    if (!MIDIManager.isSupported()) { setSupport('unsupported'); return; }
    let live = true;
    MIDIManager.initialize().then((ok) => {
      if (!live) return;
      setSupport(ok ? 'ready' : 'denied');
      if (ok) setDevices(MIDIManager.getOutputDevices());
    });
    const off = MIDIManager.onStateChange(() => { if (live) setDevices(MIDIManager.getOutputDevices()); });
    return () => { live = false; off(); };
  }, [enabled]);

  // The chosen port is selected whenever it is present, so a port plugged in later takes over.
  useEffect(() => {
    if (!enabled || support !== 'ready') return;
    MIDIManager.selectOutput(deviceId && devices.some((d) => d.id === deviceId) ? deviceId : null);
  }, [enabled, support, deviceId, devices]);

  const chosen = devices.find((d) => d.id === deviceId) ?? null;

  return (
    <div role="group" aria-label="MIDI out" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--bs-radius-md)', border: '1px solid var(--bs-border)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onChange({ midiEnabled: e.target.checked })} />
        MIDI out
      </label>
      <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
        Send the board&apos;s notes to a synth or a DAW, so any instrument can be the sound.
        {` Melody ch ${ROLE_CHANNEL.melody} · Bass ch ${ROLE_CHANNEL.bass} · Chords ch ${ROLE_CHANNEL.chord} · Drums ch ${ROLE_CHANNEL.drums} (General MIDI).`}
      </span>
      {enabled && support === 'unsupported' && (
        <span role="status" style={{ fontSize: 12, color: 'var(--bs-warn)' }}>
          This browser has no Web MIDI. Chrome or Edge do; Safari does not.
        </span>
      )}
      {enabled && support === 'denied' && (
        <span role="status" style={{ fontSize: 12, color: 'var(--bs-warn)' }}>
          MIDI access was refused. Allow it in the browser&apos;s site settings and try again.
        </span>
      )}
      {enabled && support === 'ready' && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            Send to
            <select value={chosen ? deviceId : ''} onChange={(e) => onChange({ midiDeviceId: e.target.value })}>
              <option value="">{devices.length === 0 ? 'No MIDI outputs found' : 'Choose an output…'}</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {devices.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
              Nothing to send to yet. A DAW on this laptop needs a virtual port (loopMIDI on
              Windows, the IAC bus on a Mac); a hardware synth needs its USB or MIDI lead in.
            </span>
          )}
          <span role="status" style={{ fontSize: 12, fontWeight: 600, color: chosen ? 'var(--bs-ok)' : 'var(--bs-fg2)' }}>
            {chosen ? `✓ Sending to ${chosen.name}` : deviceId ? 'The chosen output is not connected.' : ''}
          </span>
          <SegmentedControl<MidiSends>
            label="What is sent"
            value={sends}
            onChange={(v) => onChange({ midiSends: v })}
            options={[{ value: 'player', label: 'My notes only' }, { value: 'all', label: 'Everything (fill and band too)' }]}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={keepSound} onChange={(e) => onChange({ midiKeepSound: e.target.checked })} />
            Keep the built-in sound on as well
          </label>
        </>
      )}
    </div>
  );
}
