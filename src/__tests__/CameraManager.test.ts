import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildVideoConstraints, shouldFallBackToDefault, CameraManager } from '../tracking/CameraManager';

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
  it('uses facingMode when no device is chosen (browser default camera)', () => {
    const v = buildVideoConstraints(CFG);
    expect(v.facingMode).toBe('user');
    expect(v.deviceId).toBeUndefined();
    expect(v.width).toEqual({ ideal: 640 });
    expect(v.height).toEqual({ ideal: 480 });
    expect(v.frameRate).toEqual({ ideal: 30 });
  });

  it('treats an empty device id as the browser default', () => {
    const v = buildVideoConstraints(CFG, '');
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
