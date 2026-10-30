/**
 * A10 (audit 2026-10-30): three text sizes in the Board Sequencer, 14 / 16 / 20 px, nothing
 * under 14. Larger sizes are for display text only (the clock, the big cues). This reads the
 * sources, so a new 12 px label fails here before it is ever seen.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/ui/screens/boardSequencer', 'src/ui/components/board'];
const FILES = ['src/ui/screens/BoardSequencerScreen.tsx'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) ? [p] : [];
  });
}

const sources = [...ROOTS.flatMap(walk), ...FILES].map((p) => ({ p, text: readFileSync(p, 'utf8') }));
const sizesIn = (text: string): number[] => [...text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));

describe('the type scale (A10)', () => {
  it('no text is smaller than 14 px', () => {
    const small = sources.flatMap(({ p, text }) => sizesIn(text).filter((n) => n < 14).map((n) => `${p}: ${n}`));
    expect(small).toEqual([]);
  });
  it('the sizes are 14, 16 and 20; only display text (the clock, big cues) is larger', () => {
    const odd = sources.flatMap(({ p, text }) => sizesIn(text).filter((n) => n < 24 && ![14, 16, 20].includes(n)).map((n) => `${p}: ${n}`));
    expect(odd).toEqual([]);
  });
  it('the stylesheet names the three sizes and gives text fields 10 px inside', () => {
    const css = readFileSync('src/ui/screens/boardSequencer/theme/boardTheme.css', 'utf8');
    expect(css).toMatch(/--bs-text-sm:\s*14px/);
    expect(css).toMatch(/--bs-text:\s*16px/);
    expect(css).toMatch(/--bs-text-lg:\s*20px/);
    expect(css).toMatch(/padding:\s*0 10px/);
  });
});
