import { describe, it, expect } from 'vitest';
import { manualLockConstraints } from '../tracking/CameraManager';

describe('manualLockConstraints', () => {
  it('locks each mode the camera reports supporting "manual"', () => {
    const out = manualLockConstraints({
      exposureMode: ['continuous', 'manual'],
      whiteBalanceMode: ['continuous', 'manual'],
      focusMode: ['continuous', 'manual'],
    });
    expect(out).toEqual([
      { exposureMode: 'manual' },
      { whiteBalanceMode: 'manual' },
      { focusMode: 'manual' },
    ]);
  });

  it('skips modes that do not offer "manual"', () => {
    const out = manualLockConstraints({
      exposureMode: ['continuous', 'manual'],
      whiteBalanceMode: ['continuous'], // no manual → skipped
      // focusMode absent entirely → skipped
    });
    expect(out).toEqual([{ exposureMode: 'manual' }]);
  });

  it('returns an empty list when capabilities are missing or support nothing', () => {
    expect(manualLockConstraints(null)).toEqual([]);
    expect(manualLockConstraints(undefined)).toEqual([]);
    expect(manualLockConstraints({})).toEqual([]);
    expect(manualLockConstraints({ exposureMode: ['continuous'] })).toEqual([]);
  });
});
