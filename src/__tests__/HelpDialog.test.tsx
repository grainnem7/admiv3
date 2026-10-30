/**
 * A8 (audit 2026-10-30): Help opened scrolled to the end with focus on Close, 3,500 px of
 * text. It now opens at the top with focus on its heading, has links to its sections, and
 * Close sits outside the scrolling text.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import HelpDialog from '../ui/screens/boardSequencer/components/HelpDialog';
import { HELP_SECTION_TITLES } from '../ui/components/board/BoardHelp';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

describe('Help opens at the top, on its heading (A8)', () => {
  it('focus is on the "How to play" heading, and the text is scrolled to the top', () => {
    const onClose = vi.fn();
    view = render(<HelpDialog onClose={onClose} />);
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe('H2');
    expect(active.textContent).toBe('How to play');
    expect(view.get('[data-help-text]').scrollTop).toBe(0);
    expect(view.get('[role="dialog"]').getAttribute('aria-label')).toBe('How to play');
  });

  it('Close is not inside the scrolling text, and closes', () => {
    const onClose = vi.fn();
    view = render(<HelpDialog onClose={onClose} />);
    const close = view.byText('Close', 'button');
    expect(view.get('[data-help-text]').contains(close)).toBe(false);
    expect(view.get('[data-help-nav]').contains(close)).toBe(false);
    act(() => { close.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has a link to every section, and a link takes focus to that section\'s heading', () => {
    view = render(<HelpDialog onClose={() => undefined} />);
    const links = view.all('[data-help-nav] a');
    expect(links.map((a) => a.textContent)).toEqual([...HELP_SECTION_TITLES]);
    const headings = view.all('[data-help-text] h3');
    expect(headings.map((h) => h.textContent)).toEqual([...HELP_SECTION_TITLES]);
    const third = links[2];
    expect(third.getAttribute('href')).toBe(`#${headings[2].id}`);
    act(() => { third.click(); });
    expect(document.activeElement).toBe(headings[2]);
  });

  it('the headings run in order: h2 then h3, never skipping a level', () => {
    view = render(<HelpDialog onClose={() => undefined} />);
    const levels = view.all('h1, h2, h3, h4, h5, h6').map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(2);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  it('Esc closes it', () => {
    const onClose = vi.fn();
    view = render(<HelpDialog onClose={onClose} />);
    act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });
});
