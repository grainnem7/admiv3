import { useEffect, useMemo, useState } from 'react';
import {
  abletonChecklist, abletonPlan, CHAIN_CC, chainLabel, chainRange, controlKey,
} from '../../../../midi/abletonSounds';
import { colourChannelMap } from '../../../../midi/boardMidi';
import { noticeMs } from '../../../../profiles/pressAgain';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';

const NOTE = { fontSize: 14, color: 'var(--bs-fg2)' } as const;

export interface AbletonLiveState {
  chains: ReadonlyMap<number, number>;
  sent: ReadonlyMap<string, number>;
}

/** The plan from the settings alone (no Evolve), for when nothing is playing. */
export function planFromConfig(config: BoardSequencerStored): ReturnType<typeof abletonPlan> {
  return abletonPlan({
    channels: config.channels,
    world: config.soundWorld,
    channelMode: config.midiChannelMode,
    colourChannels: config.midiChannelMode === 'colour' ? colourChannelMap(config.channels) : undefined,
    energy: config.energy,
    space: config.space,
    swing: config.swing,
    loopChannels: config.midiLoopChannels,
    playerTrack: config.playerTrack,
  });
}

/**
 * Connections tab, Phase 2: which Rack chain each Ableton track is on now, the last CC 30
 * sent, the button to send everything again (after Ableton restarts), and the checklist
 * of chains and zones for building the template's racks.
 */
export function AbletonSoundsPanel({ config, getLive, onSend, connected }: {
  config: BoardSequencerStored;
  /** The engine's view while playing: chains with Evolve, and what was really sent. Null when stopped. */
  getLive(): AbletonLiveState | null;
  onSend(): void;
  connected: boolean;
}): JSX.Element {
  const planned = useMemo(() => planFromConfig(config), [config]);
  const checklist = useMemo(
    () => abletonChecklist({ channelMode: config.midiChannelMode, loopChannels: config.midiLoopChannels }),
    [config.midiChannelMode, config.midiLoopChannels],
  );
  const [live, setLive] = useState<AbletonLiveState | null>(() => getLive());
  useEffect(() => {
    const id = window.setInterval(() => setLive(getLive()), 1000);
    return () => window.clearInterval(id);
  }, [getLive]);
  const [sentNote, setSentNote] = useState(false);
  const chains = live?.chains ?? planned.chains;
  const rows = [...chains.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div role="group" aria-label="Sounds in Ableton" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--bs-radius-md)', border: '1px solid var(--bs-border)' }}>
      <span style={{ fontWeight: 600 }}>Sounds in Ableton</span>
      <span style={NOTE}>
        Timbo picks each track&apos;s Instrument Rack chain with CC 30, so a colour card&apos;s sound, the World, a
        scene&apos;s World and Sounds change switch Ableton&apos;s sound too. A track without a rack ignores it.
      </span>
      <table style={{ fontSize: 14, borderCollapse: 'collapse' }}>
        <caption style={{ ...NOTE, textAlign: 'left' }}>Each channel&apos;s chain now</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left' }}>Channel</th>
            <th scope="col" style={{ textAlign: 'left' }}>Chain</th>
            <th scope="col" style={{ textAlign: 'left' }}>Last CC 30 sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([ch, chain]) => (
            <tr key={ch}>
              <td>{ch}</td>
              <td>{chainLabel(chain)}</td>
              <td>{live ? (live.sent.get(controlKey(ch, CHAIN_CC)) ?? 'not yet') : 'sent on Play'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {planned.shares.size > 0 && (
        <span role="status" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>
          Some colours share a channel (one per part): Ableton plays one sound for each pair. Choose One per colour above to give each its own.
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          tone="secondary"
          disabled={!connected}
          reason={connected ? null : 'Choose the port first.'}
          onClick={() => { onSend(); setSentNote(true); window.setTimeout(() => setSentNote(false), noticeMs(1500)); }}
        >
          Send sound choices to Ableton
        </Button>
        <span role="status" style={NOTE}>{sentNote ? 'Sent: every chain and macro.' : 'After Ableton is restarted, or if a track is on the wrong sound.'}</span>
      </div>
      <Disclosure summary="Template checklist: the 33 sounds, and which each track holds">
        <span style={NOTE}>
          Changing from the 16-sound racks? On every track except the drums (channel 10): rename chains 11, 14, 15 and
          16, add chains 17 to 33 with the placeholder, then drag chain 33&rsquo;s zone out to end at 127, select every
          chain and choose Distribute Ranges Equally. Then check in the ruler that chains 4, 18 and 30 start at{' '}
          {chainRange(3)[0]}, {chainRange(17)[0]} and {chainRange(29)[0]}.
        </span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 14, borderCollapse: 'collapse' }}>
            <caption style={{ ...NOTE, textAlign: 'left' }}>Melody, Bass and Chords have every one of these chains, named exactly, in this order. Real: a real instrument on that track. Placeholder: the chain left empty, or the light stand-in. Band, Extra notes and Loops need only the four World chains, zones 0 to 2, 3 to 5, 6 to 8 and 9 to 127 set by hand.</caption>
            <thead>
              <tr>
                {['Chain', 'Name', 'Zone (CC 30)', 'Melody', 'Chords', 'Bass', 'Band, Extra notes and Loops'].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: 'left', paddingRight: 8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checklist.map((r) => (
                <tr key={r.index}>
                  <td>{r.index + 1}</td>
                  <td>{r.name}</td>
                  <td>{`${r.range[0]} to ${r.range[1]}`}</td>
                  {[r.melody, r.chords, r.bass, r.others].map((real, i) => (
                    <td key={i} style={{ color: real ? 'var(--bs-fg)' : 'var(--bs-fg2)', fontWeight: real ? 600 : 400 }}>{real ? 'Real' : 'Placeholder'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span style={NOTE}>Placeholder: an empty chain, or Operator with its default sound. Timbo never sends a track to a chain it does not hold. In One per colour mode the melody colours use tracks 1, 14 and 15: build three Melody tracks first. A fader per loop needs the Loop 1 to 6 tracks first.</span>
        <span style={NOTE}>Macros on every chain: 1 Volume (CC 24), 2 Brightness (CC 25), 3 Space (CC 26). Echo is CC 27.</span>
        {config.midiChannelMode === 'part' && config.playerTrack !== null && (
          <span style={NOTE}>
            {`Your counters play on their own track: MIDI channel ${config.playerTrack}. Build one more track for them (the demo calls it “Tim’s glow”): MIDI From the port ADMIOutput, channel ${config.playerTrack}, Monitor In, with one soft pad and no rack.`}
          </span>
        )}
      </Disclosure>
    </div>
  );
}
