/** U7: the notices' one place is at the top of the side panel, in a slot of fixed height. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { act } from 'react';
import { PlayPanel, type PlayPanelProps } from '../ui/screens/boardSequencer/play/PlayPanel';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const props = (over: Partial<PlayPanelProps> = {}): PlayPanelProps => ({
  running: false, muted: false, onStart: vi.fn(), onStop: vi.fn(), onToggleMute: vi.fn(), bpm: 90, step: 0, cols: 8,
  variationLap: null, beatOn: false, heldCount: 0, handGuardWaiting: false, piece: null,
  connections: <p>c</p>, cap: <p>cap</p>, groove: <p>g</p>, sound: <p>s</p>, loops: <p>l</p>,
  stacked: false, transportAlign: 'end', ...over,
});

describe('the notice slot in the panel (U7)', () => {
  it('side by side: a slot of fixed height between the transport and the tabs, holding the notices', () => {
    view = render(<PlayPanel {...props({ notices: <p role="status">Board cleared.</p> })} />);
    const slot = view.get('[data-notice-slot]');
    expect(slot.style.height).not.toBe('');
    expect(slot.style.flexShrink).toBe('0');
    expect(slot.textContent).toContain('Board cleared.');
    // After the transport (Play), before the tabs.
    const order = [...view.container.querySelectorAll('button, [data-notice-slot], [role="tablist"]')];
    const play = order.findIndex((e) => e.textContent?.includes('Play the board'));
    const tabs = order.findIndex((e) => e.getAttribute('role') === 'tablist');
    const at = order.indexOf(slot);
    expect(play).toBeLessThan(at);
    expect(at).toBeLessThan(tabs);
  });

  it('with no notice the slot is still there, so a notice moves nothing', () => {
    view = render(<PlayPanel {...props()} />);
    expect(view.get('[data-notice-slot]').style.height).not.toBe('');
  });

  it('stacked (narrow): no slot here, the page keeps the notices above the board', () => {
    view = render(<PlayPanel {...props({ stacked: true, notices: <p>n</p> })} />);
    expect(view.container.querySelector('[data-notice-slot]')).toBeNull();
  });
});

describe('the speed in the transport (producer flow, item 4)', () => {
  it('with onBpm the readout is a button whose words stay "90 BPM"; arrow keys change it by one, five with Shift', () => {
    const onBpm = vi.fn();
    view = render(<PlayPanel {...props({ onBpm })} />);
    const readout = view.get('[data-speed-readout]') as HTMLButtonElement;
    expect(readout.textContent).toBe('90 BPM');
    expect(readout.getAttribute('aria-label')).toBe('90 BPM: change the speed');
    // The line still reads as before, for the eye and for the tests that read it.
    expect(readout.parentElement!.parentElement!.textContent).toContain('Stopped · 90 BPM');
    readout.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onBpm).toHaveBeenLastCalledWith(91);
    readout.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
    expect(onBpm).toHaveBeenLastCalledWith(85);
  });

  it('pressing it opens a slider and Tap; four taps at 120 set 120', () => {
    const onBpm = vi.fn();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    view = render(<PlayPanel {...props({ onBpm })} />);
    const readout = view.get('[data-speed-readout]') as HTMLButtonElement;
    expect(view.container.querySelector('[role="group"][aria-label="Speed"]')).toBeNull();
    act(() => readout.click());
    const group = view.get('[role="group"][aria-label="Speed"]');
    expect(group.querySelector('input[type="range"]')).not.toBeNull();
    const tap = [...group.querySelectorAll('button')].find((b) => b.textContent === 'Tap')!;
    for (let i = 0; i < 4; i++) { now += 500; act(() => tap.click()); }
    expect(onBpm).toHaveBeenLastCalledWith(120);
    vi.restoreAllMocks();
  });

  it('a tempo counter owns the speed: the readout is greyed and says why', () => {
    view = render(<PlayPanel {...props({ onBpm: vi.fn(), bpmReason: 'The speed counter sets this.' })} />);
    const readout = view.get('[data-speed-readout]') as HTMLButtonElement;
    expect(readout.disabled).toBe(true);
    expect(readout.title).toBe('The speed counter sets this.');
  });

  it('without onBpm the speed is plain words, as before', () => {
    view = render(<PlayPanel {...props()} />);
    expect(view.container.querySelector('[data-speed-readout]')).toBeNull();
    expect(view.container.textContent).toContain('90 BPM');
  });
});
