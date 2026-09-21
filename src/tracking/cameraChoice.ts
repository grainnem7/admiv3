/**
 * The camera and size the facilitator last got working, remembered for next time.
 *
 * A workshop starts by plugging something in and finding the combination that works.
 * Making them find it again every session is the difference between a five-minute setup
 * and a twenty-minute one, and it is always the same rig in the same room.
 *
 * Deliberately separate from any screen's own config: the camera is a property of the
 * DEVICE, not of the player or the piece.
 */
/**
 * The sizes worth offering, and worth RETRYING at.
 *
 * A virtual camera — a phone bridged over USB, a capture app — often negotiates a
 * different pixel format per resolution, and can deliver proper colour at one and a
 * luma-only (black-and-white) picture at another. So the resolution is not just a
 * quality setting here: changing it is the first thing to try when the colour vanishes.
 */
export const CAMERA_RESOLUTIONS = [
  { width: 640, height: 480, label: '640 × 480' },
  { width: 1280, height: 720, label: '1280 × 720' },
  { width: 1920, height: 1080, label: '1920 × 1080' },
] as const;

export const CAMERA_CHOICE_KEY = 'admi-camera-choice';

export interface CameraChoice {
  deviceId: string;
  label: string;
  width: number;
  height: number;
}

const DEFAULT_SIZE = CAMERA_RESOLUTIONS[0];

export function defaultCameraChoice(): CameraChoice {
  return { deviceId: '', label: '', width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height };
}

/** A size we actually offer; anything else falls back rather than being passed on. */
export function knownResolution(width: unknown, height: unknown): { width: number; height: number } {
  const match = CAMERA_RESOLUTIONS.find((r) => r.width === width && r.height === height);
  return match ? { width: match.width, height: match.height } : { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height };
}

export function loadCameraChoice(): CameraChoice {
  try {
    const raw = localStorage.getItem(CAMERA_CHOICE_KEY);
    if (!raw) return defaultCameraChoice();
    const o = JSON.parse(raw) as Record<string, unknown>;
    const size = knownResolution(o.width, o.height);
    return {
      deviceId: typeof o.deviceId === 'string' ? o.deviceId : '',
      label: typeof o.label === 'string' ? o.label : '',
      ...size,
    };
  } catch {
    return defaultCameraChoice();
  }
}

/**
 * Remember a choice. Only call this once the feed has been SEEN to work — remembering a
 * combination that delivered no colour would hand the same failure back next session.
 */
export function saveCameraChoice(choice: CameraChoice): void {
  try {
    localStorage.setItem(CAMERA_CHOICE_KEY, JSON.stringify(choice));
  } catch {
    /* private window: the choice just won't survive the session */
  }
}

/** Sizes to try, the remembered one first, then the others in order. */
export function resolutionsToTry(from: { width: number; height: number }): { width: number; height: number }[] {
  const first = knownResolution(from.width, from.height);
  const rest = CAMERA_RESOLUTIONS
    .filter((r) => r.width !== first.width || r.height !== first.height)
    .map((r) => ({ width: r.width, height: r.height }));
  return [first, ...rest];
}
