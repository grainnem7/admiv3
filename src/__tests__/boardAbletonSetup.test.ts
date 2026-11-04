import { describe, it, expect } from 'vitest';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, type BoardSequencerStored } from '../profiles/BoardSequencerConfig';
import { splitBoardConfig, resolveBoardConfig } from '../profiles/BoardProfiles';
import { MIDIManagerClass } from '../midi/MIDIManager';
import { abletonReadyItem } from '../ui/screens/boardSequencer/abletonReady';

describe('Ableton settings are kept safe', () => {
  it('defaults: one channel per part, nothing sent early', () => {
    const c = sanitizeBoardSequencerConfig({});
    expect(c?.midiChannelMode).toBe('part');
    expect(c?.midiLeadMs).toBe(0);
  });

  it('bad values become safe ones', () => {
    const c = sanitizeBoardSequencerConfig({
      version: DEFAULT_BOARD_SEQUENCER_CONFIG.version,
      midiChannelMode: 'nonsense', midiLeadMs: 500,
      channels: [
        { id: 'a', kind: 'hue', role: 'melody', swatch: '#f00', midiChannel: 5 },
        { id: 'b', kind: 'hue', role: 'melody', swatch: '#0f0', midiChannel: 17 },
        { id: 'c', kind: 'hue', role: 'melody', swatch: '#00f', midiChannel: 2.5 },
      ],
    });
    expect(c?.midiChannelMode).toBe('part');
    expect(c?.midiLeadMs).toBe(40);
    expect(c?.channels.map((x) => x.midiChannel)).toEqual([5, undefined, undefined]);
    expect(sanitizeBoardSequencerConfig({ midiChannelMode: 'colour', midiLeadMs: 12 })?.midiChannelMode).toBe('colour');
  });

  it('they belong to the laptop (the rig), not to a player', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      midiChannelMode: 'colour', midiLeadMs: 15,
      channels: [{ id: 'a', kind: 'hue', role: 'melody', swatch: '#f00', midiChannel: 7, instrument: 'harp' }],
    };
    const { rig, settings, channelSettings } = splitBoardConfig(cfg);
    expect(rig.fields.midiChannelMode).toBe('colour');
    expect(rig.fields.midiLeadMs).toBe(15);
    expect('midiChannelMode' in settings).toBe(false);
    expect('midiLeadMs' in settings).toBe(false);
    expect(rig.channels[0].midiChannel).toBe(7);
    expect('midiChannel' in channelSettings.a).toBe(false);
    // Another player on the same laptop gets the same routing.
    const other = resolveBoardConfig(rig, { id: 'p2', name: 'P2', settings: {}, channelSettings: { a: { role: 'melody' } } });
    expect(other.channels[0].midiChannel).toBe(7);
    expect(other.midiChannelMode).toBe('colour');
  });
});

describe('MIDIManager: connected-only methods, added beside the old ones', () => {
  function manager(state: 'connected' | 'disconnected') {
    const out = { id: 'p1', name: 'ADMI', state, send: () => {} };
    const m = new MIDIManagerClass();
    (m as unknown as { midiAccess: { outputs: Map<string, typeof out>; inputs: Map<string, unknown> } }).midiAccess = {
      outputs: new Map([['p1', out]]), inputs: new Map<string, unknown>(),
    };
    m.selectOutput('p1');
    return { m, out };
  }

  it('a disconnected port: null from the new methods, and getSelectedOutput as before', () => {
    const { m, out } = manager('disconnected');
    expect(m.getConnectedSelectedOutput()).toBeNull();
    expect(m.isSelectedConnected()).toBe(false);
    expect(m.getSelectedOutput()).toBe(out);
  });

  it('a connected port is returned by all three', () => {
    const { m, out } = manager('connected');
    expect(m.getConnectedSelectedOutput()).toBe(out);
    expect(m.isSelectedConnected()).toBe(true);
    expect(m.getSelectedOutput()).toBe(out);
  });
});

describe('the Ready check line about Ableton', () => {
  const base = { deviceId: 'p1', connected: true, portName: 'ADMI', holdOnAdmi: false };
  it('ADMI with no port: nothing to say', () => {
    expect(abletonReadyItem({ ...base, soundFrom: 'admi', deviceId: '' })).toBeNull();
  });
  it('a port chosen but Sound from is ADMI: check', () => {
    expect(abletonReadyItem({ ...base, soundFrom: 'admi' })?.state).toBe('warn');
    expect(abletonReadyItem({ ...base, soundFrom: 'admi' })?.label).toBe('A MIDI port is chosen but Sound from is Timbo');
  });
  it('Ableton with the port: ok, and it says only "port connected" and points to the test note', () => {
    const item = abletonReadyItem({ ...base, soundFrom: 'ableton' });
    expect(item?.state).toBe('ok');
    expect(item?.label).toContain('MIDI port ADMI connected');
    expect(item?.label).toContain('test note');
  });
  it('Ableton without the port: a problem, with the fix', () => {
    const item = abletonReadyItem({ ...base, soundFrom: 'ableton', connected: false });
    expect(item?.state).toBe('problem');
    expect(item?.fix).toContain('loopMIDI');
    // The port keeps its real name; the app is Timbo.
    expect(item?.fix).toBe('Open loopMIDI, check the port ADMIOutput is there, then choose it on the Connections tab. Until then Timbo plays its own sound.');
    expect(abletonReadyItem({ ...base, soundFrom: 'both', connected: false })?.label).toBe('Sound from is Ableton and Timbo, but the MIDI port is missing');
  });
  it('the port is back but ADMI is still playing: check', () => {
    expect(abletonReadyItem({ ...base, soundFrom: 'both', holdOnAdmi: true })?.state).toBe('warn');
    expect(abletonReadyItem({ ...base, soundFrom: 'both', holdOnAdmi: true })?.label).toBe('Timbo is still playing its own sound');
  });
});

import { createBoardPlayer, listBoardPlayers, PLAYERS_KEY } from '../profiles/BoardProfiles';
import { NEW_PLAYER_SOUND } from '../profiles/BoardSequencerConfig';

describe('new players hear only their counters; saved players keep theirs', () => {
  it('a new player has Extra notes and Sounds change off, and loops play as saved', () => {
    localStorage.clear();
    const p = createBoardPlayer('Tim', 'right');
    expect(p.settings.fillAmount).toBe(0);
    expect(p.settings.evolveAmount).toBe(0);
    expect(NEW_PLAYER_SOUND).toEqual({ fillAmount: 0, evolveAmount: 0 });
    expect(sanitizeBoardSequencerConfig({})?.loopVary).toBe(0);
  });

  it('a loaded player keeps 0, and a missing value stays 0 (never the new defaults)', () => {
    localStorage.clear();
    localStorage.setItem(PLAYERS_KEY, JSON.stringify([{ id: 'p1', name: 'Old', settings: { fillAmount: 0, evolveAmount: 0 }, channelSettings: {} }]));
    expect(listBoardPlayers()[0].settings.fillAmount).toBe(0);
    const kept = sanitizeBoardSequencerConfig({ fillAmount: 0, evolveAmount: 0 });
    expect(kept?.fillAmount).toBe(0);
    expect(kept?.evolveAmount).toBe(0);
    const missing = sanitizeBoardSequencerConfig({});
    expect(missing?.fillAmount).toBe(0);
    expect(missing?.evolveAmount).toBe(0);
  });

  it('loop channels: off by default, a rig setting', () => {
    expect(sanitizeBoardSequencerConfig({})?.midiLoopChannels).toBe(false);
    expect(sanitizeBoardSequencerConfig({ midiLoopChannels: true })?.midiLoopChannels).toBe(true);
    const { rig, settings } = splitBoardConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, midiLoopChannels: true });
    expect(rig.fields.midiLoopChannels).toBe(true);
    expect('midiLoopChannels' in settings).toBe(false);
  });
});
