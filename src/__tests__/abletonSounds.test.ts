import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
  ABLETON_CHAINS, abletonMappingTargets, abletonPlan, CHAIN_CC, chainCcValue, chainFor, chainForVoice, chainZone,
  changedControls, controlKey, counterControls, grooveCc, type AbletonPlanInput,
} from '../midi/abletonSounds';
import { allEvolveVoices } from '../audio/evolve/evolve';
import { SOUND_WORLDS } from '../audio/worlds/soundWorlds';
import {
  assignColourChannels, channelFor, channelsInUse, loopSlotOf, testSequenceEvents, TEST_CHANNELS, TEST_GAP_MS,
} from '../midi/boardMidi';
import type { ColourChannel } from '../tracking/boardColours';
import { aiOffLine } from '../ui/screens/boardSequencer/aiStatus';
import { abletonTracksItem } from '../ui/screens/boardSequencer/abletonReady';

const port = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../midi/MIDIManager', () => ({
  MIDIManager: { getSelectedOutput: () => port, getConnectedSelectedOutput: () => port, isSelectedConnected: () => true },
}));

const colour = (id: string, role: ColourChannel['role'], extra: Partial<ColourChannel> = {}): ColourChannel =>
  ({ id, kind: 'hue', role, swatch: '#f00', ...extra });
const base = (channels: ColourChannel[], extra: Partial<AbletonPlanInput> = {}): AbletonPlanInput => ({
  channels, world: 'warm', channelMode: 'part', energy: 0.5, space: 0.5, swing: 0, ...extra,
});

describe('the chain list', () => {
  it('16 chains, CC 30 value = index × 8, zones of 8', () => {
    expect(ABLETON_CHAINS).toHaveLength(16);
    expect(ABLETON_CHAINS.map((c) => c.index)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(chainCcValue(6)).toBe(48);
    expect(chainZone(15)).toEqual([120, 127]);
  });
});

describe('chainFor: the rule for a colour', () => {
  it('its own instrument first', () => {
    expect(chainFor(colour('a', 'melody', { instrument: 'harp' }), 'warm')).toBe(6);
    expect(chainFor(colour('a', 'bass', { instrument: 'bassElectric' }), 'ambient')).toBe(12);
    expect(chainFor(colour('a', 'chord', { instrument: 'chord' }), 'lofi')).toBe(14);
  });
  it('else the World', () => {
    expect(chainFor(colour('a', 'melody'), 'warm')).toBe(0);
    expect(chainFor(colour('a', 'bass'), 'lofi')).toBe(1);
    expect(chainFor(colour('a', 'chord'), 'ambient')).toBe(2);
    expect(chainFor(colour('a', 'melody'), 'electronic')).toBe(3);
  });
  it('My picks: Electric piano, or Electric bass for a bass', () => {
    expect(chainFor(colour('a', 'melody'), 'none')).toBe(5);
    expect(chainFor(colour('a', 'bass'), 'none')).toBe(12);
  });
  it('drums by World only; controls have none', () => {
    expect(chainFor(colour('a', 'drums', { drum: 'snare' }), 'ambient')).toBe(2);
    expect(chainFor(colour('a', 'volume'), 'warm')).toBeNull();
  });
});

describe('chainForVoice: Evolve', () => {
  it('every Evolve voice and every world voice maps to a chain', () => {
    const voices = [...allEvolveVoices()];
    expect(voices.length).toBeGreaterThan(10);
    for (const v of voices) {
      const c = chainForVoice(v);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(16);
    }
    for (const w of Object.values(SOUND_WORLDS)) for (const spec of Object.values(w.voices)) expect(chainForVoice(spec)).toBeLessThan(16);
  });
  it('by sample first, then by synth layer', () => {
    expect(chainForVoice({ name: 'x', spec: { sample: 'harp' } })).toBe(6);
    expect(chainForVoice({ name: 'x', spec: { sample: 'contrabass', synth: 'sub' } })).toBe(12);
    expect(chainForVoice({ name: 'x', spec: { sample: 'padChoir' } })).toBe(13);
    expect(chainForVoice({ name: 'x', spec: { synth: 'pad' } })).toBe(13);
    expect(chainForVoice({ name: 'x', spec: { synth: 'bell' } })).toBe(15);
    expect(chainForVoice({ name: 'x', spec: { synth: 'sawBass' } })).toBe(12);
    expect(chainForVoice({ name: 'x', spec: { synth: 'supersaw' } })).toBe(3);
  });
});

describe('the plan', () => {
  it('per part: the first colour of a part owns the channel, and the share is reported', () => {
    const plan = abletonPlan(base([colour('cyan', 'melody', { instrument: 'harp' }), colour('pink', 'melody', { instrument: 'organ' })]));
    expect(plan.controls.get(controlKey(1, CHAIN_CC))?.value).toBe(48);
    expect(plan.shares.get('pink')).toEqual({ channel: 1, withId: 'cyan' });
  });
  it('per colour: each colour on its own channel, independent', () => {
    const plan = abletonPlan(base(
      [colour('cyan', 'melody', { instrument: 'harp' }), colour('pink', 'melody', { instrument: 'organ' })],
      { channelMode: 'colour', colourChannels: new Map([['cyan', 1], ['pink', 4]]) },
    ));
    expect(plan.controls.get(controlKey(4, CHAIN_CC))?.value).toBe(56);
    expect(plan.shares.size).toBe(0);
  });
  it('band, Extra notes and drums follow the World; loops too when they have channels', () => {
    const plan = abletonPlan(base([colour('a', 'melody', { instrument: 'harp' })], { world: 'ambient', loopChannels: true }));
    for (const ch of [10, 11, 12, 13, 4, 9]) expect(plan.controls.get(controlKey(ch, CHAIN_CC))?.value).toBe(16);
  });
  it('macros from the card steps, overall on channel 16', () => {
    const plan = abletonPlan(base([colour('a', 'melody', { volume: 0.4, tone: 1, reverbSend: 0.3 })], { energy: 1, space: 0.1, swing: 0.5 }));
    expect(plan.controls.get(controlKey(1, 24))?.value).toBe(0);
    expect(plan.controls.get(controlKey(1, 25))?.value).toBe(127);
    expect(plan.controls.get(controlKey(1, 26))?.value).toBe(85);
    expect(plan.controls.get(controlKey(16, 21))?.value).toBe(127);
    expect(plan.controls.get(controlKey(16, 22))?.value).toBe(0);
    expect(plan.controls.get(controlKey(16, 23))?.value).toBe(127);
    expect(grooveCc(0)).toBe(0);
  });
  it('only what changed is sent, unless full', () => {
    const plan = abletonPlan(base([colour('a', 'melody')]));
    const sent = new Map([...plan.controls].map(([k, c]) => [k, c.value]));
    expect(changedControls(plan.controls, sent)).toHaveLength(0);
    expect(changedControls(plan.controls, sent, true)).toHaveLength(plan.controls.size);
    sent.set(controlKey(1, CHAIN_CC), 99);
    expect(changedControls(plan.controls, sent).map((c) => c.cc)).toEqual([CHAIN_CC]);
  });
  it('control counters: CC 25, 26, 27 on every sounding channel', () => {
    const list = counterControls([1, 2], { tone: 1, delay: 0.5 });
    expect(list.map((c) => `${c.channel}:${c.cc}:${c.value}`)).toEqual(['1:25:127', '2:25:127', '1:27:64', '2:27:64']);
  });
  it('mapping targets: chain selectors, then macros, then channel 16, each left where ADMI wants it', () => {
    const t = abletonMappingTargets(abletonPlan(base([colour('a', 'melody', { instrument: 'harp' })])));
    expect(t[0]).toMatchObject({ channel: 1, cc: 30, value: 48 });
    expect(t.some((x) => x.cc === 24 && x.channel === 1)).toBe(true);
    expect(t.at(-1)?.channel).toBe(16);
  });
});

describe('loops on their own channels', () => {
  it('a loop note goes to its loop channel; drums stay on 10', () => {
    expect(channelFor({ role: 'melody', origin: 'placed', loopSlot: 0 }, { loopChannels: true })).toBe(4);
    expect(channelFor({ role: 'bass', origin: 'phrase', loopSlot: 5 }, { loopChannels: true })).toBe(9);
    expect(channelFor({ role: 'chord', origin: 'placed', loopSlot: 8 }, { loopChannels: true })).toBe(9);
    expect(channelFor({ role: 'drums', origin: 'placed', loopSlot: 0 }, { loopChannels: true })).toBe(10);
    expect(channelFor({ role: 'melody', origin: 'placed', loopSlot: 0 })).toBe(1);
    expect(channelsInUse(undefined, true)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(loopSlotOf('slot3')).toBe(3);
    expect(loopSlotOf('bank1')).toBe(1);
    expect(loopSlotOf(undefined)).toBeNull();
  });
  it('turning loop channels on moves colours off 4 to 9, into 1 to 3 and 14 to 15', () => {
    const out = assignColourChannels([colour('a', 'melody', { midiChannel: 1 }), colour('b', 'melody', { midiChannel: 5 })], true) ?? [];
    expect(out.map((c) => c.midiChannel)).toEqual([1, 2]);
    expect(assignColourChannels([colour('b', 'melody', { midiChannel: 5 })], false)).toBeNull();
  });
});

describe('what the player sees', () => {
  it('the "AI off" line shows only with both off', () => {
    expect(aiOffLine(0, 0)).toContain('Extra notes off');
    expect(aiOffLine(0.25, 0)).toBeNull();
    expect(aiOffLine(0, 0.35)).toBeNull();
  });
  it('the Ableton tracks check appears in Ableton and Both, not ADMI', () => {
    expect(abletonTracksItem('admi')).toBeNull();
    expect(abletonTracksItem('ableton')?.state).toBe('warn');
    expect(abletonTracksItem('both')?.fix).toContain('channel 13');
  });
  it('the test note visits 1, 2, 3, 10, 11, 12, 13 in turn', () => {
    const ev = testSequenceEvents(1000);
    const ons = ev.filter((e) => (e.data[0] & 0xf0) === 0x90);
    expect(ons.map((e) => (e.data[0] & 0x0f) + 1)).toEqual([...TEST_CHANNELS]);
    expect(ons.map((e) => e.atMs)).toEqual(TEST_CHANNELS.map((_, i) => 1000 + i * TEST_GAP_MS));
    expect(ons[3].data[1]).toBe(38); // a snare on the drum track
  });
});

// ---- the engine ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import * as Tone from 'tone';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';
import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: null;
  mix: { gain: { setTargetAtTime: Mock } };
  timer: unknown;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
  tickExpression(): void;
}
const setNow = (t: number) => { (Tone.immediate as Mock).mockReturnValue(t); (Tone.now as Mock).mockReturnValue(t); };
const sent = () => port.send.mock.calls.map((c) => ({ d: c[0] as number[], at: c[1] as number | undefined }));
const ccs = (cc: number, ch?: number) => sent().filter((x) => (x.d[0] & 0xf0) === 0xb0 && x.d[1] === cc && (ch === undefined || (x.d[0] & 0x0f) + 1 === ch));

function engine(channels: ColourChannel[] = [colour('m', 'melody')]) {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, band: 'off', soundWorld: 'warm',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(channels.filter((c) => c.role !== 'drums').map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = null;
  p.mix = { gain: { setTargetAtTime: vi.fn() } };
  return { e, p };
}

describe('engine: sound choices reach Ableton', () => {
  beforeEach(() => { port.send.mockClear(); setNow(0); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('turning MIDI on sends every chain; after that only changes', () => {
    const { e } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    expect(ccs(30, 1).at(-1)?.d[2]).toBe(0); // Warm
    expect(ccs(30, 11).length).toBe(1);
    port.send.mockClear();
    e.setEnergy(0.5);
    expect(ccs(30)).toHaveLength(0);
  });

  it('picking Harp on the card sends CC 30 = 48 on its channel, once', () => {
    const { e } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    port.send.mockClear();
    e.setChannels([colour('m', 'melody', { instrument: 'harp' })]);
    expect(ccs(30, 1).map((x) => x.d[2])).toEqual([48]);
    expect(ccs(30, 10)).toHaveLength(0);
  });

  it('a new World switches every channel without its own sound', () => {
    const { e } = engine([colour('m', 'melody'), colour('b', 'bass', { instrument: 'bassElectric' })]);
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    port.send.mockClear();
    e.setSoundWorld('electronic');
    expect(ccs(30, 1).at(-1)?.d[2]).toBe(24);
    expect(ccs(30, 2)).toHaveLength(0); // its own Electric bass stays
    for (const ch of [10, 11, 12, 13]) expect(ccs(30, ch).at(-1)?.d[2]).toBe(24);
  });

  it('Play and the button send everything again', () => {
    const { e } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    port.send.mockClear();
    e.resendAbleton();
    expect(ccs(30).length).toBeGreaterThanOrEqual(5);
    port.send.mockClear();
    e.start();
    expect(ccs(30).length).toBeGreaterThanOrEqual(5);
    e.stop();
  });

  it('a Tone counter owns Bright (CC 25) while it is on the board', () => {
    const { e } = engine();
    e.setMidiOut({ enabled: true, sends: 'all' }, 'p1');
    port.send.mockClear();
    e.setControlValues({ tone: 0.5 });
    expect(ccs(25, 1).at(-1)?.d[2]).toBe(64);
    port.send.mockClear();
    e.setEnergy(0.9); // a resync must not put the card's Bright back while the counter is there
    expect(ccs(25)).toHaveLength(0);
    e.setControlValues({});
    expect(ccs(25, 1).at(-1)?.d[2]).toBe(127);
  });
});

describe('engine: a fader per loop', () => {
  beforeEach(() => { port.send.mockClear(); setNow(0); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a stopped loop: its notes on its own channel, CC 11 there falls to 0 over the fade, then its notes end', () => {
    const { e, p } = engine();
    e.setMidiOut({ enabled: true, sends: 'all', loopChannels: true }, 'p1');
    e.setActiveCells([]);
    e.setLaunchFade(4);
    e.setLaunchedLoops([0], [[{ row: 3, col: 0, colour: 'm' }]]);
    p.timer = 1; // as if playing, so a change waits for the pass boundary
    p.fireStep(0, 0, 1, null);
    expect(sent().some((x) => x.d[0] === 0x93 && x.d[2] > 0)).toBe(true); // note on, channel 4
    e.setLaunchedLoops([], []);
    port.send.mockClear();
    setNow(4);
    p.fireStep(4, 4, 1, null); // the boundary: the fade starts (4 beats of 1 s)
    for (let t = 4; t <= 8.2; t += 0.025) { setNow(t); p.tickExpression(); }
    const values = ccs(11, 4).map((x) => x.d[2]);
    expect(values.at(-1)).toBe(0);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    expect(ccs(11, 1).every((x) => x.d[2] === 127)).toBe(true); // the parts are untouched
    port.send.mockClear();
    for (let b = 5; b <= 8; b++) { setNow(b); p.fireStep(b, b, 1, null); }
    expect(ccs(123, 4).length).toBeGreaterThan(0); // the loop has left: its channel is released
    expect(ccs(123, 1)).toHaveLength(0);
    p.timer = null;
  });
});
