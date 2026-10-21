import { useEffect, useMemo, useState } from 'react';
import { BoardMidiSender, colourChannelMap, mappingTargets } from '../../../../midi/boardMidi';
import { abletonMappingTargets } from '../../../../midi/abletonSounds';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { planFromConfig } from './AbletonSoundsPanel';

const NOTE = { fontSize: 12, color: 'var(--bs-fg2)' } as const;

type MapGroup = 'fades' | 'sounds';

/**
 * Connections tab: map ADMI's controls in the Ableton template, one at a time. Ableton's
 * MIDI Map Mode learns from the last message it hears, so each press sends one controller
 * on one channel only, then moves on to the next. Two sets: the fades and Volume (CC 11,
 * CC 7), and the sounds (each Rack's Chain selector on CC 30, macros on CC 24 to 26, and
 * Space, Energy and Groove on channel 16). Works stopped or playing; it needs only the port.
 */
export function AbletonMappingHelper({ config, connected }: {
  config: BoardSequencerStored;
  connected: boolean;
}): JSX.Element {
  const [group, setGroup] = useState<MapGroup>('fades');
  const targets = useMemo(() => (group === 'fades'
    ? mappingTargets(config.midiChannelMode === 'colour' ? colourChannelMap(config.channels) : undefined, config.midiLoopChannels)
    : abletonMappingTargets(planFromConfig(config))), [group, config]);
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<string | null>(null);
  const sender = useMemo(() => new BoardMidiSender({ currentTime: 0 }), []);
  useEffect(() => { setIndex(0); }, [group]);
  useEffect(() => { if (index >= targets.length) setIndex(0); }, [index, targets.length]);
  const target = targets[Math.min(index, targets.length - 1)];

  const send = (): void => {
    sender.sendForMapping(target, config.volume);
    setSent(`Sent: ${target.what}, CC ${target.cc}.`);
    setIndex((i) => (i + 1) % targets.length);
  };

  return (
    <div role="group" aria-label="Map in Ableton" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--bs-radius-md)', border: '1px solid var(--bs-border)' }}>
      <span style={{ fontWeight: 600 }}>Map in Ableton (once, when setting up the template)</span>
      <SegmentedControl<MapGroup>
        label="What to map"
        value={group}
        onChange={setGroup}
        options={[{ value: 'fades', label: 'Fades and volume' }, { value: 'sounds', label: 'Sounds and macros' }]}
      />
      <ol style={{ ...NOTE, margin: 0, paddingLeft: 18 }}>
        <li>Stop ADMI first: in Ctrl+M Ableton learns from any MIDI it hears, notes included.</li>
        <li>In Ableton press Ctrl+M (the screen turns blue).</li>
        {group === 'fades'
          ? <li>Click the Utility&apos;s Gain on the track named below, then press Send here.</li>
          : <li>Click the control named below on that track&apos;s Instrument Rack (its Chain selector, or macro 1, 2 or 3), then press Send here.</li>}
        <li>Send moves on to the next one by itself. Repeat for each.</li>
        {group === 'fades'
          ? <li>Still in Ctrl+M, look at the Mappings list on the left of Ableton: set <strong>Max</strong> to <strong>0 dB</strong> on every Gain mapping, or full Expression will be far too loud.</li>
          : <li>Chain selectors keep their full range (0 to 127): each chain&apos;s zone does the choosing.</li>}
        <li>Press Ctrl+M again to finish, and save the Set.{group === 'fades' ? ' The tracks stay silent until ADMI plays (Play sends full Expression).' : ''}</li>
      </ol>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
          Next to map
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {targets.map((t, i) => <option key={`${t.cc}-${t.channel}`} value={i}>{t.what}</option>)}
          </select>
        </label>
        <Button
          tone="primary"
          disabled={!connected || !target}
          reason={connected ? null : 'Choose the port first.'}
          onClick={send}
        >
          {target ? `Send CC ${target.cc} on ch ${target.channel}` : 'Send'}
        </Button>
      </div>
      <span role="status" aria-live="polite" style={{ ...NOTE, fontWeight: sent ? 600 : 400 }}>{sent ?? ''}</span>
    </div>
  );
}
