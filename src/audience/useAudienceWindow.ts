/**
 * The laptop page's handle on the audience screen: the feed it sends through, whether an
 * audience window is open, and the button's work (open it and put it on the projector, or
 * close it). One per laptop page; after a reload the new page finds an open window again by
 * itself (it says hello, the window answers).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createAudienceFeed, type AudienceFeed } from './feed';
import { openAudienceWindow, placePermission } from './placement';
import { AUDIENCE_CHANNEL } from './protocol';

/** What the laptop says about the audience screen, for a while after the button. */
export type AudienceNotice = 'asking' | 'placed' | 'drag' | 'oneScreen' | 'stillOpening' | 'blocked';

/** The words for each, plain: the person reading them runs the show, not the code. */
export function audienceNoticeText(n: AudienceNotice): string {
  switch (n) {
    case 'asking':
      return 'Your browser is asking whether ADMI may manage windows. Choose Allow: then the audience screen goes straight onto the projector.';
    // Clicking the projector window leaves the keyboard there: Space and Shift+S would go
    // to it, so the notice sends the owner back to the laptop (B5).
    case 'placed':
      return 'The audience screen is on the projector. If it doesn’t fill the screen, click it once, then click back on this laptop screen.';
    case 'drag':
      return 'Drag the audience screen to the projector, then click it to fill the screen, then click back on this laptop screen.';
    case 'oneScreen':
      return 'Only one screen found. Is the projector set to Extend (Windows key + P)?';
    case 'stillOpening':
      return 'Still opening the audience screen…';
    case 'blocked':
      return 'The audience screen didn’t open: the browser may have blocked it. Allow pop-ups for ADMI, then press Open the audience screen again.';
    default:
      return '';
  }
}

/** How long a notice stays. */
const NOTICE_MS = 30_000;
/** A window that hasn't said it is there by now is slow: say it is still opening. */
const STILL_OPENING_MS = 8000;
/** Only by now did it really not open (a busy laptop can take more than 8 s, B26). */
const OPEN_WAIT_MS = 20_000;

/**
 * What to say about a window opened `msSinceOpen` ago that has (`alive`) or hasn't said it
 * is there yet: nothing, "still opening" after 8 s, "didn't open" only after about 20 s.
 */
export function openingNotice(msSinceOpen: number, alive: boolean): 'stillOpening' | 'blocked' | null {
  if (alive) return null;
  if (msSinceOpen >= OPEN_WAIT_MS) return 'blocked';
  return msSinceOpen >= STILL_OPENING_MS ? 'stillOpening' : null;
}

export function useAudienceWindow(): {
  feedRef: MutableRefObject<AudienceFeed | null>;
  open: boolean;
  notice: AudienceNotice | null;
  openWindow(): void;
  closeWindow(): void;
} {
  const feedRef = useRef<AudienceFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<AudienceNotice | null>(null);
  const permissionRef = useRef<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const timersRef = useRef<number[]>([]);
  // Waiting to hear from a window just opened: the two looks (8 s and 20 s).
  const waitRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const feed = createAudienceFeed(new BroadcastChannel(AUDIENCE_CHANNEL));
    feedRef.current = feed;
    const check = (): void => {
      const alive = feed.alive(performance.now());
      if (alive && waitRef.current.length > 0) {
        waitRef.current.forEach((t) => window.clearTimeout(t));
        waitRef.current = [];
        setNotice((cur) => (cur === 'stillOpening' ? null : cur));
      }
      setOpen(alive);
    };
    feed.onChange(check);
    // A window that closed without a word (closed by the browser, crashed) is gone after a while.
    const id = window.setInterval(check, 1000);
    void placePermission().then((p) => { permissionRef.current = p; });
    return () => {
      window.clearInterval(id);
      feedRef.current = null;
      feed.close();
    };
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    waitRef.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const say = useCallback((n: AudienceNotice | null): void => {
    setNotice(n);
    if (n === null) return;
    timersRef.current.push(window.setTimeout(() => setNotice((cur) => (cur === n ? null : cur)), NOTICE_MS));
  }, []);

  const openWindow = useCallback((): void => {
    const permission = permissionRef.current;
    void openAudienceWindow({ permission, asking: () => say('asking') }).then((outcome) => {
      say(outcome);
      void placePermission().then((p) => { permissionRef.current = p; });
    });
    // Whether it opened is known only when it says it is there.
    waitRef.current.forEach((t) => window.clearTimeout(t));
    const openedAt = performance.now();
    const look = (): void => {
      const n = openingNotice(performance.now() - openedAt, feedRef.current?.alive(performance.now()) === true);
      if (n !== null) say(n);
    };
    waitRef.current = [window.setTimeout(look, STILL_OPENING_MS), window.setTimeout(look, OPEN_WAIT_MS)];
  }, [say]);

  const closeWindow = useCallback((): void => {
    feedRef.current?.send({ kind: 'close' });
    say(null);
  }, [say]);

  return { feedRef, open, notice, openWindow, closeWindow };
}
