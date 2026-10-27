import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABLETON_CHAINS } from '../midi/abletonSounds';

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
});
