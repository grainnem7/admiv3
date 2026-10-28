/**
 * Focus never drops to the page. When a pressed button goes away, focus moves to what took
 * its place (its opposite, such as Start ↔ Stop) or to the next step, so a keyboard or
 * screen-reader user carries on from there rather than from the top of the page (T1-04,
 * T4-09).
 */

/** The ▶ Play / ■ Stop button: one button whose words change, so focus stays on it. */
export const PLAY_STOP_ID = 'bs-play-stop';

/** Focus has fallen to the page: nothing, or the page itself, has it. */
export function focusDropped(): boolean {
  const el = document.activeElement;
  return el === null || el === document.body || el === document.documentElement;
}

/**
 * Once `pressed` has gone from the page, put focus on `target`, waiting for it a frame at a
 * time up to `withinMs` (a piece starts only once its sound is ready). While `pressed` is
 * still there nothing moves: a press that only got Stop ready keeps focus where it is. It
 * stands down if focus is somewhere else by then, so it never pulls the player back.
 * Resolves with the element it focused, or null.
 */
export function focusWhenGone(
  target: () => HTMLElement | null | undefined,
  pressed: Element | null = document.activeElement,
  withinMs = 10_000,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    if (pressed === null || pressed === document.body) { resolve(null); return; }
    const until = performance.now() + withinMs;
    const look = (): void => {
      const late = performance.now() >= until;
      if (pressed.isConnected) { if (late) resolve(null); else requestAnimationFrame(look); return; }
      if (!focusDropped()) { resolve(null); return; }
      const el = target();
      if (el && el.isConnected && !(el instanceof HTMLButtonElement && el.disabled)) {
        el.focus();
        resolve(document.activeElement === el ? el : null);
        return;
      }
      if (late) resolve(null); else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}
