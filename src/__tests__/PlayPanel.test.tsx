/** U7: the notices' one place is at the top of the side panel, in a slot of fixed height. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
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
