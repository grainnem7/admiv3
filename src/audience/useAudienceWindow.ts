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
export type AudienceNotice = 'asking' | 'placed' | 'drag' | 'blocked';

/** The words for each, plain: the person reading them runs the show, not the code. */
export function audienceNoticeText(n: AudienceNotice): string {
  switch (n) {
    case 'asking':
      return 'Your browser is asking whether ADMI may manage windows. Choose Allow: then the audience screen goes straight onto the projector.';
    case 'placed':
      return 'The audience screen is on the projector. If it doesn’t fill the screen, click it once.';
    case 'drag':
      return 'Drag the audience screen to the projector, then click it to fill the screen.';
    case 'blocked':
      return 'The audience screen didn’t open: the browser may have blocked it. Allow pop-ups for ADMI, then press Open the audience screen again.';
    default:
      return '';
  }
}

/** How long a notice stays. */
const NOTICE_MS = 30_000;
/** A window that hasn't said it is there by now didn't open. */
const OPEN_WAIT_MS = 8000;

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
  // Waiting to hear from a window just opened.
  const waitRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const feed = createAudienceFeed(new BroadcastChannel(AUDIENCE_CHANNEL));
    feedRef.current = feed;
    const check = (): void => {
      const alive = feed.alive(performance.now());
      if (alive && waitRef.current !== null) { window.clearTimeout(waitRef.current); waitRef.current = null; }
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
    if (waitRef.current !== null) window.clearTimeout(waitRef.current);
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
    if (waitRef.current !== null) window.clearTimeout(waitRef.current);
    waitRef.current = window.setTimeout(() => {
      waitRef.current = null;
      if (!feedRef.current?.alive(performance.now())) say('blocked');
    }, OPEN_WAIT_MS);
  }, [say]);

  const closeWindow = useCallback((): void => {
    feedRef.current?.send({ kind: 'close' });
    say(null);
  }, [say]);

  return { feedRef, open, notice, openWindow, closeWindow };
}
