import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildVideoConstraints, shouldFallBackToDefault, CameraManager, CAMERA_RESOLUTIONS,
} from '../tracking/CameraManager';

/** A fake MediaStream whose single track records stop(). */
function fakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn();
  const track = { stop, label: 'Fake cam', getSettings: () => ({ width: 640, height: 480, frameRate: 30 }) };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    active: true,
  } as unknown as MediaStream;
  return { stream, stop };
}

/** A fake <video> that becomes ready as soon as its loadedmetadata handler is set. */
function fakeVideo(): HTMLVideoElement {
  const v = {
    srcObject: null as MediaStream | null,
    videoWidth: 640,
    videoHeight: 480,
    onerror: null as unknown,
    play: () => Promise.resolve(),
    set onloadedmetadata(fn: () => void) { queueMicrotask(fn); },
  };
  return v as unknown as HTMLVideoElement;
}

// setup.ts installs a stub navigator.mediaDevices; spy on its getUserMedia per test.
function mockGetUserMedia(impl: (c?: MediaStreamConstraints) => Promise<MediaStream>) {
  return vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockImplementation(impl);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CameraManager.start', () => {
  it('opens the chosen camera without falling back', async () => {
    const { stream } = fakeStream();
    const gum = mockGetUserMedia(() => Promise.resolve(stream));
    const cam = new CameraManager();
    const res = await cam.start(fakeVideo(), 'cam-1');
    expect(res.fellBack).toBe(false);
    expect((gum.mock.calls[0][0]!.video as MediaTrackConstraints).deviceId).toEqual({ exact: 'cam-1' });
  });

  it('falls back to the default camera when the chosen one is missing', async () => {
    const { stream } = fakeStream();
    const gum = mockGetUserMedia((c) => ((c!.video as MediaTrackConstraints).deviceId
      ? Promise.reject(new DOMException('gone', 'NotFoundError'))
      : Promise.resolve(stream)));
    const cam = new CameraManager();
    const res = await cam.start(fakeVideo(), 'unplugged');
    expect(res.fellBack).toBe(true);
    expect(gum).toHaveBeenCalledTimes(2);
    expect((gum.mock.calls[1][0]!.video as MediaTrackConstraints).deviceId).toBeUndefined();
  });

  it('releases a stream that arrives after stop() (fast camera switch) and does not attach it', async () => {
    const { stream, stop } = fakeStream();
    let resolve: (s: MediaStream) => void = () => {};
    mockGetUserMedia(() => new Promise<MediaStream>((r) => { resolve = r; }));
    const cam = new CameraManager();
    const video = fakeVideo();
    const pending = cam.start(video, 'cam-1');
    cam.stop(); // the screen switched camera / unmounted before permission resolved
    resolve(stream);
    await expect(pending).rejects.toBeTruthy();
    expect(stop).toHaveBeenCalled(); // camera light goes off — no leaked stream
    expect(video.srcObject).toBeNull();
    expect(cam.isActive()).toBe(false);
  });
});

const CFG = { width: 640, height: 480, facingMode: 'user' as const, frameRate: 30 };

describe('buildVideoConstraints', () => {
  it('uses facingMode on a phone when no device is chosen', () => {
    const v = buildVideoConstraints(CFG, undefined, { mobile: true });
    expect(v.facingMode).toBe('user');
    expect(v.deviceId).toBeUndefined();
    expect(v.width).toEqual({ ideal: 640 });
    expect(v.height).toEqual({ ideal: 480 });
    expect(v.frameRate).toEqual({ ideal: 30 });
  });

  it('treats an empty device id as the browser default', () => {
    const v = buildVideoConstraints(CFG, '', { mobile: true });
    expect(v.deviceId).toBeUndefined();
    expect(v.facingMode).toBe('user');
  });

  it('pins the exact device and drops facingMode when a camera is chosen', () => {
    const v = buildVideoConstraints(CFG, 'cam-123');
    expect(v.deviceId).toEqual({ exact: 'cam-123' });
    // facingMode would fight an explicit external/phone camera choice.
    expect(v.facingMode).toBeUndefined();
    expect(v.width).toEqual({ ideal: 640 });
  });
});

describe('shouldFallBackToDefault', () => {
  it('falls back when the chosen camera is missing or cannot satisfy the pin', () => {
    expect(shouldFallBackToDefault(new DOMException('gone', 'NotFoundError'))).toBe(true);
    expect(shouldFallBackToDefault(new DOMException('nope', 'OverconstrainedError'))).toBe(true);
  });

  it('does not fall back on permission/in-use/other errors (they must surface)', () => {
    expect(shouldFallBackToDefault(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(shouldFallBackToDefault(new DOMException('busy', 'NotReadableError'))).toBe(false);
    expect(shouldFallBackToDefault(new Error('boom'))).toBe(false);
  });

  it('recognises an OverconstrainedError-shaped object by name', () => {
    expect(shouldFallBackToDefault({ name: 'OverconstrainedError', constraint: 'deviceId' })).toBe(true);
  });
});

describe('constraints for a virtual camera on a desktop', () => {
  const cfg = { width: 640, height: 480, facingMode: 'user' as const, frameRate: 30 };

  it('asks for no facing direction when a camera was chosen', () => {
    // A phone bridged over USB presents as an ordinary camera with no front/back to it.
    // Asking for one can only push the browser away from the camera that was picked.
    const c = buildVideoConstraints(cfg, 'camo-device-id');
    expect(c.facingMode).toBeUndefined();
    expect(c.deviceId).toEqual({ exact: 'camo-device-id' });
  });

  it('asks for no facing direction on a desktop even with no camera chosen', () => {
    // There is no user-facing camera to prefer on a desktop; the constraint is noise
    // that a virtual camera may not advertise at all.
    expect(buildVideoConstraints(cfg, undefined, { mobile: false }).facingMode).toBeUndefined();
    expect(buildVideoConstraints(cfg, undefined, { mobile: true }).facingMode).toBe('user');
  });

  it('asks for the resolution it was given, as ideal, so a camera can still say no', () => {
    const c = buildVideoConstraints({ ...cfg, width: 1920, height: 1080 }, 'x');
    expect(c.width).toEqual({ ideal: 1920 });
    expect(c.height).toEqual({ ideal: 1080 });
  });

  it('offers the three resolutions a virtual camera is worth retrying at', () => {
    // Virtual cameras commonly deliver colour at one mode and luma-only at another, so
    // the fix for a grey picture is often simply a different size.
    expect(CAMERA_RESOLUTIONS.map((r) => `${r.width}x${r.height}`))
      .toEqual(['640x480', '1280x720', '1920x1080']);
  });
});
