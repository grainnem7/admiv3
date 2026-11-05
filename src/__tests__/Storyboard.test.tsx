/** K2 (Keep design, 5 Nov 2026): the storyboard under the board, the piece as a row of scene cards. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import { Storyboard, type StoryboardProps } from '../ui/screens/boardSequencer/play/Storyboard';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene } from '../songs/performance/launcher';
import type { PieceLoop } from '../ui/screens/boardSequencer/play/PieceSteps';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const settings = { soundWorld: 'warm', sceneEnergy: 2 } as unknown as Scene['settings'];
const scene = (id: string, name: string, at: number, loops: number[], energy = 2): Scene => ({ id, name, loops, settings: { ...settings, sceneEnergy: energy } as Scene['settings'], at });
const loop = (slot: number, name: string): PieceLoop => ({ slot, name, notes: 2, state: 'stopped', cells: [{ row: 1, col: 1, colour: 'c1' }] });
const props = (over: Partial<StoryboardProps> = {}): StoryboardProps => ({
  scenes: [scene('a', 'Arrival', 0, [0]), scene('b', 'Build', 90, [0, 1], 3)],
  loops: [loop(0, 'Bed'), loop(1, 'Pulse')], lengthSec: 420, performance: { ...DEFAULT_PERFORMANCE }, currentScene: null,
  running: false, elapsedSec: null, selected: null, pieceName: 'Piece 1', pieceMenu: <p>the pieces</p>,
  worldLabel: () => 'Warm', rows: 8, cols: 8, swatchFor: () => '#000', locked: null,
  onSelect: vi.fn(), onKeepScene: vi.fn(), keepSceneReason: null, onMakePlan: vi.fn(), onCheck: vi.fn(), onJoinPress: vi.fn(), ...over,
});
const cards = (): HTMLElement[] => view!.all('[data-scene-card]');
const thumbsIn = (card: HTMLElement): HTMLElement[] => [...card.querySelectorAll<HTMLElement>('[data-in-scene]')];
const button = (name: RegExp): HTMLButtonElement => {
  const b = view!.all('button').find((x) => name.test(x.getAttribute('aria-label') ?? x.textContent ?? '')) as HTMLButtonElement | undefined;
  if (!b) throw new Error(`no button ${name}`);
  return b;
};

describe('the storyboard (K2)', () => {
  it('one card per timed scene, in order, named by its number, name, time, length and loops; loops lit or dim; words under', () => {
    view = render(<Storyboard {...props()} />);
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual([
      'Scene 1 · 0:00 Arrival Steady · Warm, 1:30 long, loops Bed',
      'Scene 2 · 1:30 Build Lively · Warm, 5:30 long, loops Bed, Pulse',
    ]);
    expect(thumbsIn(cards()[0]).map((t) => t.dataset.inScene)).toEqual(['true', 'false']);
    expect(thumbsIn(cards()[1]).map((t) => t.dataset.inScene)).toEqual(['true', 'true']);
    expect(cards()[1].textContent).toContain('Lively · Warm');
    // The heading: the piece, its length and ending, and Check.
    expect(view.container.textContent).toContain('Piece 1');
    expect(view.container.textContent).toContain('7:00');
    act(() => button(/^Check/).click());
    expect(props().onCheck).not.toHaveBeenCalled(); // a fresh props() has its own mock: the call went to the rendered one
  });

  it('a press selects the card; arrows, Home and End move the focus; Enter selects; one tab stop', () => {
    const p = props();
    view = render(<Storyboard {...p} />);
    expect(cards().map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1']);
    act(() => cards()[1].click());
    expect(p.onSelect).toHaveBeenCalledWith('b');
    act(() => { cards()[0].focus(); cards()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(document.activeElement).toBe(cards()[1]);
    act(() => { cards()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(document.activeElement).toBe(cards()[0]);
    act(() => { cards()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
    expect(document.activeElement).toBe(cards()[1]);
    act(() => { cards()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(p.onSelect).toHaveBeenLastCalledWith('b');
    expect(view.get('[role="listbox"]').getAttribute('aria-label')).toBe('The piece: its scenes in order');
  });

  it('the selected card has a solid edge and is the tab stop', () => {
    view = render(<Storyboard {...props({ selected: 'b' })} />);
    expect(cards()[1].getAttribute('aria-selected')).toBe('true');
    expect(cards().map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });

  it('with no scenes: the dashed card, Make my plan as the big button, and the one line that says what to do', () => {
    const p = props({ scenes: [] });
    view = render(<Storyboard {...p} />);
    expect(cards().length).toBe(0);
    expect(view.container.textContent).toContain('Play some loops together, then press Keep as scene. Or press Make my plan for a four-scene start.');
    const plan = button(/Make my plan/);
    expect(plan.style.background).toBe('var(--bs-accent)');
    act(() => plan.click());
    expect(p.onMakePlan).toHaveBeenCalled();
    act(() => button(/Keep what’s playing as a scene/).click());
    expect(p.onKeepScene).toHaveBeenCalled();
  });

  it('with scenes, Make my plan is a quiet button, and the dashed card comes after the last scene', () => {
    view = render(<Storyboard {...props()} />);
    expect(button(/Make my plan/).style.background).toBe('transparent');
    const row = view.get('[role="listbox"]');
    const last = [...row.querySelectorAll('button')].pop() as HTMLButtonElement;
    expect(last.textContent).toContain("Keep what’s playing as a scene");
  });

  it('a join between each pair of cards names the scene it goes into, and a press on it selects that scene', () => {
    const p = props();
    view = render(<Storyboard {...p} />);
    const joins = view.all('[data-join]') as HTMLButtonElement[];
    expect(joins.length).toBe(1);
    expect(joins[0].getAttribute('aria-label')).toMatch(/^fade 1: into Build/);
    act(() => joins[0].click());
    expect(p.onJoinPress).toHaveBeenCalledWith(1);
  });

  it('the card on now is marked, and the ruler shows the playhead while the piece plays', () => {
    view = render(<Storyboard {...props({ currentScene: 1, running: true, elapsedSec: 210 })} />);
    expect(cards()[1].hasAttribute('data-on-now')).toBe(true);
    expect(cards()[0].hasAttribute('data-on-now')).toBe(false);
    const head = view.get('[data-playhead]');
    expect(head.style.left).toBe('50%');
    view.unmount();
    view = render(<Storyboard {...props()} />);
    expect(view.container.querySelector('[data-playhead]')).toBeNull();
  });

  it('locked (the piece plays from Show): Keep, Make my plan and the joins say why; a card can still be selected', () => {
    const p = props({ locked: 'Stop the piece to change it.' });
    view = render(<Storyboard {...p} />);
    expect(button(/Keep what’s playing as a scene/).disabled).toBe(true);
    expect(button(/Make my plan/).disabled).toBe(true);
    expect((view.all('[data-join]')[0] as HTMLButtonElement).disabled).toBe(true);
    expect(view.container.textContent).toContain('Stop the piece to change it.');
    act(() => cards()[0].click());
    expect(p.onSelect).toHaveBeenCalledWith('a');
  });

  it('the piece menu opens under the heading from the ▾ button', () => {
    view = render(<Storyboard {...props()} />);
    expect(view.container.textContent).not.toContain('the pieces');
    act(() => button(/^Piece 1 ▾/).click());
    expect(view.container.textContent).toContain('the pieces');
  });
});

describe('the way into a scene on the join (K3)', () => {
  it('the join says the next scene’s way in, and whether a loop carries on', () => {
    const scenes = [scene('a', 'Arrival', 0, [0]), { ...scene('b', 'Build', 90, [0, 1]), wayIn: { kind: 'cut' as const } }];
    view = render(<Storyboard {...props({ scenes })} />);
    const join = view.all('[data-join]')[0] as HTMLButtonElement;
    expect(join.querySelector('span')!.textContent).toBe('cut');
    expect(join.getAttribute('aria-label')).toBe('cut: into Build');
    expect(join.title).toContain('Bed carries on');
    view.unmount();
    view = render(<Storyboard {...props()} />); // no way in saved: fade 1, as the player's fade did
    expect((view.all('[data-join]')[0] as HTMLButtonElement).querySelector('span')!.textContent).toBe('fade 1');
  });
});
