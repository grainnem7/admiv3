import { describe, expect, it } from 'vitest';
import { developCells, developmentFor } from '../songs/development';

const isMelody = (colour: string): boolean => colour === 'm';
const loop = [
  { row: 4, col: 0, colour: 'm' }, { row: 3, col: 2, colour: 'm' }, { row: 5, col: 4, colour: 'm' }, { row: 4, col: 6, colour: 'm' },
  { row: 7, col: 0, colour: 'b' }, { row: 7, col: 4, colour: 'b' },
];

describe('development: a loop goes somewhere over sixteen passes and comes home (S2)', () => {
  it('the cycles: home, lift, turn, thin; less with less variation; nothing under a quarter', () => {
    expect([0, 1, 2, 3, 4].map((c) => developmentFor(c, 1))).toEqual(['home', 'lift', 'turn', 'thin', 'home']);
    expect([0, 1, 2, 3].map((c) => developmentFor(c, 0.4))).toEqual(['home', 'lift', 'home', 'thin']);
    expect([0, 1, 2, 3].map((c) => developmentFor(c, 0.1))).toEqual(['home', 'home', 'home', 'home']);
  });
  it('home is the loop as kept, every pass of the first cycle', () => {
    for (let lap = 0; lap < 4; lap++) expect(developCells(loop, lap, 1, 8, 8, isMelody)).toEqual(loop);
  });
  it('the lift raises the melody one row in the second half of the pass; the bass is left whole', () => {
    const lifted = developCells(loop, 4, 1, 8, 8, isMelody);
    expect(lifted.filter((c) => c.colour === 'm').map((c) => c.row)).toEqual([4, 3, 4, 3]);
    expect(lifted.filter((c) => c.colour === 'b')).toEqual(loop.filter((c) => c.colour === 'b'));
    // Never off the top of the board.
    const top = [{ row: 0, col: 6, colour: 'm' }];
    expect(developCells(top, 5, 1, 8, 8, isMelody)[0].row).toBe(0);
  });
  it('the turn mirrors the melody around its middle row, keeping its range, in the scale by construction', () => {
    const turned = developCells(loop, 8, 1, 8, 8, isMelody).filter((c) => c.colour === 'm').map((c) => c.row);
    expect(turned).toEqual([4, 5, 3, 4]); // mean 4: 4→4, 3→5, 5→3, 4→4
    expect(Math.max(...turned) - Math.min(...turned)).toBe(2);
  });
  it('the thinning keeps the melody on the on-beats for three passes and plays the whole figure on the fourth', () => {
    for (let lap = 12; lap < 15; lap++) {
      const thin = developCells(loop, lap, 1, 8, 8, isMelody);
      expect(thin.filter((c) => c.colour === 'm').map((c) => c.col)).toEqual([0, 2, 4, 6].filter((c) => c % 2 === 0));
      expect(thin.filter((c) => c.colour === 'b')).toHaveLength(2);
    }
    const odd = [{ row: 4, col: 1, colour: 'm' }, { row: 4, col: 3, colour: 'm' }];
    expect(developCells(odd, 13, 1, 8, 8, isMelody)).toEqual([]);
    expect(developCells(loop, 15, 1, 8, 8, isMelody)).toEqual(loop);
  });
  it('a loop with no melody is left whole in every cycle', () => {
    const bass = loop.filter((c) => c.colour === 'b');
    for (let lap = 0; lap < 16; lap++) expect(developCells(bass, lap, 1, 8, 8, isMelody)).toEqual(bass);
  });
});
