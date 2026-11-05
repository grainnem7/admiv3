/**
 * The chess board photos in fixtures/chess: learn from the start position, then read the
 * occupancy of every other photo. Skipped until the photos are there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  cellFeatures, learnFromStart, readOccupancy, occupancyText, occupancyFromText, slantOf, SLANT_LIMIT, type BoardCorners,
} from '../tracking/chess/chessOccupancy';

const DIR = join(__dirname, 'fixtures', 'chess');
interface Fixture { name: string; corners: BoardCorners; position: string; start: boolean; png: PNG }

function load(): Fixture[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => {
    const meta = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { corners: [number, number][]; position: string[]; start?: boolean };
    const name = f.replace(/\.json$/, '');
    return {
      name,
      corners: meta.corners.map(([x, y]) => ({ x, y })) as unknown as BoardCorners,
      position: meta.position.join('\n'),
      start: meta.start === true,
      png: PNG.sync.read(readFileSync(join(DIR, `${name}.png`))),
    };
  });
}

const fixtures = load();
const start = fixtures.find((f) => f.start);

describe.skipIf(!start)('the chess board photos', () => {
  const frame = (f: Fixture) => ({ data: new Uint8ClampedArray(f.png.data), width: f.png.width, height: f.png.height });
  const model = start ? learnFromStart(cellFeatures(frame(start), start.corners)) : null;

  it('learns the board from the start position', () => {
    expect(model).not.toBeNull();
  });

  for (const f of fixtures) {
    it(`reads ${f.name}`, () => {
      expect(slantOf(f.corners, f.png.width, f.png.height)).toBeLessThan(SLANT_LIMIT);
      const read = readOccupancy(cellFeatures(frame(f), f.corners), model!);
      expect(occupancyText(read)).toBe(occupancyText(occupancyFromText(f.position)));
    });
  }
});
