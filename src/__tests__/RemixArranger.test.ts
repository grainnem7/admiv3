import { describe, it, expect } from 'vitest';
import { RemixArranger } from '../remix/recording/RemixArranger';
import type { RemixTake } from '../remix/recording/remixRecording';

function take(id: string, events: RemixTake['events'], muted = false): RemixTake {
  return { id, muted, events };
}

describe('RemixArranger', () => {
  it('find-or-creates a section by origin+length and appends takes', () => {
    const a = new RemixArranger('song1');
    a.addTake(0, 8, take('t1', []));
    a.addTake(0, 8, take('t2', []));
    a.addTake(8, 8, take('t3', []));
    const arr = a.getArrangement();
    expect(arr.sections).toHaveLength(2);
    expect(arr.sections[0].layers.map((l) => l.id)).toEqual(['t1', 't2']);
    expect(arr.sections[1].originBar).toBe(8);
  });

  it('composite: last non-muted take wins for continuous params', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.3 }]));
    a.addTake(0, 8, take('t2', [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.9 }]));
    const res = RemixArranger.composite(a.getArrangement().sections[0], 5);
    expect(res.filters.vocals).toBeCloseTo(0.9, 5);
  });

  it('composite: only events at-or-before t apply', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [
      { t: 0, kind: 'stemFilter', stem: 'drums', value: 0.2 },
      { t: 4, kind: 'stemFilter', stem: 'drums', value: 0.8 },
    ]));
    expect(RemixArranger.composite(a.getArrangement().sections[0], 3).filters.drums).toBeCloseTo(0.2, 5);
    expect(RemixArranger.composite(a.getArrangement().sections[0], 5).filters.drums).toBeCloseTo(0.8, 5);
  });

  it('composite: muted takes are excluded', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 0, kind: 'stemFilter', stem: 'bass', value: 0.4 }]));
    a.addTake(0, 8, take('t2', [{ t: 0, kind: 'stemFilter', stem: 'bass', value: 0.95 }], true));
    expect(RemixArranger.composite(a.getArrangement().sections[0], 5).filters.bass).toBeCloseTo(0.4, 5);
  });

  it('composite: loop params last-wins', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [
      { t: 0, kind: 'loopEnable', on: true },
      { t: 0, kind: 'loopSelect', index: 1 },
      { t: 0, kind: 'loopVolume', value: 0.6 },
    ]));
    const res = RemixArranger.composite(a.getArrangement().sections[0], 5);
    expect(res.loopEnable).toBe(true);
    expect(res.loopSelect).toBe(1);
    expect(res.loopVolume).toBeCloseTo(0.6, 5);
  });

  it('discreteEventsInWindow returns percussion from all non-muted takes in (from,to]', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 2, kind: 'percussion', velocity: 0.8 }]));
    a.addTake(0, 8, take('t2', [{ t: 2.5, kind: 'percussion', velocity: 0.5 }], true));
    a.addTake(0, 8, take('t3', [{ t: 2.4, kind: 'percussion', velocity: 0.7 }]));
    const hits = RemixArranger.discreteEventsInWindow(a.getArrangement().sections[0], 1, 3);
    expect(hits.map((h) => (h as { velocity: number }).velocity).sort()).toEqual([0.7, 0.8]);
  });

  it('muteTake and deleteTake mutate the right take', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', []));
    a.addTake(0, 8, take('t2', []));
    a.muteTake(0, 't1', true);
    expect(a.getArrangement().sections[0].layers[0].muted).toBe(true);
    a.deleteTake(0, 't2');
    expect(a.getArrangement().sections[0].layers.map((l) => l.id)).toEqual(['t1']);
  });

  it('load replaces the arrangement', () => {
    const a = new RemixArranger('s');
    a.load({ songId: 's2', sections: [{ originBar: 4, lengthBars: 4, layers: [] }] });
    expect(a.getArrangement().songId).toBe('s2');
    expect(a.getArrangement().sections[0].originBar).toBe(4);
  });
});
