/**
 * Which build of ADMI this page is. Set when the app is built (Vite's `define`, see
 * vite.config.ts); the development server makes a new one each time it starts. The laptop
 * and the iPad compare theirs, so an iPad page left open in Safari from before an update
 * (without that update's protections) reloads itself, or the laptop says so.
 */
export const BUILD_ID: string = typeof __ADMI_BUILD_ID__ === 'string' ? __ADMI_BUILD_ID__ : 'dev';

/** Where the iPad remembers the laptop build it last reloaded for (this tab only). */
const RELOADED_FOR_KEY = 'admi-remote-reloaded-for';

/** The laptop build this iPad tab last reloaded for, or null. */
export function reloadedFor(): string | null {
  try { return sessionStorage.getItem(RELOADED_FOR_KEY); } catch { return null; }
}

/**
 * Reload the page to get the laptop's build, remembering that it was for `laptop` first.
 * If that can't be remembered nothing is reloaded: a reload that might repeat for ever is
 * worse than an old page, which the laptop names.
 */
export function reloadFor(laptop: string): void {
  try { sessionStorage.setItem(RELOADED_FOR_KEY, laptop); } catch { return; }
  reloadPage.current();
}

/** The reload itself (replaced in the tests, where a page can't reload). */
export const reloadPage = { current: (): void => { window.location.reload(); } };
