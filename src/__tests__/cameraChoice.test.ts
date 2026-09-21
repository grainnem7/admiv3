import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadCameraChoice, saveCameraChoice, defaultCameraChoice, knownResolution, resolutionsToTry,
  CAMERA_CHOICE_KEY,
} from '../tracking/cameraChoice';

describe('remembering the camera that worked', () => {
  beforeEach(() => localStorage.clear());

  it('starts at an HD size, which is the one browsers read colour correctly from', () => {
    // Confirmed on the rig: a bridged iPhone asked for 640 x 480 delivered a purple
    // counter as tan, because with no colour metadata the browser infers the YUV-to-RGB
    // coefficients from the frame size and reads SD sizes differently from HD ones.
    expect(loadCameraChoice()).toEqual({ deviceId: '', label: '', width: 1280, height: 720 });
  });

  it('round-trips a working combination', () => {
    saveCameraChoice({ deviceId: 'camo-1', label: 'Camo', width: 1280, height: 720 });
    expect(loadCameraChoice()).toEqual({ deviceId: 'camo-1', label: 'Camo', width: 1280, height: 720 });
    expect(localStorage.getItem(CAMERA_CHOICE_KEY)).not.toBeNull();
  });

  it('refuses a size we do not offer rather than passing it on', () => {
    localStorage.setItem(CAMERA_CHOICE_KEY, JSON.stringify({ deviceId: 'x', width: 999, height: 1 }));
    expect(loadCameraChoice()).toMatchObject({ deviceId: 'x', width: 1280, height: 720 });
    expect(knownResolution(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(knownResolution('big', null)).toEqual({ width: 1280, height: 720 });
  });

  it('survives a corrupt or unwritable store', () => {
    localStorage.setItem(CAMERA_CHOICE_KEY, '{not json');
    expect(loadCameraChoice()).toEqual(defaultCameraChoice());
  });

  it('tries the remembered size first, then the others', () => {
    // Virtual cameras deliver colour at some sizes and not others, so the order is the
    // retry plan: what worked before, then everything else.
    expect(resolutionsToTry({ width: 1280, height: 720 })).toEqual([
      { width: 1280, height: 720 }, { width: 640, height: 480 }, { width: 1920, height: 1080 },
    ]);
    expect(resolutionsToTry({ width: 0, height: 0 })[0]).toEqual({ width: 1280, height: 720 });
    expect(resolutionsToTry({ width: 640, height: 480 })).toHaveLength(3);
  });
});
