import { describe, it, expect } from 'vitest';
import { ContinuousMapper } from '../mapping/ContinuousMapper';
import { midiToFrequency } from '../utils/math';

describe('ContinuousMapper envelope (yRange)', () => {
  it('without yRange, raw 0 → top of pitch range (invertY default)', () => {
    const mapper = new ContinuousMapper({ noteRange: { min: 48, max: 72 } });
    // Raw Y=0 with invertY → yValue=1 → max MIDI = 72.
    expect(mapper.getFrequency(0)).toBeCloseTo(midiToFrequency(72), 5);
    // Raw Y=1 → yValue=0 → min MIDI = 48.
    expect(mapper.getFrequency(1)).toBeCloseTo(midiToFrequency(48), 5);
  });

  it('with yRange [0.3, 0.7], the envelope edges hit the pitch extremes', () => {
    const mapper = new ContinuousMapper({
      noteRange: { min: 48, max: 72 },
      yRange: { min: 0.3, max: 0.7 },
    });
    // Raw Y=0.3 (top of envelope) → envelope-Y=0 → invertY → 1 → MIDI 72.
    expect(mapper.getFrequency(0.3)).toBeCloseTo(midiToFrequency(72), 5);
    // Raw Y=0.7 (bottom of envelope) → envelope-Y=1 → invertY → 0 → MIDI 48.
    expect(mapper.getFrequency(0.7)).toBeCloseTo(midiToFrequency(48), 5);
    // Raw Y=0.5 (centre of envelope) → envelope-Y=0.5 → invertY → 0.5 → MIDI 60.
    expect(mapper.getFrequency(0.5)).toBeCloseTo(midiToFrequency(60), 5);
  });

  it('positions outside the envelope clamp to the nearest pitch extreme', () => {
    const mapper = new ContinuousMapper({
      noteRange: { min: 48, max: 72 },
      yRange: { min: 0.3, max: 0.7 },
    });
    // Raw Y=0 is above the envelope top → clamps to envelope-Y=0 → max pitch.
    expect(mapper.getFrequency(0)).toBeCloseTo(midiToFrequency(72), 5);
    // Raw Y=1 is below the envelope bottom → clamps to envelope-Y=1 → min pitch.
    expect(mapper.getFrequency(1)).toBeCloseTo(midiToFrequency(48), 5);
  });

  it('degenerate yRange (min === max) falls back to raw coordinates', () => {
    const mapper = new ContinuousMapper({
      noteRange: { min: 48, max: 72 },
      yRange: { min: 0.5, max: 0.5 },
    });
    // Span is zero → applyEnvelope returns rawY as-is.
    expect(mapper.getFrequency(0)).toBeCloseTo(midiToFrequency(72), 5);
    expect(mapper.getFrequency(1)).toBeCloseTo(midiToFrequency(48), 5);
  });

  it('null yRange explicitly disables envelope remap', () => {
    const mapper = new ContinuousMapper({
      noteRange: { min: 48, max: 72 },
      yRange: null,
    });
    expect(mapper.getFrequency(0)).toBeCloseTo(midiToFrequency(72), 5);
  });
});
