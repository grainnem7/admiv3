/**
 * Is the other side of the iPad link really there? A Wi-Fi link can stall with both
 * sockets still "open": nothing gets through, and both screens said all was well for
 * about 13 s while the iPad's touches were lost (audit 2026-10-30, B2).
 *
 * Each side now says something at least once every HEARTBEAT_MS (the iPad a hello, the
 * laptop its state). Hearing nothing from the other side for LOST_AFTER_MS means it is
 * not reaching: 3.5 heartbeats, so one late heartbeat on a busy machine is not a loss.
 * Once lost, it counts as back only after RECOVER_MS of steady contact, so a link that
 * hiccups never flickers between the two.
 */

/** How often each side speaks, at least. */
export const HEARTBEAT_MS = 1000;
/** Silence from the other side for this long: lost. At least 3 heartbeats. */
export const LOST_AFTER_MS = 3500;
/** After a loss: this long of steady contact before it counts as back. */
export const RECOVER_MS = 1500;
/** A gap longer than this between two messages breaks "steady contact". */
const CONTACT_GAP_MS = 2 * HEARTBEAT_MS;

export interface LinkReach {
  /** The other side is reaching this one now. */
  reaching: boolean;
  /** It has been lost at least once (so coming back waits for steady contact). */
  lostOnce: boolean;
  /** When steady contact began (since the last loss), or null. */
  contactSince: number | null;
  /** When the other side was last heard, or null. */
  lastHeard: number | null;
}

export const LINK_REACH_START: LinkReach = { reaching: false, lostOnce: false, contactSince: null, lastHeard: null };

/** A message from the other side, at `now` (ms). */
export function heardFromOther(s: LinkReach, now: number): LinkReach {
  const steady = s.lastHeard !== null && now - s.lastHeard <= CONTACT_GAP_MS;
  const contactSince = steady && s.contactSince !== null ? s.contactSince : now;
  // The first contact counts at once; after a loss it has to hold for a while.
  const reaching = s.reaching || !s.lostOnce || now - contactSince >= RECOVER_MS;
  return { reaching, lostOnce: s.lostOnce, contactSince, lastHeard: now };
}

/** Looked at regularly (and whenever the link drops): silence long enough is a loss. */
export function checkReach(s: LinkReach, now: number, linkUp: boolean): LinkReach {
  if (!linkUp || s.lastHeard === null || now - s.lastHeard > LOST_AFTER_MS) {
    if (!s.reaching && s.contactSince === null) return s;
    return { reaching: false, lostOnce: s.lostOnce || s.reaching, contactSince: null, lastHeard: s.lastHeard };
  }
  // Coming back is decided only by what is heard (heardFromOther), never by a look.
  return s;
}
