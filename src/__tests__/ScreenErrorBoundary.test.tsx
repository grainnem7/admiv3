// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ScreenErrorBoundary } from '../ui/components/ScreenErrorBoundary';

let fail = true;
function Flaky(): JSX.Element {
  if (fail) throw new Error('boom in the board screen');
  return <p>board is fine</p>;
}

describe('ScreenErrorBoundary', () => {
  it('shows the error instead of a blank page, and Try again recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<ScreenErrorBoundary resetKey="board"><Flaky /></ScreenErrorBoundary>); });
    expect(el.textContent).toContain('Something went wrong on this screen');
    expect(el.textContent).toContain('boom in the board screen');
    fail = false;
    await act(async () => { el.querySelector('button')!.click(); });
    expect(el.textContent).toContain('board is fine');
  });
});
