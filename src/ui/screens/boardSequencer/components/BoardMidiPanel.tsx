import { useEffect, useState } from 'react';
import {
  BAND_BASS_CHANNEL, BAND_PAD_CHANNEL, colourChannelMap, configToSoundFrom, EXTRA_NOTES_CHANNEL, hasColourChannel, LOOP_CHANNELS,
  MAX_MIDI_LEAD_MS, ROLE_CHANNEL, sharedColourChannels, soundFromToConfig, VOLUME_CHANNEL,
  type MidiChannelMode, type MidiSends, type SoundFrom,
} from '../../../../midi/boardMidi';
import { noticeMs } from '../../../../profiles/pressAgain';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { describeChannel, ROLE_LABELS } from '../../../../tracking/boardColours';
import type { BoardMidiPort } from '../useBoardMidiPort';
import { SegmentedControl } from '../ui/SegmentedControl';
import { LabeledSlider } from '../ui/LabeledSlider';
import { Button } from '../ui/Button';
import { AbletonMappingHelper } from './AbletonMappingHelper';
import { AbletonSoundsPanel, type AbletonLiveState } from './AbletonSoundsPanel';
import { ABLETON_TRACKS_NOTE } from '../abletonReady';
import { TEST_CHANNELS, TEST_GAP_MS } from '../../../../midi/boardMidi';

const TEST_CHANNEL_NAMES: Record<number, string> = {
  1: 'Melody', 2: 'Bass', 3: 'Chords', 10: 'Drums', 11: 'Band chords', 12: 'Band bass', 13: 'Extra notes',
};

export interface BoardMidiPanelProps {
  config: BoardSequencerStored;
  port: BoardMidiPort;
  running: boolean;
  /** The port went during the piece and ADMI is still playing its own sound. */
  holdOnAdmi: boolean;
  onChange(patch: Partial<BoardSequencerStored>): void;
  onSwitchBack(): void;
  /** Plays the test note; false when it could not (not playing, or muted). */
  onTestNote(): boolean;
  onPanic(): void;
  /** Phase 2: the engine's chains and sent values while playing (null when stopped). */
  getAbletonLive(): AbletonLiveState | null;
  /** "Send sound choices to Ableton". */
  onSendSounds(): void;
}

const NOTE = { fontSize: 12, color: 'var(--bs-fg2)' } as const;

/** What each part goes out on in "one channel per part", for the table. */
const PART_ROWS: { what: string; channel: number }[] = [
  { what: 'Melody', channel: ROLE_CHANNEL.melody },
  { what: 'Bass', channel: ROLE_CHANNEL.bass },
  { what: 'Chords', channel: ROLE_CHANNEL.chord },
  { what: 'All drums (General MIDI notes: kick 36, snare 38, hat 42, crash 49)', channel: ROLE_CHANNEL.drums },
  { what: 'Band chords and pad, and the final chord', channel: BAND_PAD_CHANNEL },
  { what: 'Band bass', channel: BAND_BASS_CHANNEL },
  { what: 'Extra notes', channel: EXTRA_NOTES_CHANNEL },
];

/**
 * Connections tab: where the sound comes from. ADMI is always the brain (the board, the
 * loops, the scenes, the clock, everything drawn); this only says who makes the sound.
 * The port is a setting of this laptop, like the Ableton Set it plays into.
 */
export function BoardMidiPanel({
  config, port, running, holdOnAdmi, onChange, onSwitchBack, onTestNote, onPanic, getAbletonLive, onSendSounds,
}: BoardMidiPanelProps): JSX.Element {
  const soundFrom = configToSoundFrom(config);
  const midiOn = soundFrom !== 'admi';
  const [flash, setFlash] = useState<'sent' | 'notPlaying' | null>(null);
  // The test note visits each channel in turn; this follows it, so a silent track is named.
  const [testAt, setTestAt] = useState<number | null>(null);
  useEffect(() => {
    if (flash === null) return;
    if (flash === 'notPlaying') {
      const id = window.setTimeout(() => setFlash(null), noticeMs(1200));
      return () => window.clearTimeout(id);
    }
    setTestAt(0);
    const ids = TEST_CHANNELS.map((_, i) => window.setTimeout(() => setTestAt(i), 50 + i * TEST_GAP_MS));
    ids.push(window.setTimeout(() => { setTestAt(null); setFlash(null); }, 50 + TEST_CHANNELS.length * TEST_GAP_MS));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [flash]);
  const [panicFlash, setPanicFlash] = useState(false);
  useEffect(() => {
    if (!panicFlash) return;
    const id = window.setTimeout(() => setPanicFlash(false), noticeMs(1200));
    return () => window.clearTimeout(id);
  }, [panicFlash]);

  const sounding = config.channels.filter((c) => hasColourChannel(c.role));
  const shared = sharedColourChannels(config.channels);
  const colourChannels = colourChannelMap(config.channels);
  const chosen = port.devices.find((d) => d.id === config.midiDeviceId) ?? null;

  return (
    <div role="group" aria-label="Sound from" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 'var(--bs-radius-md)', border: '1px solid var(--bs-border)' }}>
      {/* Seen as well as heard: the cheat sheet and Help say "Sound from". */}
      <span style={{ fontWeight: 600 }}>Sound from</span>
      <div style={{ fontSize: 17 }}>
        <SegmentedControl<SoundFrom>
          label="Sound from"
          value={soundFrom}
          onChange={(v) => onChange(soundFromToConfig(v))}
          options={[
            { value: 'admi', label: 'ADMI' },
            { value: 'ableton', label: 'Ableton' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>
      <span style={NOTE}>
        {soundFrom === 'admi' && "ADMI's own sound. Nothing goes out over MIDI."}
        {soundFrom === 'ableton' && 'Ableton makes the sound: everything the board plays goes to it, the band and the Extra notes too. ADMI still draws every note. Press ADMI at any time to have ADMI\u2019s own sound back.'}
        {soundFrom === 'both' && 'ADMI and Ableton play together. Use it to check the timing, or to add Ableton\u2019s sounds to ADMI\u2019s.'}
      </span>

      {midiOn && <span style={NOTE}>{ABLETON_TRACKS_NOTE}</span>}
      {midiOn && port.support === 'unsupported' && (
        <span role="status" style={{ fontSize: 13, color: 'var(--bs-warn)' }}>
          This browser has no Web MIDI. Chrome or Edge do; Safari does not. ADMI is playing its own sound.
        </span>
      )}
      {midiOn && port.support === 'denied' && (
        <span role="status" style={{ fontSize: 13, color: 'var(--bs-warn)' }}>
          MIDI access was refused. Allow it in the browser&apos;s site settings and try again. ADMI is playing its own sound.
        </span>
      )}

      {midiOn && port.support === 'ready' && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
            MIDI port
            <select value={chosen ? config.midiDeviceId : ''} onChange={(e) => onChange({ midiDeviceId: e.target.value })}>
              <option value="">{port.devices.length === 0 ? 'No MIDI outputs found' : 'Choose a port…'}</option>
              {port.devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {port.devices.length === 0 && (
            <span style={NOTE}>
              Nothing to send to yet. Open loopMIDI and check there is a port called ADMI (start loopMIDI before
              Chrome). A hardware synth needs its USB or MIDI lead in.
            </span>
          )}
          <span role="status" style={{ fontSize: 13, fontWeight: 600, color: port.connected && !holdOnAdmi ? 'var(--bs-ok)' : 'var(--bs-warn)' }}>
            {port.connected && !holdOnAdmi && `✓ Sending to ${port.chosenName ?? 'the port'}`}
            {port.connected && holdOnAdmi && 'The port is back. ADMI is still playing its own sound until you switch.'}
            {!port.connected && (config.midiDeviceId
              ? 'The chosen port is not connected, so ADMI is playing its own sound.'
              : 'Choose the port. Until then ADMI plays its own sound.')}
          </span>
          {port.connected && holdOnAdmi && (
            <div><Button tone="primary" onClick={onSwitchBack}>Switch to Ableton</Button></div>
          )}

          {soundFrom === 'both' && (
            <SegmentedControl<MidiSends>
              label="What goes out in Both" showLabel
              value={config.midiSends}
              onChange={(v) => onChange({ midiSends: v })}
              options={[{ value: 'player', label: 'The player\u2019s notes only' }, { value: 'all', label: 'Everything (band and Extra notes too)' }]}
            />
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={config.midiLoopChannels}
              onChange={(e) => onChange({ midiLoopChannels: e.target.checked })}
            />
            <span>
              <strong>A fader per loop in Ableton</strong>
              <span style={{ display: 'block', ...NOTE }}>
                Loops 1 to 6 play their melody, bass and chords on channels 4 to 9, so each loop has its own Ableton
                track and fades smoothly. A loop&apos;s drums stay on the drum track (10) and fade by how hard they play.
              </span>
            </span>
          </label>

          <SegmentedControl<MidiChannelMode>
            label="Channels" showLabel
            value={config.midiChannelMode}
            onChange={(v) => onChange({ midiChannelMode: v })}
            options={[{ value: 'part', label: 'One per part' }, { value: 'colour', label: 'One per colour' }]}
          />
          {config.midiChannelMode === 'colour' && (
            <span style={NOTE}>
              Each colour gets a track for its job: melody colours 1, 14 and 15 in turn, bass 2, chords 3. New colours
              each session are fine: they take their job&apos;s tracks in the order of the colour list, so turning one off
              moves the later ones up.
            </span>
          )}
          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <caption style={{ ...NOTE, textAlign: 'left' }}>What goes out on each MIDI channel</caption>
            <thead>
              <tr><th scope="col" style={{ textAlign: 'left' }}>What plays</th><th scope="col" style={{ textAlign: 'left' }}>Channel</th></tr>
            </thead>
            <tbody>
              {config.midiChannelMode === 'colour' && sounding.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: c.swatch, marginRight: 6, verticalAlign: 'middle' }} />
                    {`${describeChannel(c)} · ${ROLE_LABELS[c.role]}`}
                  </td>
                  <td>{colourChannels.get(c.id) ?? ''}</td>
                </tr>
              ))}
              {(config.midiChannelMode === 'part' ? PART_ROWS : PART_ROWS.slice(3)).map((r) => (
                <tr key={r.what}><td>{r.what}</td><td>{r.channel}</td></tr>
              ))}
              {config.midiLoopChannels && LOOP_CHANNELS.map((ch, i) => (
                <tr key={`loop-${ch}`}>
                  <td>{i === LOOP_CHANNELS.length - 1 ? `Loop ${i + 1} and after: melody, bass, chords` : `Loop ${i + 1}: melody, bass, chords`}</td>
                  <td>{ch}</td>
                </tr>
              ))}
              <tr><td>Volume counter (CC 7, for Ableton&apos;s Main volume)</td><td>{VOLUME_CHANNEL}</td></tr>
            </tbody>
          </table>
          {config.midiChannelMode === 'colour' && shared.size > 0 && (
            <span role="status" style={{ fontSize: 13, color: 'var(--bs-warn)' }}>
              {[...shared.entries()].map(([ch, ids]) => `${ids.map((id) => {
                const c = config.channels.find((x) => x.id === id);
                return c ? describeChannel(c) : id;
              }).join(' and ')} share channel ${ch}`).join('; ')}. They will play the same Ableton instrument.
            </span>
          )}
          <span style={NOTE}>
            Every channel in use also gets CC 11 (Expression): it carries ADMI&apos;s fades and Mute. In Ableton,
            map it to a Utility device&apos;s Gain on each track; the setup guide shows how.
          </span>

          <AbletonSoundsPanel config={config} getLive={getAbletonLive} onSend={onSendSounds} connected={port.connected} />

          <AbletonMappingHelper config={config} connected={port.connected} />

          <LabeledSlider
            label="Send early by"
            value={config.midiLeadMs}
            min={0}
            max={MAX_MIDI_LEAD_MS}
            step={1}
            display={`${config.midiLeadMs} ms`}
            onChange={(v) => onChange({ midiLeadMs: v })}
          />
          <span style={NOTE}>
            For Both: sends Ableton its notes a little early, so ADMI and Ableton land together. Leave it at 0
            unless the test note flams.
          </span>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              tone="secondary"
              disabled={!running}
              reason={running ? null : 'Press ▶ Play the board first (an empty board is fine).'}
              onClick={() => setFlash(onTestNote() ? 'sent' : 'notPlaying')}
            >
              Play test note
            </Button>
            <span
              role="status"
              aria-live="polite"
              style={{
                padding: '4px 10px', borderRadius: 'var(--bs-radius-md)', fontWeight: 700,
                background: flash === 'sent' ? 'var(--bs-accent)' : 'transparent',
                color: flash === 'sent' ? 'var(--bs-bg)' : 'var(--bs-fg2)',
              }}
            >
              {flash === 'sent' && testAt !== null
                ? `♪ ch ${TEST_CHANNELS[testAt]}: ${TEST_CHANNEL_NAMES[TEST_CHANNELS[testAt]] ?? ''}`
                : flash === 'notPlaying' ? 'Not sent: unmute first.' : ''}
            </span>
          </div>
          <ol style={{ ...NOTE, margin: 0, paddingLeft: 18 }}>
            <li>Set Ableton&apos;s buffer size to 128 samples.</li>
            <li>Choose Both, press Play, then Play test note: ADMI clicks and Ableton plays a note at the same moment.</li>
            <li>A double hit (a flam) means they are apart: move Send early by until they land together.</li>
            <li>Then choose Ableton.</li>
            <li>After the first note it plays one note on each channel in turn (1, 2, 3, 10, 11, 12, 13), named here as it goes: a silent one is a track missing in Ableton.</li>
          </ol>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button tone="danger" onClick={() => { onPanic(); setPanicFlash(true); }}>Panic</Button>
            <span role="status" style={{ ...NOTE, fontWeight: panicFlash ? 700 : 400, color: panicFlash ? 'var(--bs-fg)' : 'var(--bs-fg2)' }}>
              {panicFlash ? 'Sent: every note off, all sound off.' : 'Stops any note Ableton is stuck on, on all 16 channels. The piece carries on.'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
