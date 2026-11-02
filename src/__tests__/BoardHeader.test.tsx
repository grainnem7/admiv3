/**
 * U6 (2 Nov 2026): while the board plays, the Player button's reason hung under it and
 * touched the transport row. It is now the greyed button's tooltip, and screen readers are
 * still told why, through a description that is not drawn.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { BoardHeader } from '../ui/screens/boardSequencer/BoardHeader';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const header = (reason: string | null): JSX.Element => (
  <BoardHeader
    title="Board Sequencer" onExit={vi.fn()} mode="dark" onModeChange={vi.fn()} largeUi={false} onLargeUiChange={vi.fn()} onHelp={vi.fn()}
    playerName="Tim" onSwitchPlayer={vi.fn()} switchPlayerDisabledReason={reason}
  />
);

describe('the Player button while the board plays (U6)', () => {
  it('is greyed, says why in its tooltip and to a screen reader, and draws no line of text under itself', () => {
    view = render(header('Stop playing to switch player.'));
    const player = view.byText('Player: Tim', 'button') as HTMLButtonElement;
    expect(player.disabled).toBe(true);
    expect(player.title).toBe('Stop playing to switch player.');
    const described = document.getElementById(player.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('Stop playing to switch player.');
    // Not drawn: off to the side, one pixel, clipped.
    expect(described?.style.position).toBe('absolute');
    expect(described?.style.width).toBe('1px');
    expect(view.container.querySelector('[data-player-slot]')).toBeNull();
  });

  it('with no reason it is a plain button', () => {
    view = render(header(null));
    const player = view.byText('Player: Tim', 'button') as HTMLButtonElement;
    expect(player.disabled).toBe(false);
    expect(player.title).toBe('');
    expect(player.hasAttribute('aria-describedby')).toBe(false);
  });
});
