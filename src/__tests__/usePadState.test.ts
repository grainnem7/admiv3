import { describe, it, expect } from 'vitest';
import { padReducer, INITIAL_PAD_STATE, type PadEvent } from '../ui/screens/songPreset/usePadState';

describe('padReducer', () => {
  it('starts at (0.5, 0.0) with held=false', () => {
    expect(INITIAL_PAD_STATE).toEqual({ x: 0.5, y: 0.0, held: false });
  });

  it('pointerdown sets held=true and updates position', () => {
    const next = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    expect(next).toEqual({ x: 0.3, y: 0.7, held: true });
  });

  it('pointermove while not held does nothing', () => {
    const next = padReducer(INITIAL_PAD_STATE, { type: 'move', x: 0.9, y: 0.1 });
    expect(next).toBe(INITIAL_PAD_STATE);
  });

  it('pointermove while held updates position, keeps held=true', () => {
    const downState = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    const moveState = padReducer(downState, { type: 'move', x: 0.6, y: 0.2 });
    expect(moveState).toEqual({ x: 0.6, y: 0.2, held: true });
  });

  it('pointerup persists position but keeps held=true (persist-on-lift)', () => {
    const downState = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.4, y: 0.4 });
    const upState = padReducer(downState, { type: 'up' });
    expect(upState).toEqual({ x: 0.4, y: 0.4, held: true });
  });

  it('subsequent pointerdown after lift updates position and keeps held=true', () => {
    let s = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    s = padReducer(s, { type: 'up' });
    s = padReducer(s, { type: 'down', x: 0.8, y: 0.1 });
    expect(s).toEqual({ x: 0.8, y: 0.1, held: true });
  });

  it('reset returns to initial state', () => {
    const s = padReducer({ x: 0.9, y: 0.9, held: true }, { type: 'reset' });
    expect(s).toEqual(INITIAL_PAD_STATE);
  });

  it('coordinates are clamped to [0, 1]', () => {
    const high: PadEvent = { type: 'down', x: 1.5, y: -0.2 };
    const next = padReducer(INITIAL_PAD_STATE, high);
    expect(next.x).toBe(1);
    expect(next.y).toBe(0);
  });
});
