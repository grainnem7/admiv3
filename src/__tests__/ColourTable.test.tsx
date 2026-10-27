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
    const sound = select(row('Red'), 'Sound');
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
    choose(select(row('Red'), 'Sound'), 'harp');
    choose(select(row('Red'), 'Sound'), 'violin');
    act(() => button(row('Red'), /^Back to/).click());
    expect(p.setChannelSound).toHaveBeenLastCalledWith('m', { instrument: 'harp' });
    expect(button(row('Blue'), /^Back to|Back$/).disabled).toBe(true);
  });

  it('Plays offers the five jobs; a change goes to onRole; locked while playing, saying why', () => {
    const p = props();
    render(p);
    const plays = select(row('Red'), 'Plays');
    const names = [...plays.options].map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Melody', 'Bass', 'Chords', 'Drums', 'Not used']));
    choose(plays, 'chord');
    expect(p.onRole).toHaveBeenCalledWith('m', 'chord');
    render(props({ roleLockedReason: 'Stop the board to change what a colour plays.' }));
    expect(select(row('Red'), 'Plays').disabled).toBe(true);
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
});
