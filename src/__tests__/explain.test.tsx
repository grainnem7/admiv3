/**
 * U7 (3 Nov 2026): "Explain the choices". On to start with; off, the sentences under the
 * choices go, and stay gone on this laptop. What is true now (a status, a reason) always shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import { ExplainSwitch, forgetExplain, Note, useExplain } from '../ui/screens/boardSequencer/ui/explain';
import { StepRow } from '../ui/screens/boardSequencer/play/StepRow';
import { Switch } from '../ui/screens/boardSequencer/ui/Switch';

let view: Rendered | null = null;
beforeEach(() => forgetExplain());
afterEach(() => { view?.unmount(); view = null; forgetExplain(); });

function Probe(): JSX.Element {
  const [on, set] = useExplain();
  return <button type="button" onClick={() => set(!on)}>{on ? 'on' : 'off'}</button>;
}

describe('Explain the choices', () => {
  it('is on to start with, and off stays off on this laptop', () => {
    view = render(<Probe />);
    const b = view.get('button');
    expect(b.textContent).toBe('on');
    act(() => { b.click(); });
    expect(b.textContent).toBe('off');
    expect(localStorage.getItem('admi-board-explain')).toBe('0');
    view.unmount();
    view = render(<Probe />);
    expect(view.get('button').textContent).toBe('off');
  });

  it('the switch says what it is, and a Note goes with it', () => {
    view = render(<><ExplainSwitch /><Note>How hard everything plays.</Note></>);
    const sw = view.get('[role="switch"]');
    expect(sw.textContent).toContain('Explain the choices');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(view.container.textContent).toContain('How hard everything plays.');
    act(() => { sw.click(); });
    expect(view.container.textContent).not.toContain('How hard everything plays.');
  });

  it('a step row: its hint goes with the switch, the reason it is off never does', () => {
    const steps = [{ label: 'Off', value: 0 }, { label: 'Some', value: 0.5 }];
    view = render(<><ExplainSwitch /><StepRow label="How many" steps={steps} value={0} onPick={vi.fn()} hint="The instrument adds notes." reason="Turn the band on first." /></>);
    expect(view.container.textContent).toContain('The instrument adds notes.');
    act(() => { view!.get('[role="switch"]').click(); });
    expect(view.container.textContent).not.toContain('The instrument adds notes.');
    expect(view.container.textContent).toContain('Turn the band on first.');
  });

  it('a switch: its hint goes too', () => {
    view = render(<><ExplainSwitch /><Switch label="Variation" checked={false} onChange={vi.fn()} hint="A counter shoved to the edge plays every other pass." /></>);
    expect(view.container.textContent).toContain('every other pass');
    act(() => { view!.all('[role="switch"]')[0].click(); });
    expect(view.container.textContent).not.toContain('every other pass');
  });
});
