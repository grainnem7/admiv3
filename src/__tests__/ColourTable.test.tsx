import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ColourTable, type ColourTableProps } from '../ui/screens/boardSequencer/play/ColourTable';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import type { ColourChannel } from '../tracking/boardColours';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';
import type { TrackedColor } from '../tracking/ColorTracker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const band = (hue: number): TrackedColor => ({ hue } as TrackedColor); // describeChannel names a colour by its hue
const channels: ColourChannel[] = [
  { id: 't', kind: 'hue', role: 'tempo', swatch: '#0f0', band: band(120) },
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00', band: band(0) },
  { id: 'c', kind: 'hue', role: 'chord', swatch: '#ff0', band: band(60) },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#00f', band: band(230) },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<ColourTableProps> = {}): ColourTableProps {
  return {
    config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels },
    palette: BOARD_TOKENS.calm.dark,
    roleLockedReason: null,
    onRole: vi.fn(),
    onLoopSlot: vi.fn(),
    setChannelSound: vi.fn(),
    onHear: vi.fn(),
    hearing: null,
    ...over,
  };
}

function render(p: ColourTableProps): void {
  act(() => root.render(<ColourTable {...p} />));
}

const rows = (): HTMLTableRowElement[] => [...host.querySelectorAll('tbody tr[aria-label]')] as HTMLTableRowElement[];
const row = (startsWith: string): HTMLTableRowElement => {
  const r = rows().find((x) => x.getAttribute('aria-label')?.startsWith(startsWith));
  if (!r) throw new Error(`no row ${startsWith}`);
  return r;
};
const select = (r: HTMLElement, label: string): HTMLSelectElement => r.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
const choose = (s: HTMLSelectElement, value: string): void => {
  act(() => {
    s.value = value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const button = (r: HTMLElement, name: RegExp): HTMLButtonElement => {
  const b = [...r.querySelectorAll('button')].find((x) => name.test(x.getAttribute('aria-label') ?? x.textContent ?? ''));
  if (!b) throw new Error(`no button ${name}`);
  return b as HTMLButtonElement;
};

describe('the colour table', () => {
  it('one row per colour; sound colours first, a control last with no sound', () => {
    render(props());
    expect(rows()).toHaveLength(4);
    expect(rows().at(-1)?.getAttribute('aria-label')).toMatch(/^Green/);
    expect(rows().at(-1)?.textContent).toContain('—');
  });

  it('a melody can choose from the melody sounds, and the choice is saved', () => {
    const p = props();
    render(p);
    const sound = select(row('Red'), 'Red: sound');
    const names = [...sound.options].map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Piano', 'Violin', 'Synth pluck']));
    choose(sound, 'harp');
    expect(p.setChannelSound).toHaveBeenCalledWith('m', { instrument: 'harp' });
  });

  it('↶ goes back to the sound before the last change, for that row only', () => {
    // As the screen does: a sound change is saved, and the table shows it.
    let current = channels;
    const p = props();
    p.setChannelSound = vi.fn((id: string, patch) => {
      current = current.map((c) => (c.id === id ? { ...c, ...patch } : c));
      render({ ...p, config: { ...p.config, channels: current } });
    });
    render(p);
    choose(select(row('Red'), 'Red: sound'), 'harp');
    choose(select(row('Red'), 'Red: sound'), 'violin');
    act(() => button(row('Red'), /^Back to/).click());
    expect(p.setChannelSound).toHaveBeenLastCalledWith('m', { instrument: 'harp' });
    expect(button(row('Blue'), /^Back to|Back$/).disabled).toBe(true);
  });

  it('Plays offers the five jobs; a change goes to onRole; locked while playing, saying why', () => {
    const p = props();
    render(p);
    const plays = select(row('Red'), 'Red: plays');
    const names = [...plays.options].map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Melody', 'Bass', 'Chords', 'Drums', 'Not used']));
    choose(plays, 'chord');
    expect(p.onRole).toHaveBeenCalledWith('m', 'chord');
    render(props({ roleLockedReason: 'Stop the board to change what a colour plays.' }));
    expect(select(row('Red'), 'Red: plays').disabled).toBe(true);
    expect(host.textContent).toContain('Stop the board to change what a colour plays.');
  });

  it('▶ Hear asks for that colour; while it loads it says so', () => {
    const p = props();
    render(p);
    act(() => button(row('Red'), /^Hear/).click());
    expect(p.onHear).toHaveBeenCalledWith(expect.objectContaining({ id: 'm' }));
    render(props({ hearing: 'm' }));
    expect(button(row('Red'), /^Hear/).getAttribute('aria-busy')).toBe('true');
  });

  /** A table whose sound and job changes are saved and shown, as on the screen. */
  function live(start: ColourChannel[] = channels): { p: ColourTableProps; set(next: ColourChannel[]): void } {
    let current = start;
    const p = props({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels: current } });
    const show = (): void => render({ ...p, config: { ...p.config, channels: current } });
    p.setChannelSound = vi.fn((id: string, patch) => { current = current.map((c) => (c.id === id ? { ...c, ...patch } : c)); show(); });
    p.onRole = vi.fn((id: string, role) => { current = current.map((c) => (c.id === id ? { ...c, role } : c)); show(); });
    show();
    return { p, set(next) { current = next; show(); } };
  }

  it('a saved sound outside its job’s list is shown as it is, not as another sound', () => {
    render(props({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels: channels.map((c) => (c.id === 'm' ? { ...c, instrument: 'cello' } : c)) } }));
    const sound = select(row('Red'), 'Red: sound');
    expect(sound.value).toBe('cello');
    expect(sound.selectedOptions[0].textContent).toBe('Cello (own pick)');
  });

  it('the melody sounds are in named groups; an own pick and the world’s option stay above them', () => {
    render(props({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels: channels.map((c) => (c.id === 'm' ? { ...c, instrument: 'tuba' } : c)) } }));
    const sound = select(row('Red'), 'Red: sound');
    const [first, second] = [...sound.options];
    expect(first.value).toBe('');
    expect(second.textContent).toBe('Tuba (own pick)');
    expect(first.parentElement).toBe(sound);
    expect(second.parentElement).toBe(sound);
    expect([...sound.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Keys', 'Strings', 'Wind and brass', 'Plucked and struck', 'Synth']);
    expect(sound.querySelector('optgroup[label="Wind and brass"] option[value="flute"]')).not.toBeNull();
  });

  it('the Ableton note names what Ableton actually plays', () => {
    render(props({ config: {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', midiEnabled: true, midiKeepSound: false,
      channels: channels.map((c) => (c.id === 'm' ? { ...c, instrument: 'tuba' } : c)),
    } }));
    act(() => button(row('Red'), /^More for Red/).click());
    expect(host.textContent).toContain('Ableton sound: World: Warm (chain 1)');
  });

  it('one per colour: a colour sharing its job’s last track is told why, not to choose One per colour', () => {
    const chords = [...channels, { id: 'c2', kind: 'hue' as const, role: 'chord' as const, swatch: '#f0f', band: band(300) }];
    render(props({
      config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', midiEnabled: true, midiKeepSound: false, midiChannelMode: 'colour', channels: chords },
      abletonShares: new Map([['c2', { channel: 3, withId: 'c' }]]),
    }));
    const row2 = rows().find((r) => r.getAttribute('aria-label')?.includes('Chords') && !r.getAttribute('aria-label')?.startsWith('Yellow'));
    if (!row2) throw new Error('no second chords row');
    act(() => button(row2, /^More for /).click());
    expect(host.textContent).toContain('Shares track 3 with Yellow: only three melody colours, one bass and one chords colour get a track of their own.');
    expect(host.textContent).not.toContain('Choose One per colour');
  });

  it('one way to make a loop: Plays no longer offers "Plays a loop", unless the colour already has it', () => {
    render(props());
    const plays = select(row('Red'), 'Red: plays');
    expect([...plays.options].map((o) => o.value)).not.toContainEqual(expect.stringMatching(/^loop:/));
    expect(plays.querySelector('optgroup[label="Loop"]')).toBeNull();
    // A saved colour that still plays a loop keeps its option, so the profile loads as it was.
    const legacy = channels.map((c) => (c.id === 'm' ? { ...c, role: 'loop' as const, loopSlot: 0 } : c));
    render(props({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels: legacy } }));
    const legacyPlays = select(rows().find((r) => r.getAttribute('aria-label')?.startsWith('Red')) as HTMLElement, 'Red: plays');
    expect(legacyPlays.value).toBe('loop:0');
  });

  it('↶ is off after a job change, so a drum name never lands on an instrument', () => {
    live();
    choose(select(row('Red'), 'Red: sound'), 'harp');
    choose(select(row('Red'), 'Red: plays'), 'drums');
    expect(button(row('Red'), /^Back to/).disabled).toBe(true);
  });

  it('↶ after "Reset every colour" goes back one step: to the sound before the reset', () => {
    const t = live();
    choose(select(row('Red'), 'Red: sound'), 'harp');
    choose(select(row('Red'), 'Red: sound'), 'violin');
    t.set(channels.map((c) => ({ ...c, instrument: undefined }))); // the reset, made outside the table
    act(() => button(row('Red'), /^Back to/).click());
    expect(t.p.setChannelSound).toHaveBeenLastCalledWith('m', { instrument: 'violin' });
  });

  it('colours are numbered as everywhere else: by their place in the colour list', () => {
    render(props());
    const chip = (r: HTMLElement): string | null | undefined => r.querySelector('span[aria-hidden="true"]')?.textContent;
    expect(chip(row('Green'))).toBe('1'); // the tempo colour is first in config, though listed last
    expect(chip(row('Red'))).toBe('2');
  });

  it('what Hear is doing is shown on its row', () => {
    render(props({ hearNote: { id: 'm', text: 'Playing Red…' } }));
    const status = row('Red').querySelector('[role="status"]');
    expect(status?.textContent).toBe('Playing Red…');
    expect(row('Blue').querySelector('[role="status"]')).toBeNull();
  });
});
