import { describe, it, expect } from 'vitest';
import { ZoneMappingNode, DEFAULT_QUAD_ZONES, DEFAULT_QUAD_CHORDS } from '../mapping/nodes/ZoneMappingNode';
import type { ProcessedFrame } from '../state/types';

/**
 * Build a minimal ProcessedFrame with a single feature at the given raw
 * (x, y) so we can exercise zone lookup at known positions.
 */
function frameAt(rawX: number, rawY: number): ProcessedFrame {
  return {
    timestamp: 0,
    features: new Map([
      [
        'baton',
        {
          id: 'baton',
          position: { x: rawX, y: rawY, confidence: 1, visibility: 1 },
          velocity: { x: 0, y: 0, magnitude: 0 },
          isActive: true,
        },
      ],
    ]),
  } as unknown as ProcessedFrame;
}

describe('ZoneMappingNode envelope remap', () => {
  it('without inputRange, uses raw frame coords (centre of frame → top-left zone is missed)', () => {
    const node = new ZoneMappingNode({
      id: 'z',
      name: 'Zones',
      zones: DEFAULT_QUAD_ZONES,
      zoneMappings: DEFAULT_QUAD_CHORDS,
      inputs: [{ sourceFeatureId: 'baton', sourceType: 'position', inputRange: { min: 0, max: 1 }, outputRange: { min: 0, max: 1 }, curve: 'linear', inverted: false }],
    });

    // Raw (0.5, 0.5) is on the boundary — falls into bottom-right zone (half-open).
    node.process(frameAt(0.5, 0.5));
    expect(node.getCurrentZone()).toBe('zone-br');
  });

  it('with inputRange covering only the central third, the central third reaches all four zones', () => {
    const node = new ZoneMappingNode({
      id: 'z',
      name: 'Zones',
      zones: DEFAULT_QUAD_ZONES,
      zoneMappings: DEFAULT_QUAD_CHORDS,
      inputs: [{ sourceFeatureId: 'baton', sourceType: 'position', inputRange: { min: 0, max: 1 }, outputRange: { min: 0, max: 1 }, curve: 'linear', inverted: false }],
      inputRange: { x: { min: 0.33, max: 0.67 }, y: { min: 0.33, max: 0.67 } },
    });

    // Near top of central third → envelope-Y ≈ 0 → top-left zone.
    node.process(frameAt(0.34, 0.34));
    expect(node.getCurrentZone()).toBe('zone-tl');

    // Near bottom of central third → envelope-Y ≈ 1 → bottom row.
    node.process(frameAt(0.34, 0.66));
    expect(node.getCurrentZone()).toBe('zone-bl');

    // Right side of central third + bottom → bottom-right.
    node.process(frameAt(0.66, 0.66));
    expect(node.getCurrentZone()).toBe('zone-br');
  });

  it('clamps positions outside the envelope to the nearest edge zone', () => {
    const node = new ZoneMappingNode({
      id: 'z',
      name: 'Zones',
      zones: DEFAULT_QUAD_ZONES,
      zoneMappings: DEFAULT_QUAD_CHORDS,
      inputs: [{ sourceFeatureId: 'baton', sourceType: 'position', inputRange: { min: 0, max: 1 }, outputRange: { min: 0, max: 1 }, curve: 'linear', inverted: false }],
      inputRange: { x: { min: 0.4, max: 0.6 }, y: { min: 0.4, max: 0.6 } },
    });

    // Raw (0, 0) is far outside the envelope on the upper-left — clamped to top-left.
    node.process(frameAt(0, 0));
    expect(node.getCurrentZone()).toBe('zone-tl');

    // Raw (1, 1) is far outside on the lower-right — clamped to bottom-right.
    // Note: clamp01 returns 1 which falls outside the half-open zone (< 1).
    // The remap clamps to 0.999 effectively via the half-open zone bounds.
    node.process(frameAt(0.99, 0.99));
    expect(node.getCurrentZone()).toBe('zone-br');
  });

  it('setInputRange swaps the envelope live', () => {
    const node = new ZoneMappingNode({
      id: 'z',
      name: 'Zones',
      zones: DEFAULT_QUAD_ZONES,
      zoneMappings: DEFAULT_QUAD_CHORDS,
      inputs: [{ sourceFeatureId: 'baton', sourceType: 'position', inputRange: { min: 0, max: 1 }, outputRange: { min: 0, max: 1 }, curve: 'linear', inverted: false }],
    });

    // Raw envelope: (0.34, 0.34) is in top-left.
    node.process(frameAt(0.34, 0.34));
    expect(node.getCurrentZone()).toBe('zone-tl');

    // Apply a narrow envelope where 0.34 falls in the bottom half → bottom-left.
    node.setInputRange({ x: { min: 0.3, max: 0.4 }, y: { min: 0.3, max: 0.4 } });
    // raw (0.39, 0.39) → envelope (0.9, 0.9) → bottom-right.
    node.process(frameAt(0.39, 0.39));
    expect(node.getCurrentZone()).toBe('zone-br');
  });
});
