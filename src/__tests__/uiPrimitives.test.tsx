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

  it('L1: the chosen option is the text colour with a thin underline under its words, the rest grey: never a tint, never colour alone', () => {
    const r = render(<SegmentedHarness />);
    const radios = r.all('[role="radio"]');
    expect(radios[1].style.background).toBe('transparent');
    expect(radios[1].style.color).toBe('var(--bs-fg)');
    expect(radios[1].style.fontWeight).toBe('600');
    expect(radios[0].style.color).toBe('var(--bs-fg3)');
    expect(radios[0].style.fontWeight).toBe('500');
    const words = (b: HTMLElement): HTMLElement => b.querySelector('[data-words]') as HTMLElement;
    expect(words(radios[1]).style.borderBottom).toMatch(/^1px solid currentcolor$/i);
    expect(words(radios[0]).style.borderBottom).toBe('1px solid transparent');
    // The words are unchanged, and no ● is drawn before them.
    expect(radios[1].textContent).toBe('4');
    expect(radios[1].classList.contains('bs-selected')).toBe(false);
  });

  it('L1: the options are words in a row, not a joined group: no edges, a gap between them', () => {
    const r = render(<SegmentedHarness />);
    const radios = r.all('[role="radio"]');
    for (const b of radios) {
      expect(b.style.border).toBe('1px solid transparent');
      expect(b.style.marginLeft).toBe('');
    }
    expect(parseInt((r.get('[role="radiogroup"]') as HTMLElement).style.columnGap, 10)).toBeGreaterThanOrEqual(16);
    // Still a 44 px target (A4), with the words inside it.
    expect(radios[0].style.minHeight).toBe('var(--bs-target)');
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

  it('L1: the selected tone is the text colour, semibold, with an underline under its words: no tint, no edge', () => {
    const r = render(<Button tone="selected" aria-pressed>Board</Button>);
    const button = r.get('button');
    expect(button.classList.contains('bs-selected')).toBe(false);
    expect(button.style.background).toBe('transparent');
    expect(button.style.borderColor).toBe('transparent');
    expect(button.style.fontWeight).toBe('600');
    expect(button.style.color).toBe('var(--bs-fg)');
    expect((button.querySelector('[data-words]') as HTMLElement).style.borderBottom).toMatch(/^1px solid currentcolor$/i);
    expect(button.textContent).toBe('Board');
  });

  it('L1: primary is a filled pill in the text colour, secondary a pill with a hairline edge, quiet plain words', () => {
    const r = render(<><Button tone="primary">▶ Play the board</Button><Button tone="secondary">Mute</Button><Button tone="quiet">Details</Button></>);
    const [primary, secondary, quiet] = r.all('button');
    expect(primary.style.background).toBe('var(--bs-accent)');
    expect(primary.style.color).toBe('var(--bs-accent-fg)');
    expect(primary.style.borderRadius).toBe('var(--bs-radius-pill)');
    expect(secondary.style.background).toBe('transparent');
    expect(secondary.style.borderColor).toBe('var(--bs-border-control)');
    expect(secondary.style.borderRadius).toBe('var(--bs-radius-pill)');
    expect(quiet.style.background).toBe('transparent');
    expect(quiet.style.borderColor).toBe('transparent');
    for (const b of [primary, secondary, quiet]) expect(b.style.minHeight).toBe('var(--bs-target)');
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
