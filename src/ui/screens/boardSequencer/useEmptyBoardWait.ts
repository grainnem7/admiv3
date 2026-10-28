import { useEffect, useRef } from 'react';

/** How often the board is looked at while New loop waits for it to be cleared. */
export const EMPTY_CHECK_MS = 100;

/** One look at the board: the counters still down that would sound, and how long a clear board must stay clear (null = at once). */
export interface BoardLook { sounding: number; settleMs: number | null }

/**
 * "Lift the counters to start from silence": while `waiting`, the board is looked at again
 * and again, and `onSeen` hears how many counters that would sound are still down (0 once
 * it is clear). On the laptop board a clear board counts at once (a click is certain); a
 * camera board must stay clear for the settle window, never ending on one flickery frame.
 * One look that still saw a counter can never leave it waiting for good, on "Lift the 0
 * counters" (T2-03, T1-05). Each look is the latest `look` given: the one from when the
 * wait began read the camera board as it was then, so on a stopped camera board the
 * counters lifted were never seen and Keep never came.
 */
export function useEmptyBoardWait(waiting: boolean, look: () => BoardLook, onSeen: (count: number) => void): void {
  const lookRef = useRef(look);
  lookRef.current = look;
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  useEffect(() => {
    if (!waiting) return undefined;
    let emptySince: number | null = null;
    const check = (): void => {
      const { sounding, settleMs } = lookRef.current();
      if (sounding > 0) { emptySince = null; onSeenRef.current(sounding); return; }
      if (settleMs !== null) {
        emptySince ??= performance.now();
        if (performance.now() - emptySince < settleMs) return;
      }
      onSeenRef.current(0);
    };
    check();
    const id = window.setInterval(check, EMPTY_CHECK_MS);
    return () => window.clearInterval(id);
  }, [waiting]);
}
