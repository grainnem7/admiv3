/**
 * Putting the audience screen on the projector (spec 2026-10-29, Goal 1).
 *
 * Chrome and Edge can place a window on another screen once the person allows it to
 * "manage windows" (the Window Management API: getScreenDetails). Then the audience window
 * goes onto the second screen and fills it. Without it (another browser, the question
 * refused, or only one screen), the person drags it there; a click on it then fills the
 * screen. Nothing here may fail where the API is missing.
 */
import { AUDIENCE_CHANNEL, AUDIENCE_PATH, type LaptopMessage } from './protocol';

/** The part of a screen's details used here (the browser's ScreenDetailed). */
export interface ScreenInfo {
  left: number;
  top: number;
  width: number;
  height: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary?: boolean;
  isInternal?: boolean;
}

export type PlaceAsk =
  | { api: false }
  | { api: true; granted: false }
  | { api: true; granted: true; screens: readonly ScreenInfo[]; current: ScreenInfo | null };

export type Placement =
  | { kind: 'screen'; left: number; top: number; width: number; height: number }
  | { kind: 'drag'; why: 'no-api' | 'refused' | 'one-screen' };

const same = (a: ScreenInfo, b: ScreenInfo): boolean =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/**
 * Where the audience window goes: the whole of a screen the laptop page is not on (one that
 * is not the laptop's own built-in screen, if there is a choice), or a drag.
 */
export function choosePlacement(ask: PlaceAsk): Placement {
  if (!ask.api) return { kind: 'drag', why: 'no-api' };
  if (!ask.granted) return { kind: 'drag', why: 'refused' };
  const others = ask.screens.filter((s) => !ask.current || !same(s, ask.current));
  if (others.length === 0 || ask.screens.length < 2) return { kind: 'drag', why: 'one-screen' };
  const best = others.find((s) => s.isInternal === false) ?? others.find((s) => s.isPrimary === false) ?? others[0];
  return { kind: 'screen', left: best.left, top: best.top, width: best.width, height: best.height };
}

// ---- In the browser ----

interface ScreenDetailsLike { screens: readonly ScreenInfo[]; currentScreen: ScreenInfo | null }
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };

/** The browser can place windows on other screens (Chrome, Edge). */
export function canPlaceWindows(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithScreens).getScreenDetails === 'function';
}

/** Whether the "manage windows" question has been answered: 'granted', 'denied', or 'prompt' (not yet). */
export async function placePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (!canPlaceWindows()) return 'unknown';
  try {
    const st = await navigator.permissions.query({ name: 'window-management' as PermissionName });
    return st.state;
  } catch {
    return 'unknown';
  }
}

/** Ask for the screens (this is when the browser asks the question, the first time). */
async function askScreens(): Promise<PlaceAsk> {
  const w = window as WindowWithScreens;
  if (!w.getScreenDetails) return { api: false };
  try {
    const d = await w.getScreenDetails();
    return { api: true, granted: true, screens: d.screens, current: d.currentScreen };
  } catch {
    return { api: true, granted: false };
  }
}

/** The window's name: opening it again reaches the same window. */
const WINDOW_NAME = 'admi-audience';
const FEATURES_DEFAULT = 'popup,width=960,height=540';

/** Where it went. (Whether it opened at all is known only when it says it is there.) */
export type OpenOutcome = 'placed' | 'drag' | 'oneScreen';

/**
 * What the laptop says about a placement. Only one screen found usually means the
 * projector mirrors the laptop: the audience would see the whole Show view (B5).
 */
export function outcomeOf(place: Placement): OpenOutcome {
  if (place.kind === 'screen') return 'placed';
  return place.why === 'one-screen' ? 'oneScreen' : 'drag';
}

/**
 * Open the audience window and put it on the projector. `asking` runs just before the
 * browser may ask its question, so the laptop can say why.
 *
 * The window is opened without a link back to this page (noopener): it is its own page,
 * drawn by its own process where the browser allows, so drawing it never competes with
 * the music on this page. It is told where to go over the channel.
 */
export async function openAudienceWindow(opts: {
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
  asking(): void;
}): Promise<OpenOutcome> {
  const url = new URL(AUDIENCE_PATH, window.location.href).toString();
  // Allowed already: straight onto the projector, filling it.
  if (opts.permission === 'granted') {
    const ask = await askScreens();
    const place = choosePlacement(ask);
    if (place.kind === 'screen') {
      window.open(url, WINDOW_NAME, `noopener,popup,left=${place.left},top=${place.top},width=${place.width},height=${place.height}`);
      return 'placed';
    }
    window.open(url, WINDOW_NAME, `noopener,${FEATURES_DEFAULT}`);
    return outcomeOf(place);
  }
  // Not yet: open it first (the click allows that), then ask, then move it.
  window.open(url, WINDOW_NAME, `noopener,${FEATURES_DEFAULT}`);
  if (!canPlaceWindows()) return 'drag';
  if (opts.permission === 'prompt') opts.asking();
  const place = choosePlacement(await askScreens());
  if (place.kind !== 'screen') return outcomeOf(place);
  // The audience window moves itself (the browser lets a window it opened as a pop-up be
  // moved, and to another screen once windows may be placed). It may still be loading:
  // the message is sent a few times.
  const msg: LaptopMessage = { kind: 'place', left: place.left, top: place.top, width: place.width, height: place.height };
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(AUDIENCE_CHANNEL);
    let n = 0;
    const id = window.setInterval(() => {
      ch.postMessage(msg);
      if (++n >= 6) { window.clearInterval(id); ch.close(); }
    }, 500);
  }
  return 'placed';
}
