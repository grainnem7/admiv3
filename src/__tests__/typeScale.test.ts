/**
 * A10 (audit 2026-10-30): the Board Sequencer used five sizes (9/12/13/14/18 px), with about
 * 40% of the text at 12 to 13 px. It uses three, 14, 16 and 20 px, and nothing smaller than
 * 14. Display sizes (the clock, the big pads' words, 22 px and up) are left alone.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/ui/screens/boardSequencer', 'src/ui/components/board'];
const FILES = ['src/ui/screens/BoardSequencerScreen.tsx'];
const ALLOWED = new Set([14, 16, 20]);
const DISPLAY_FROM_PX = 22;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const sources = [...FILES, ...ROOTS.flatMap((r) => walk(r))];

describe('the type scale is 14, 16 and 20 px, never smaller than 14 (A10)', () => {
  it('has the files to check', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('every font size written in the code is one of the three, or a display size', () => {
    const bad: string[] = [];
    for (const p of sources) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)(?![\d.*])/g)) {
        const px = Number(m[1]);
        if (px >= DISPLAY_FROM_PX) continue;
        if (!ALLOWED.has(px)) bad.push(`${p}: fontSize ${px}`);
      }
      for (const m of text.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        const px = Number(m[1]);
        if (px < DISPLAY_FROM_PX && !ALLOWED.has(px)) bad.push(`${p}: font-size ${px}px`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no text drawn on a canvas, or set with the font shorthand, is under 14 px', () => {
    const bad: string[] = [];
    for (const p of sources) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/(?:\.font\s*=|\bfont:\s*)\s*['"`][^'"`]*?(\d+(?:\.\d+)?)px/g)) {
        if (Number(m[1]) < 14) bad.push(`${p}: ${m[0]}`);
      }
      for (const m of text.matchAll(/(?:CHIP_FONT|_FONT)\s*=\s*["'][^"']*?(\d+)px/g)) {
        if (Number(m[1]) < 14) bad.push(`${p}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
