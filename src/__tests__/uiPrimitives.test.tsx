import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, click, pressKey } from './helpers/render';
import { Tabs } from '../ui/screens/boardSequencer/ui/Tabs';
import { SegmentedControl } from '../ui/screens/boardSequencer/ui/SegmentedControl';
import { Switch } from '../ui/screens/boardSequencer/ui/Switch';
import { ConfirmDialog } from '../ui/screens/boardSequencer/ui/ConfirmDialog';
import { Button } from '../ui/screens/boardSequencer/ui/Button';
import { Disclosure } from '../ui/screens/boardSequencer/ui/Disclosure';

afterEach(() => { document.body.innerHTML = ''; });

function TabsHarness(): JSX.Element {
  const [active, setActive] = useState('groove');
  return (
    <Tabs
      label="Play settings"
      active={active}
      onChange={setActive}
      tabs={[
        { id: 'groove', label: 'Groove', content: <p>groove panel</p> },
        { id: 'sound', label: 'Sound', content: <p>sound panel</p> },
        { id: 'loops', label: 'Loops', content: <p>loops panel</p> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('uses a roving tabindex and moves with arrows, Home and End', () => {
    const r = render(<TabsHarness />);
    const tabs = (): HTMLElement[] => r.all('[role="tab"]');
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(r.get('[role="tabpanel"]:not([hidden])').textContent).toBe('groove panel');

    pressKey(tabs()[0], 'ArrowRight');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(r.get('[role="tabpanel"]:not([hidden])').textContent).toBe('sound panel');

    pressKey(tabs()[1], 'End');
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    pressKey(tabs()[2], 'Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    // Wraps, so a switch user pressing one key repeatedly always gets somewhere.
    pressKey(tabs()[0], 'ArrowLeft');
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('only the selected panel is rendered and it is labelled by its tab', () => {
    const r = render(<TabsHarness />);
    const panel = r.get('[role="tabpanel"]:not([hidden])');
    const tab = r.all('[role="tab"]')[0];
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
  });
});

function SegmentedHarness({ onChange }: { onChange?: (v: number) => void }): JSX.Element {
  const [value, setValue] = useState(4);
  return (
    <SegmentedControl
      label="Rows"
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }}
      options={[{ value: 2, label: '2' }, { value: 4, label: '4' }, { value: 8, label: '8' }]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radiogroup whose arrows change the selection and move focus', () => {
    const onChange = vi.fn();
    const r = render(<SegmentedHarness onChange={onChange} />);
    const radios = (): HTMLElement[] => r.all('[role="radio"]');
    expect(r.get('[role="radiogroup"]').getAttribute('aria-label')).toBe('Rows');
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');

    pressKey(radios()[1], 'ArrowRight');
    expect(onChange).toHaveBeenCalledWith(8);
    expect(radios()[2].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radios()[2]);

    click(radios()[0]);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('the selected option shows ● and a light tint, not the filled mint of a main action (B17)', () => {
    const r = render(<SegmentedHarness />);
    const radios = r.all('[role="radio"]');
    expect(radios[1].classList.contains('bs-selected')).toBe(true);
    expect(radios[1].style.background).toBe('var(--bs-accent-muted)');
    expect(radios[1].style.color).toBe('var(--bs-fg)');
    expect(radios[0].classList.contains('bs-selected')).toBe(false);
    // The words are unchanged: the ● is drawn by the stylesheet, not spoken.
    expect(radios[1].textContent).toBe('4');
  });

  it('U9: the options are one joined group, the chosen one with a neutral edge', () => {
    const r = render(<SegmentedHarness />);
    const radios = r.all('[role="radio"]');
    // Joined: the edges overlap, and only the ends are rounded.
    expect(radios[0].style.marginLeft).toBe('');
    expect(radios[1].style.marginLeft).toBe('-1px');
    expect(radios[0].style.borderTopLeftRadius).not.toBe('0px');
    expect(radios[0].style.borderTopRightRadius).toMatch(/^0(px)?$/);
    expect(radios[radios.length - 1].style.borderTopRightRadius).not.toBe('0px');
    expect(radios[radios.length - 1].style.borderTopLeftRadius).toMatch(/^0(px)?$/);
    // The chosen one: the tint and ●, never the mint edge.
    expect(radios[1].style.borderColor).toBe('var(--bs-border-control)');
    expect(radios[0].style.borderColor).toBe('var(--bs-border-control)');
    expect((r.get('[role="radiogroup"]') as HTMLElement).style.gap).toMatch(/^0(px)?$/);
  });
});

describe('Switch', () => {
  it('reads as a switch and says On or Off in words', () => {
    const onChange = vi.fn();
    const r = render(<Switch label="Show hints" checked={false} onChange={onChange} />);
    const sw = r.get('[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('Off');
    click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Button', () => {
  it('the danger tone (■ Stop) stands out by weight, never by a counter hue: the text colour as its fill, bold', () => {
    const r = render(<Button tone="danger">■ Stop</Button>);
    const button = r.get('button');
    expect(button.style.background).toBe('var(--bs-fg)');
    expect(button.style.color).toBe('var(--bs-bg)');
    expect(button.style.fontWeight).toBe('800');
    expect(button.outerHTML).not.toMatch(/--bs-danger|--bs-warn/);
  });

  it('a reserved reason never widens the button’s place, so its coming never re-wraps the header (B25)', () => {
    const r = render(<Button reserveReason reason={null}>Player: Tim</Button>);
    const reason = r.container.querySelector('button + span') as HTMLElement;
    expect(reason.style.position).toBe('absolute');
    expect((reason.parentElement as HTMLElement).style.position).toBe('relative');
    expect((reason.parentElement as HTMLElement).style.paddingBottom).toBe('16px');
  });

  it('the selected tone: ● and a light tint (B17), with a neutral edge so the mint is left for a main action (U9)', () => {
    const r = render(<Button tone="selected" aria-pressed>Board</Button>);
    const button = r.get('button');
    expect(button.classList.contains('bs-selected')).toBe(true);
    expect(button.style.background).toBe('var(--bs-accent-muted)');
    expect(button.style.borderColor).toBe('var(--bs-border-control)');
    expect(button.style.fontWeight).toBe('600');
    expect(button.textContent).toBe('Board');
  });

  it('a reason disables it and is shown in reserved space', () => {
    const onClick = vi.fn();
    const r = render(<Button reason="Volume is set by the volume counter" onClick={onClick}>Volume</Button>);
    const button = r.get('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(r.container.textContent).toContain('Volume is set by the volume counter');
  });
});

describe('Disclosure', () => {
  it('starts closed and toggles its panel', () => {
    const r = render(<Disclosure summary="Details"><p>hsv numbers</p></Disclosure>);
    const toggle = r.get('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const panelId = toggle.getAttribute('aria-controls')!;
    expect(r.byId(panelId).hidden).toBe(true);
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(r.byId(panelId).hidden).toBe(false);
  });
});

describe('ConfirmDialog', () => {
  it('takes focus, traps Tab, cancels on Esc and restores focus to the opener', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const r = render(
      <ConfirmDialog
        title="Remove Red?"
        body="Saved loops and pages that use Red will go quiet."
        confirmLabel="Remove"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = r.get('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const buttons = r.all('button');
    // Focus lands on Cancel, not on Remove. A player with tremor, or a switch that fires
    // twice, can press whatever has focus the instant a dialog opens — and this dialog's
    // other button destroys their work.
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].textContent).toBe('Cancel');

    pressKey(document.activeElement!, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    pressKey(document.activeElement!, 'Tab');
    expect(document.activeElement).toBe(buttons[0]);

    pressKey(dialog, 'Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    r.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('a dialog that is not destructive still opens on its main action', () => {
    const r = render(
      <ConfirmDialog
        title="Start again?"
        confirmLabel="Start"
        tone="primary"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const buttons = r.all('button');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    r.unmount();
  });

  it('restores focus to something real when the opener is destroyed with it', () => {
    // Confirming Remove unmounts the button that opened the dialog, so focusing it back
    // would do nothing at all and drop the player at the top of the page.
    const heading = document.createElement('h2');
    document.body.appendChild(heading);
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const r = render(
      <ConfirmDialog title="Remove Red?" confirmLabel="Remove" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    opener.remove();
    r.unmount();
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });
});
