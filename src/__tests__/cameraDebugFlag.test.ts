import { describe, it, expect, beforeEach } from 'vitest';
import { cameraDebugEnabled, setCameraDebug, CAMERA_DEBUG_KEY } from '../tracking/cameraDebugFlag';

describe('the camera debug flag', () => {
  beforeEach(() => localStorage.clear());

  it('is off unless asked for — it is a diagnostic, not part of the instrument', () => {
    expect(cameraDebugEnabled('')).toBe(false);
    expect(cameraDebugEnabled('?other=1')).toBe(false);
  });

  it('turns on from the address bar, so a workshop needs no rebuild', () => {
    expect(cameraDebugEnabled('?cameradebug=1')).toBe(true);
    expect(cameraDebugEnabled('?cameradebug')).toBe(true);
    expect(cameraDebugEnabled('?cameradebug=0')).toBe(false);
  });

  it('can be remembered for this browser, and the address bar still wins', () => {
    setCameraDebug(true);
    expect(localStorage.getItem(CAMERA_DEBUG_KEY)).toBe('1');
    expect(cameraDebugEnabled('')).toBe(true);
    expect(cameraDebugEnabled('?cameradebug=0')).toBe(false);
    setCameraDebug(false);
    expect(cameraDebugEnabled('')).toBe(false);
  });
});
