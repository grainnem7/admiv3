import { describe, it, expect } from 'vitest';
import { homographyForCorners } from '../ui/screens/boardSequencer/homographyForCorners';
import { applyHomography } from '../utils/homography';

describe('homographyForCorners', () => {
  it('maps the unit square onto normalised corners scaled to the video size', () => {
    const h = homographyForCorners([{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }], 640, 480);
    const p = applyHomography(h, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(576, 6);
    expect(p.y).toBeCloseTo(384, 6);
  });
});
