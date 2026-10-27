import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABLETON_CHAINS, chainRange } from '../midi/abletonSounds';

const guide = readFileSync(join(process.cwd(), 'docs/ableton-setup-guide.html'), 'utf8');

/** Section 5a's chain table: the rows of the first table after the section's heading. */
function chainRows(): { n: number; name: string }[] {
  const section = guide.slice(guide.indexOf('id="h-racks"'));
  const table = section.slice(section.indexOf('<table'), section.indexOf('</table>'));
  return [...table.matchAll(/<tr><td>(\d+)<\/td><td>([^<]+)<\/td>/g)].map((m) => ({ n: Number(m[1]), name: m[2].replace(/&amp;/g, '&') }));
}

describe('the Ableton setup guide', () => {
  it('the guide’s chain table matches ABLETON_CHAINS, in order', () => {
    const rows = chainRows();
    expect(rows.map((r) => r.name)).toEqual(ABLETON_CHAINS.map((c) => c.name));
    expect(rows.map((r) => r.n)).toEqual(ABLETON_CHAINS.map((c) => c.index + 1));
  });

  const text = guide.slice(guide.indexOf('id="h-racks"'), guide.indexOf('id="h-loops"')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

  it('asks for the ranges to be checked against the table after Distribute Ranges Equally', () => {
    for (const i of [3, 17, 29]) expect(text).toContain(`chain ${i + 1} should start at ${chainRange(i)[0]}`);
  });

  it('widens chain 33 to 127 before Distribute Ranges Equally (new chains all sit on 0)', () => {
    expect(text).toContain('drag the right-hand edge of chain 33’s zone out to 127');
  });

  it('keeps the drums’ kit rack out of Distribute Ranges Equally', () => {
    expect(text).toContain('not the drums (channel 10)');
  });

  it('hears every chain, on Bass and Chords too', () => {
    expect(text).toMatch(/a bass colour and a chords colour/);
  });

  it('warns that Ableton’s C3 is ADMI’s C4 for the saxophone files', () => {
    expect(text).toContain('Ableton calls middle C C3');
  });

  it('gives the Expression mapping a Min', () => {
    expect(text).toMatch(/Expression.*Min 40%/);
  });

  it('says the renamed chains need their new instruments', () => {
    expect(text).toContain('Choir pad, Electric piano chords and Bells still hold their old instruments');
  });
});
