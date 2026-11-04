import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CapLogo, CAP_LOGO_SHAPES } from '../ui/components/CapLogo';
import { CAP_RED } from '../ui/screens/boardSequencer/theme/boardTokens';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("Timbo's logo: a red cap", () => {
  it('is one picture named Timbo, in the cap red, at the size asked for', () => {
    act(() => root.render(<CapLogo size={48} />));
    const svg = host.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Timbo');
    expect(svg.getAttribute('width')).toBe('48');
    expect(svg.getAttribute('height')).toBe('48');
    expect(svg.getAttribute('fill')).toBe(CAP_RED);
    // No words in the drawing.
    expect(svg.textContent).toBe('');
  });

  it('can be hidden from screen readers where the word Timbo follows it', () => {
    act(() => root.render(<CapLogo size={20} decorative />));
    const svg = host.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();
  });

  it('the favicon is the same drawing', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf-8');
    expect(favicon).toContain(CAP_RED);
    for (const d of CAP_LOGO_SHAPES.paths) expect(favicon).toContain(`d="${d}"`);
    expect(favicon).toContain(`viewBox="${CAP_LOGO_SHAPES.viewBox}"`);
    const b = CAP_LOGO_SHAPES.button;
    expect(favicon).toContain(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}"/>`);
  });
});
