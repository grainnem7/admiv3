/**
 * Whether the camera debug panel is shown.
 *
 * Off by default: it is a diagnostic for when a camera misbehaves, not part of the
 * instrument. Turned on with `?cameradebug=1` in the address bar, or by setting
 * `admi-camera-debug` in localStorage — either works in a workshop without a rebuild,
 * which is the point, because the cameras that fail are never the ones on this desk.
 */
export const CAMERA_DEBUG_KEY = 'admi-camera-debug';

export function cameraDebugEnabled(search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  try {
    const param = new URLSearchParams(search).get('cameradebug');
    if (param !== null) return param !== '0' && param !== 'false';
    return localStorage.getItem(CAMERA_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Turn it on (or off) for this browser, so it survives a reload. */
export function setCameraDebug(on: boolean): void {
  try {
    if (on) localStorage.setItem(CAMERA_DEBUG_KEY, '1');
    else localStorage.removeItem(CAMERA_DEBUG_KEY);
  } catch {
    /* private window: the query parameter still works */
  }
}
